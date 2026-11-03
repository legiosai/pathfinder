import { emptyProfile, rank } from './lib/match.js';
import { buildPlan, estimateHours, planTopics, toICS, toMarkdown, KIND_LABEL, KIND_DETAIL } from './lib/planner.js';

const MAX_COMPARE = 4;
const KEYS = {
  profile: 'pathfinder:profile',
  compare: 'pathfinder:compare',
  progress: 'pathfinder:progress:',
  confidence: 'pathfinder:confidence:',
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Storage is optional: private windows can throw, and the page still works.
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* not saved this visit */
    }
  },
};

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const ext = (url, text) => `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;

let DATA = null;
let BY_ID = new Map();
let LABELS = {};
let profile = emptyProfile();
let compare = [];

// ---------- formatting ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function utc(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function day(iso, { weekday = true, year = false } = {}) {
  const d = utc(iso);
  return `${weekday ? `${DAYS[d.getUTCDay()]} ` : ''}${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ''}`;
}

function span(a, b) {
  const x = utc(a);
  const y = utc(b);
  if (x.getUTCMonth() === y.getUTCMonth()) return `${x.getUTCDate()}–${y.getUTCDate()} ${MONTHS[y.getUTCMonth()]}`;
  return `${day(a, { weekday: false })} – ${day(b, { weekday: false })}`;
}

function len(m) {
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`;
}

function fee(cert) {
  const usd = cert.fee.usd;
  if (usd == null) return 'Varies';
  if (usd === 0) return 'Free';
  return `US$${usd % 1 ? usd.toFixed(2) : usd}`;
}

function duration(cert) {
  const m = cert.exam.minutes;
  if (!m) return cert.exam.style === 'practical' ? 'Practical' : '—';
  return len(m);
}

const FLAG = { restricted: 'Restricted', upcoming: 'Not open yet' };

// ---------- routing ----------
function parseHash() {
  const raw = location.hash.replace(/^#/, '');
  const [name, query = ''] = raw.split('?');
  return { name, params: new URLSearchParams(query) };
}

const VIEWS = { '': 'list', list: 'list', browse: 'list', match: 'list', cert: 'cert', compare: 'compare', plan: 'plan', about: 'about' };
let lastView = null;
let lastCert = null;
let listScroll = 0;

function route() {
  const { name, params } = parseHash();
  let view = VIEWS[name] || 'list';
  const certId = params.get('id');
  if (view === 'cert' && !BY_ID.has(certId)) view = 'list';

  if (lastView === 'list' && view !== 'list') listScroll = window.scrollY;
  $$('.view').forEach((v) => (v.hidden = v.id !== `view-${view}`));
  $$('nav a').forEach((a) => {
    const current = a.dataset.route === (view === 'cert' ? 'list' : view);
    if (current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (view === 'list') {
    if (name === 'match') setProfileOpen(true);
    renderList();
  }
  if (view === 'cert') renderCert(certId);
  if (view === 'compare') {
    const ids = (params.get('ids') || '').split(',').filter((id) => BY_ID.has(id)).slice(0, MAX_COMPARE);
    if (ids.length) setCompare(ids);
    renderCompare();
  }
  if (view === 'plan') enterPlan(params);

  const moved = view !== lastView || (view === 'cert' && certId !== lastCert);
  if (moved) window.scrollTo(0, view === 'list' ? listScroll : 0);
  lastView = view;
  lastCert = view === 'cert' ? certId : null;

  const titles = { list: 'pathfinder', compare: 'Compare', plan: 'Study plan', about: 'About' };
  document.title = view === 'cert' ? `${BY_ID.get(certId).name} · pathfinder` : view === 'list' ? 'pathfinder' : `${titles[view]} · pathfinder`;
}

// ---------- compare ----------
function setCompare(ids) {
  compare = ids;
  store.set(KEYS.compare, compare);
  $('#compare-count').textContent = compare.length;
  $('#nav-compare').hidden = compare.length === 0;
}

function toggleCompare(id) {
  if (compare.includes(id)) setCompare(compare.filter((x) => x !== id));
  else if (compare.length < MAX_COMPARE) setCompare([...compare, id]);
}

function compareButton(cert) {
  const inCompare = compare.includes(cert.id);
  const full = !inCompare && compare.length >= MAX_COMPARE;
  return `<button type="button" data-act="compare" data-id="${esc(cert.id)}" aria-pressed="${inCompare}" ${full ? 'disabled title="Compare holds four at most"' : ''}>${inCompare ? 'Added to compare' : 'Compare'}</button>`;
}

// ---------- list ----------
function chip(name, value, label, checked) {
  return `<label class="chip"><input type="checkbox" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''}><span>${esc(label)}</span></label>`;
}

function profileActive() {
  return profile.roles.length + profile.known.length + profile.want.length > 0;
}

function fillProfile() {
  const t = DATA.taxonomy;
  $('#want').innerHTML = t.skills.map((s) => chip('want', s.id, s.label, profile.want.includes(s.id))).join('');
  $('#known').innerHTML = t.skills.map((s) => chip('known', s.id, s.label, profile.known.includes(s.id))).join('');
  $('#roles').innerHTML = t.roles.map((r) => chip('roles', r.id, r.label, profile.roles.includes(r.id))).join('');
  $$('#experience input').forEach((r) => (r.checked = r.value === profile.experience));
  updateForMe();
}

function readProfile() {
  const f = $('#profile');
  const checked = (name) => $$(`input[name="${name}"]:checked`, f).map((i) => i.value);
  profile = {
    ...profile,
    roles: checked('roles'),
    known: checked('known'),
    want: checked('want'),
    experience: ($('input[name="experience"]:checked', f) || {}).value || 'some',
  };
  store.set(KEYS.profile, profile);
  updateForMe();
}

function updateForMe() {
  const n = profile.roles.length + profile.known.length + profile.want.length;
  $('#for-me').textContent = n ? `For me · ${n}` : 'For me';
}

function setProfileOpen(open) {
  $('#profile').hidden = !open;
  $('#for-me').setAttribute('aria-expanded', String(open));
}

function fillFilters() {
  const f = $('#filters');
  const opt = (v, l) => `<option value="${esc(v)}">${esc(l)}</option>`;
  const providers = [...new Set(DATA.certifications.map((c) => c.provider))].sort();
  f.provider.innerHTML = opt('', 'All providers') + providers.map((p) => opt(p, p)).join('');
  f.level.innerHTML = opt('', 'All levels') + DATA.taxonomy.levels.map((l) => opt(l.id, l.label)).join('');
}

function scoring() {
  // Filters handle price; restricted credentials stay listed with a flag.
  if (!profileActive()) return null;
  const results = rank(DATA.certifications, { ...profile, budget: null, includeRestricted: true, style: 'any' }, LABELS);
  return new Map(results.map((r) => [r.id, r]));
}

function renderList() {
  const f = $('#filters');
  const q = f.q.value.trim().toLowerCase();
  const maxFee = f.price.value === '' ? null : Number(f.price.value);
  const scores = scoring();
  const all = DATA.certifications;
  let list = all.filter((c) => {
    if (f.provider.value && c.provider !== f.provider.value) return false;
    if (f.level.value && c.level !== f.level.value) return false;
    if (maxFee != null && (c.fee.usd == null || c.fee.usd > maxFee)) return false;
    if (q) {
      const hay = [c.name, c.code, c.provider, c.scope, c.category, ...c.skills.map((s) => LABELS[s])].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  list = list.sort((a, b) =>
    scores ? scores.get(b.id).score - scores.get(a.id).score || a.name.localeCompare(b.name) : a.name.localeCompare(b.name),
  );

  const count = list.length === all.length ? `${all.length} certifications` : `${list.length} of ${all.length}`;
  const head = $('#list-head');
  head.classList.toggle('scored', Boolean(scores));
  head.innerHTML = `<span>${count}${scores ? ', best match first' : ''}</span><span class="col">Level</span><span class="col">Price</span><span class="col">Exam</span>${scores ? '<span class="col score">Match</span>' : ''}`;
  $('#certs').classList.toggle('scored', Boolean(scores));
  $('#certs').innerHTML = list.length
    ? list
        .map(
          (c) => `<li class="cert-row"><a href="#cert?id=${esc(c.id)}">
            <span class="name"><b>${esc(c.name)}</b><small>${esc(c.provider)} · ${esc(c.code)}${FLAG[c.status] ? `<span class="flag">${FLAG[c.status]}</span>` : ''}</small></span>
            <span class="cell level">${esc(LABELS[c.level])}</span>
            <span class="cell price">${esc(fee(c))}</span>
            <span class="cell len">${esc(duration(c))}</span>
            ${scores ? `<span class="cell score" title="Match score">${scores.get(c.id).score}</span>` : ''}
          </a></li>`,
        )
        .join('')
    : '<li class="empty">Nothing matches. Try fewer filters.</li>';
}

// ---------- certification page ----------
const PREP_LABEL = { 'official-guide': 'Official guide', course: 'Course', docs: 'Docs', practice: 'Practice' };

function domainsHtml(cert, { bars = true } = {}) {
  const max = Math.max(...cert.domains.map((d) => d.weight));
  return `<ul class="domains">${cert.domains
    .map(
      (d) => `<li><span>${esc(d.name)}</span>${bars ? `<span class="bar"><i style="width:${(d.weight / max) * 100}%"></i></span>` : ''}<span class="pct">${d.weight}%</span></li>`,
    )
    .join('')}</ul>`;
}

function prepHtml(cert) {
  return `<ul class="links">${cert.prep
    .map(
      (r) => `<li><span class="kind">${esc(PREP_LABEL[r.kind] || r.kind)}${r.cost === 'paid' ? ', paid' : ''}</span><span>${ext(r.url, r.title)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span></li>`,
    )
    .join('')}</ul>`;
}

function renderCert(id) {
  const c = BY_ID.get(id);
  const sources = c.sources.map((s) => DATA.sources[s]).filter(Boolean);
  const reports = c.reports.map((r) => DATA.reports[r]).filter(Boolean);
  const official = sources[0];
  const fact = (label, value) => (value ? `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>` : '');
  const scores = scoring();
  const mine = scores && scores.get(c.id);
  const notes = [
    c.requirements && c.status === 'restricted' ? c.requirements : null,
    c.exam.format,
    c.fee.note,
    c.ai_policy ? `AI during the exam: ${c.ai_policy}` : null,
    ...c.caveats,
  ].filter(Boolean);

  $('#cert-body').innerHTML = `
    <a class="back" href="#">← Certifications</a>
    <p class="eyebrow">${esc(c.provider)} · ${esc(c.code)}</p>
    <h1>${esc(c.name)}</h1>
    <p class="lede">${esc(c.scope)}</p>
    <div class="cert-actions">
      <a class="btn primary" href="#plan?cert=${esc(c.id)}">Plan your study</a>
      ${compareButton(c)}
      ${official ? `<a class="btn" href="${esc(safeUrl(official.url))}" target="_blank" rel="noopener noreferrer">Issuer page ↗</a>` : ''}
    </div>
    <dl class="facts">
      ${fact('Price', `${fee(c)}${c.fee.basis ? ` · ${c.fee.basis}` : ''}`)}
      ${fact('Exam', duration(c))}
      ${fact('Questions', c.exam.questions)}
      ${fact('Passing score', c.exam.passing)}
      ${fact('Valid for', c.exam.validity)}
      ${fact('Level', LABELS[c.level])}
      ${fact('Format', LABELS[c.exam.style])}
      ${fact('Registration', LABELS[c.status])}
    </dl>
    ${mine ? `<section class="block"><h2>For you · ${mine.score}/100</h2><ul class="why">${mine.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}${mine.warnings.map((w) => `<li class="warn">${esc(w)}</li>`).join('')}</ul></section>` : ''}
    ${c.domains.length ? `<section class="block"><h2>Exam domains</h2>${domainsHtml(c)}${c.domains_note ? `<p class="hint domains-note">${esc(c.domains_note)}</p>` : ''}</section>` : ''}
    ${c.prep && c.prep.length ? `<section class="block"><h2>Prepare with</h2>${prepHtml(c)}</section>` : ''}
    ${notes.length ? `<section class="block"><h2>Good to know</h2>${notes.map((n) => `<p>${esc(n)}</p>`).join('')}</section>` : ''}
    <section class="block">
      <details class="more"><summary>Sources, checked ${esc(day(c.checked_on, { weekday: false, year: true }))}</summary>
        <ul class="links">${sources.map((s) => `<li><span class="kind">${esc((s.kind || '').split(' / ')[0])}</span><span>${ext(s.url, s.title)}${s.note ? `<small>${esc(s.note)}</small>` : ''}</span></li>`).join('')}</ul>
      </details>
      ${reports.length ? `<details class="more"><summary>What candidates report (${reports.length})</summary>
        <p class="hint">Self-reported. Useful for how people prepared, not for pass rates.</p>
        ${reports.map((r) => `<div class="report">${ext(r.url, r.title)} <span class="muted">· ${esc(r.platform)}</span><p>${esc(r.summary)}</p>${r.effort ? `<p>Effort: ${esc(r.effort)}</p>` : ''}</div>`).join('')}
      </details>` : ''}
    </section>`;
}

// ---------- compare page ----------
function renderCompare() {
  const certs = compare.map((id) => BY_ID.get(id)).filter(Boolean);
  const body = $('#compare-body');
  if (!certs.length) {
    body.innerHTML = '<p class="empty">Nothing here yet. Open a certification and choose Compare.</p>';
    return;
  }
  const link = `${location.origin}${location.pathname}#compare?ids=${certs.map((c) => c.id).join(',')}`;
  const rows = [
    ['Price', (c) => esc(fee(c))],
    ['Exam', (c) => esc(duration(c))],
    ['Questions', (c) => esc(c.exam.questions || '—')],
    ['Passing score', (c) => esc(c.exam.passing || '—')],
    ['Valid for', (c) => esc(c.exam.validity || '—')],
    ['Level', (c) => esc(LABELS[c.level])],
    ['Format', (c) => esc(LABELS[c.exam.style])],
    ['Registration', (c) => esc(LABELS[c.status])],
    ['Domains', (c) => (c.domains.length ? domainsHtml(c, { bars: false }) : '—')],
    ['AI in the exam', (c) => esc(c.ai_policy || '—')],
    ['Checked', (c) => esc(day(c.checked_on, { weekday: false, year: true }))],
  ];
  body.innerHTML = `
    <div class="compare-tools">
      <button type="button" class="text" id="copy-compare">Copy link</button>
      <button type="button" class="text" id="clear-compare">Clear</button>
    </div>
    <div class="table-wrap"><table class="compare">
      <thead><tr><th scope="col"><span class="sr">Field</span></th>${certs
        .map(
          (c) => `<th scope="col"><a href="#cert?id=${esc(c.id)}">${esc(c.name)}</a><small>${esc(c.provider)} · ${esc(c.code)}</small>
            <button type="button" class="text" data-act="compare" data-id="${esc(c.id)}">Remove</button></th>`,
        )
        .join('')}</tr></thead>
      <tbody>${rows.map(([label, fn]) => `<tr><th scope="row">${label}</th>${certs.map((c) => `<td>${fn(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  $('#copy-compare').addEventListener('click', (e) => copy(link, e.currentTarget));
  $('#clear-compare').addEventListener('click', () => {
    setCompare([]);
    renderCompare();
  });
}

// ---------- plan ----------
let hoursTouched = false;
let suggested = null;

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fillPlanForm() {
  const f = $('#plan-form');
  const groups = {};
  for (const c of [...DATA.certifications].sort((a, b) => a.name.localeCompare(b.name))) (groups[c.provider] ||= []).push(c);
  f.cert.innerHTML = Object.keys(groups)
    .sort()
    .map((p) => `<optgroup label="${esc(p)}">${groups[p].map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${esc(c.code)})</option>`).join('')}</optgroup>`)
    .join('');
  $('#days').innerHTML = [1, 2, 3, 4, 5, 6, 0]
    .map((d) => `<label title="${DAY_NAMES[d]}"><input type="checkbox" name="days" value="${d}" aria-label="${DAY_NAMES[d]}" ${[1, 3, 5, 6].includes(d) ? 'checked' : ''}><span>${DAYS[d]}</span></label>`)
    .join('');
  f.start.value = todayLocal();
}

function setEstimate() {
  const f = $('#plan-form');
  const cert = BY_ID.get(f.cert.value);
  const levelHours = Object.fromEntries(DATA.taxonomy.levels.map((l) => [l.id, l.hours]));
  const est = estimateHours(cert, profile, levelHours);
  suggested = est.hours;
  if (!hoursTouched) f.hours.value = est.hours;
  updateHint();
}

function updateHint() {
  const f = $('#plan-form');
  const cert = BY_ID.get(f.cert.value);
  const off = Number(f.hours.value) !== suggested;
  $('#hours-hint').innerHTML = `Suggested: ${suggested} h for ${esc(LABELS[cert.level].toLowerCase())} level${off ? ` · <button type="button" class="text" data-act="use-hours">use it</button>` : ''}`;
}

function confidenceKey(id) {
  return `${KEYS.confidence}${id}`;
}

function renderConfidence() {
  const cert = BY_ID.get($('#plan-form').cert.value);
  const { topics } = planTopics(cert);
  const saved = store.get(confidenceKey(cert.id), {});
  $('#confidence-rows').innerHTML = topics
    .map((t, i) => {
      const current = saved[t.name] || 3;
      const options = [1, 2, 3, 4, 5]
        .map((n) => `<label><input type="radio" name="conf-${i}" value="${n}" data-topic="${esc(t.name)}" ${n === current ? 'checked' : ''}><span>${n}</span></label>`)
        .join('');
      return `<div class="conf-row"><span>${esc(t.name)}</span><div class="scale" role="radiogroup" aria-label="Confidence in ${esc(t.name)}">${options}</div></div>`;
    })
    .join('');
  const rated = Object.keys(saved).length;
  $('#confidence summary').textContent = rated ? `Rate your topics · ${rated} rated` : 'Rate your topics';
}

function readConfidence() {
  const out = {};
  $$('#confidence-rows input:checked').forEach((i) => {
    if (i.value !== '3') out[i.dataset.topic] = Number(i.value);
  });
  return out;
}

function enterPlan(params) {
  const f = $('#plan-form');
  const id = params.get('cert');
  if (id && BY_ID.has(id) && f.cert.value !== id) {
    f.cert.value = id;
    hoursTouched = false;
  } else if (!id && !f.dataset.init && compare.length) {
    f.cert.value = compare[0];
  }
  if (params.get('hours')) {
    f.hours.value = params.get('hours');
    hoursTouched = true;
  }
  if (params.get('start')) f.start.value = params.get('start');
  if (params.get('len')) f.sessionMinutes.value = params.get('len');
  if (params.get('time')) f.startTime.value = params.get('time');
  if (params.get('exam')) f.targetDate.value = params.get('exam');
  if (params.get('days')) {
    const days = params.get('days').split(',');
    $$('input[name="days"]', f).forEach((i) => (i.checked = days.includes(i.value)));
  }
  f.dataset.init = '1';
  setEstimate();
  renderConfidence();
  renderPlan();
}

function planParams() {
  const f = $('#plan-form');
  return {
    cert: f.cert.value,
    hours: f.hours.value,
    start: f.start.value,
    len: f.sessionMinutes.value,
    time: f.startTime.value,
    exam: f.targetDate.value,
    days: $$('input[name="days"]:checked', f).map((i) => i.value).join(','),
  };
}

function deadlineLine(p) {
  const d = p.deadline;
  if (!d) return `Earliest exam: ${day(p.examDate)}.`;
  if (d.fits) {
    return `<span class="ok">Fits before your exam on ${day(d.targetDate)}${d.spare ? `, ${d.spare} spare day${d.spare === 1 ? '' : 's'}` : ''}.</span>`;
  }
  const fixes = [];
  if (d.suggestedMinutes) fixes.push(`${len(d.suggestedMinutes)} sessions`);
  fixes.push('more days');
  fixes.push(`an exam on ${day(p.examDate)} or later`);
  return `<span class="bad">Does not fit before ${day(d.targetDate)}: ${d.needed} sessions, ${d.available} study days. Try ${fixes.slice(0, -1).join(', ')} or ${fixes.at(-1)}.</span>`;
}

function renderPlan() {
  const f = $('#plan-form');
  const out = $('#plan-output');
  const cert = BY_ID.get(f.cert.value);
  const days = $$('input[name="days"]:checked', f).map((i) => Number(i.value));
  let p;
  try {
    p = buildPlan({
      cert,
      hours: Number(f.hours.value),
      start: f.start.value || todayLocal(),
      days,
      sessionMinutes: Number(f.sessionMinutes.value),
      startTime: f.startTime.value || '19:00',
      confidence: readConfidence(),
      targetDate: f.targetDate.value || null,
    });
  } catch (err) {
    out.innerHTML = `<p class="empty">${esc(err.message)}.</p>`;
    return;
  }
  const progressKey = `${KEYS.progress}${p.cert.id}:${p.sessions[0].date}`;
  const done = new Set(store.get(progressKey, []));

  // Calendar weeks, Monday first.
  const first = utc(p.sessions[0].date);
  const monday = new Date(first);
  monday.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const weeks = new Map();
  for (const s of p.sessions) {
    const w = Math.floor((utc(s.date) - monday) / (7 * 86400000));
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w).push(s);
  }
  const iso = (dt) => dt.toISOString().slice(0, 10);
  const weekRange = (w) => {
    const a = new Date(monday);
    a.setUTCDate(monday.getUTCDate() + w * 7);
    const b = new Date(a);
    b.setUTCDate(a.getUTCDate() + 6);
    return span(iso(a), iso(b));
  };
  const row = (s) => `<li class="session${done.has(s.n) ? ' done' : ''}" data-kind="${s.kind}">
      <input type="checkbox" data-n="${s.n}" aria-label="Session ${s.n} done" ${done.has(s.n) ? 'checked' : ''}>
      <span class="when">${day(s.date)}</span>
      <span class="what"><span class="kind">${KIND_LABEL[s.kind]}</span>${esc(cap(s.name))}</span>
      <span class="len">${len(s.minutes)}</span></li>`;
  const list = [...weeks]
    .map(([w, items], i) => `<h3 class="week">Week ${i + 1} · ${weekRange(w)}</h3><ol class="sessions">${items.map(row).join('')}</ol>`)
    .join('');
  const last = p.sessions.at(-1).date;
  const kinds = [...new Set(p.sessions.map((s) => s.kind))];
  const mockDetail = p.sessions.find((s) => s.kind === 'mock')?.detail;

  out.innerHTML = `
    <div class="plan-head">
      <div>
        <h2>${p.sessions.length} sessions · ${p.hours} h</h2>
        <p>${day(p.sessions[0].date)} to ${day(last)}. ${deadlineLine(p)}</p>
      </div>
      <div class="plan-actions">
        <button type="button" class="primary" id="dl-ics">Add to calendar</button>
        <button type="button" class="text" id="dl-md">Markdown</button>
        <button type="button" class="text" id="copy-plan">Copy link</button>
        <button type="button" class="text" id="print-plan">Print</button>
      </div>
    </div>
    <div class="progress" aria-hidden="true"><i style="width:${Math.round((done.size / p.sessions.length) * 100)}%"></i></div>
    <p class="progress-label">${done.size} of ${p.sessions.length} done</p>
    ${p.inferredTopics ? '<p class="note">No official domains in the catalog for this one, so topics come from its summary. Swap in the issuer\'s objectives.</p>' : ''}
    ${list}
    <details class="more keys"><summary>What each session is</summary>
      <dl>${kinds.map((k) => `<dt>${KIND_LABEL[k]}</dt><dd>${esc(k === 'mock' ? mockDetail : KIND_DETAIL[k])}</dd>`).join('')}</dl>
    </details>
    ${cert.prep && cert.prep.length ? `<details class="more"><summary>Resources (${cert.prep.length})</summary>${prepHtml(cert)}</details>` : ''}`;

  $$('#plan-output .session input').forEach((box) =>
    box.addEventListener('change', () => {
      const n = Number(box.dataset.n);
      if (box.checked) done.add(n);
      else done.delete(n);
      store.set(progressKey, [...done]);
      box.closest('.session').classList.toggle('done', box.checked);
      $('#plan-output .progress i').style.width = `${Math.round((done.size / p.sessions.length) * 100)}%`;
      $('#plan-output .progress-label').textContent = `${done.size} of ${p.sessions.length} done`;
    }),
  );
  $('#dl-ics').addEventListener('click', () => download(`${p.cert.id}-plan.ics`, toICS(p), 'text/calendar'));
  $('#dl-md').addEventListener('click', () => download(`${p.cert.id}-plan.md`, toMarkdown(p, { resources: cert.prep || [] }), 'text/markdown'));
  $('#print-plan').addEventListener('click', () => window.print());
  $('#copy-plan').addEventListener('click', (e) => copy(`${location.origin}${location.pathname}#plan?${new URLSearchParams(planParams())}`, e.currentTarget));
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copy(text, button) {
  const before = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy failed';
  }
  setTimeout(() => (button.textContent = before), 1500);
}

// ---------- wiring ----------
function bind() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'compare') {
      toggleCompare(btn.dataset.id);
      const { name, params } = parseHash();
      if (name === 'cert') renderCert(params.get('id'));
      if (name === 'compare') renderCompare();
    }
    if (btn.dataset.act === 'use-hours') {
      hoursTouched = false;
      $('#plan-form').hours.value = suggested;
      updateHint();
      renderPlan();
    }
  });

  $('#filters').addEventListener('input', renderList);
  $('#filters').addEventListener('submit', (e) => e.preventDefault());
  $('#for-me').addEventListener('click', () => setProfileOpen($('#profile').hidden));
  $('#profile').addEventListener('change', () => {
    readProfile();
    renderList();
  });
  $('#reset-profile').addEventListener('click', () => {
    profile = emptyProfile();
    store.set(KEYS.profile, profile);
    fillProfile();
    renderList();
  });

  const plan = $('#plan-form');
  plan.addEventListener('submit', (e) => e.preventDefault());
  plan.addEventListener('input', (e) => {
    if (e.target.name === 'hours') hoursTouched = true;
    if (e.target.name === 'cert') {
      hoursTouched = false;
      setEstimate();
      renderConfidence();
    }
    updateHint();
    renderPlan();
  });
  $('#confidence').addEventListener('change', (e) => {
    if (!e.target.dataset.topic) return;
    const cert = $('#plan-form').cert.value;
    store.set(confidenceKey(cert), readConfidence());
    const rated = Object.keys(readConfidence()).length;
    $('#confidence summary').textContent = rated ? `Rate your topics · ${rated} rated` : 'Rate your topics';
    renderPlan();
  });

  window.addEventListener('hashchange', route);
}

async function init() {
  try {
    const res = await fetch('catalog.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
  } catch (err) {
    $('#loading').textContent = `Could not load the catalog (${err.message}). Reload to try again.`;
    return;
  }
  DATA.reports = Object.fromEntries(DATA.reports.map((r) => [r.id, r]));
  BY_ID = new Map(DATA.certifications.map((c) => [c.id, c]));
  const t = DATA.taxonomy;
  for (const group of [t.levels, t.statuses, t.styles, t.roles, t.skills]) for (const x of group) LABELS[x.id] = x.label;
  const providers = new Set(DATA.certifications.map((c) => c.provider)).size;
  const dates = DATA.certifications.map((c) => c.checked_on).sort();
  const checked = dates[0] === dates.at(-1) ? `on ${day(dates[0], { weekday: false, year: true })}` : `between ${day(dates[0], { weekday: false, year: true })} and ${day(dates.at(-1), { weekday: false, year: true })}`;

  profile = { ...emptyProfile(), ...store.get(KEYS.profile, {}) };
  setCompare(store.get(KEYS.compare, []).filter((id) => BY_ID.has(id)).slice(0, MAX_COMPARE));

  $('#list-lede').textContent = `${DATA.certifications.length} certifications from ${providers} providers. Prices and exam facts from the issuers, with a study planner for each.`;
  $('#hours-note').textContent = `${t.hours_note} Ranges: ${t.levels.map((l) => `${l.label.toLowerCase()} ${l.hours[0]}–${l.hours[1]} h`).join(', ')}.`;
  $('#data-note').textContent = `${DATA.certifications.length} certifications from ${providers} providers, ${Object.keys(DATA.sources).length} sources and ${Object.keys(DATA.reports).length} candidate reports, checked ${checked}.`;
  $('#foot-data').textContent = `Catalog ${day(DATA.generated_on, { weekday: false, year: true })}`;

  fillProfile();
  fillFilters();
  fillPlanForm();
  bind();
  $('#loading').remove();
  route();
}

init();
