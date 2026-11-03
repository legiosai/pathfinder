import { emptyProfile, rank, LEVELS } from './lib/match.js';
import { buildPlan, estimateHours, toICS, toMarkdown } from './lib/planner.js';

const MAX_COMPARE = 4;
const KEYS = { profile: 'pathfinder:profile', compare: 'pathfinder:compare', progress: 'pathfinder:progress:' };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- storage (never required: private windows can throw) ----------
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
      /* storage unavailable: the page still works for this visit */
    }
  },
};

// ---------- helpers ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');

let DATA = null;
let BY_ID = new Map();
let LABELS = {};
let profile = emptyProfile();
let compare = [];

function fee(cert) {
  const usd = cert.fee.usd;
  if (usd == null) return 'Regional price';
  if (usd === 0) return 'Free';
  return `US$${usd % 1 ? usd.toFixed(2) : usd}`;
}

function duration(cert) {
  const m = cert.exam.minutes;
  if (!m) return cert.exam.style === 'practical' ? 'Practical' : 'Not published';
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
}

function tags(cert) {
  const out = [
    `<span class="tag">${esc(LABELS[cert.level])}</span>`,
    `<span class="tag">${esc(fee(cert))}</span>`,
    `<span class="tag">${esc(duration(cert))}</span>`,
    `<span class="tag">${esc(LABELS[cert.exam.style])}</span>`,
  ];
  if (cert.status !== 'available') out.push(`<span class="tag ${cert.status}">${esc(LABELS[cert.status])}</span>`);
  return out.join('');
}

function actions(cert, { detail = true } = {}) {
  const inCompare = compare.includes(cert.id);
  const full = !inCompare && compare.length >= MAX_COMPARE;
  return `<div class="actions">
    ${detail ? `<button type="button" data-act="detail" data-id="${esc(cert.id)}">Details</button>` : ''}
    <button type="button" data-act="compare" data-id="${esc(cert.id)}" class="${inCompare ? 'on' : ''}" aria-pressed="${inCompare}" ${full ? 'disabled title="Compare holds four at most"' : ''}>${inCompare ? 'In compare' : 'Compare'}</button>
    <button type="button" data-act="plan" data-id="${esc(cert.id)}">Plan</button>
  </div>`;
}

function card(cert, result) {
  const score = result
    ? `<div class="score"><b>${result.score}</b><small>match</small></div>`
    : '';
  const why = result && result.reasons.length
    ? `<ul class="reasons">${result.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`
    : '';
  const warn = result && result.warnings.length
    ? `<ul class="warnings">${result.warnings.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`
    : '';
  const excluded = result && result.excluded ? `<p class="excluded-note">${esc(result.excluded)}</p>` : '';
  return `<article class="card${result && result.excluded ? ' excluded' : ''}">
    <div class="card-head">
      <div class="card-title">
        <h3>${esc(cert.name)}</h3>
        <div class="sub">${esc(cert.provider)} · ${esc(cert.code)}</div>
      </div>
      ${score}
    </div>
    ${result ? `<div class="meter" aria-hidden="true"><i style="width:${result.score}%"></i></div>` : ''}
    <div class="meta">${tags(cert)}</div>
    <p>${esc(cert.scope)}</p>
    ${excluded}${why}${warn}
    ${actions(cert)}
  </article>`;
}

// ---------- routing ----------
function parseHash() {
  const raw = location.hash.replace(/^#/, '');
  const [name, query = ''] = raw.split('?');
  return { name: name || 'match', params: new URLSearchParams(query) };
}

function go(name, params) {
  const q = params ? `?${new URLSearchParams(params)}` : '';
  location.hash = `${name}${q}`;
}

let lastView = null;

function route() {
  const { name, params } = parseHash();
  const view = ['match', 'browse', 'compare', 'plan', 'about', 'cert'].includes(name) ? name : 'match';
  const shown = view === 'cert' ? 'browse' : view;
  if (shown !== lastView) window.scrollTo(0, 0);
  lastView = shown;
  $$('.view').forEach((v) => (v.hidden = v.id !== `view-${shown}`));
  $$('nav a').forEach((a) => {
    if (a.dataset.route === shown) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (shown === 'match') renderMatch();
  if (shown === 'browse') renderBrowse();
  if (shown === 'compare') {
    const ids = (params.get('ids') || '').split(',').filter((id) => BY_ID.has(id)).slice(0, MAX_COMPARE);
    if (ids.length) setCompare(ids);
    renderCompare();
  }
  if (shown === 'plan') enterPlan(params);
  if (view === 'cert' && BY_ID.has(params.get('id'))) openDetail(params.get('id'));
  document.title = shown === 'match' ? 'pathfinder' : `${shown[0].toUpperCase()}${shown.slice(1)} · pathfinder`;
}

// ---------- compare list ----------
function setCompare(ids) {
  compare = ids;
  store.set(KEYS.compare, compare);
  const c = $('#compare-count');
  c.textContent = compare.length;
  c.hidden = compare.length === 0;
}

function toggleCompare(id) {
  if (compare.includes(id)) setCompare(compare.filter((x) => x !== id));
  else if (compare.length < MAX_COMPARE) setCompare([...compare, id]);
  refreshCurrent();
}

function refreshCurrent() {
  const { name } = parseHash();
  if (name === 'match' || !name) renderMatch();
  else if (name === 'browse' || name === 'cert') renderBrowse();
  else if (name === 'compare') renderCompare();
}

// ---------- match ----------
function chipHtml(name, id, label, checked) {
  return `<label class="chip"><input type="checkbox" name="${name}" value="${esc(id)}" ${checked ? 'checked' : ''}><span>${esc(label)}</span></label>`;
}

function fillProfileForm() {
  const t = DATA.taxonomy;
  $('#roles').innerHTML = t.roles.map((r) => chipHtml('roles', r.id, r.label, profile.roles.includes(r.id))).join('');
  $('#known').innerHTML = t.skills.map((s) => chipHtml('known', s.id, s.label, profile.known.includes(s.id))).join('');
  $('#want').innerHTML = t.skills.map((s) => chipHtml('want', s.id, s.label, profile.want.includes(s.id))).join('');
  const f = $('#profile-form');
  $$('input[name="experience"]', f).forEach((r) => (r.checked = r.value === profile.experience));
  f.budget.value = profile.budget ?? '';
  f.style.value = profile.style;
  f.includeRestricted.checked = profile.includeRestricted;
}

function readProfileForm() {
  const f = $('#profile-form');
  const checked = (name) => $$(`input[name="${name}"]:checked`, f).map((i) => i.value);
  const budget = f.budget.value.trim();
  profile = {
    roles: checked('roles'),
    known: checked('known'),
    want: checked('want'),
    experience: ($('input[name="experience"]:checked', f) || {}).value || 'some',
    budget: budget === '' ? null : Math.max(0, Number(budget)),
    style: f.style.value,
    includeRestricted: f.includeRestricted.checked,
  };
  store.set(KEYS.profile, profile);
}

function renderMatch() {
  const results = rank(DATA.certifications, profile, LABELS);
  const shown = results.filter((r) => !r.excluded);
  const hidden = results.filter((r) => r.excluded);
  const empty = !profile.roles.length && !profile.known.length && !profile.want.length;
  const top = shown.slice(0, 10);
  const rest = shown.slice(10);
  const head = `<div class="results-head"><span>${empty ? 'Pick a role and some skills to personalize the ranking.' : `${shown.length} matches, best first`}</span></div>`;
  const list = (rs) => rs.map((r) => card(BY_ID.get(r.id), r)).join('');
  $('#match-results').innerHTML =
    head +
    (top.length ? list(top) : '<p class="empty">Nothing fits these filters. Raise the budget or include restricted credentials.</p>') +
    (rest.length ? `<details class="more"><summary>Show ${rest.length} more</summary><div class="results">${list(rest)}</div></details>` : '') +
    (hidden.length ? `<details class="more"><summary>${hidden.length} left out by budget or eligibility</summary><div class="results">${list(hidden)}</div></details>` : '');
}

// ---------- browse ----------
function fillFilters() {
  const f = $('#filters');
  const opt = (v, l) => `<option value="${esc(v)}">${esc(l)}</option>`;
  const providers = [...new Set(DATA.certifications.map((c) => c.provider))].sort();
  f.provider.innerHTML = opt('', 'All') + providers.map((p) => opt(p, p)).join('');
  f.level.innerHTML = opt('', 'All') + DATA.taxonomy.levels.map((l) => opt(l.id, l.label)).join('');
  f.status.innerHTML = opt('', 'All') + DATA.taxonomy.statuses.map((s) => opt(s.id, s.label)).join('');
  f.style.innerHTML = opt('', 'All') + DATA.taxonomy.styles.map((s) => opt(s.id, s.label)).join('');
}

function renderBrowse() {
  const f = $('#filters');
  const q = f.q.value.trim().toLowerCase();
  const maxFee = f.maxFee.value.trim() === '' ? null : Number(f.maxFee.value);
  let list = DATA.certifications.filter((c) => {
    if (f.provider.value && c.provider !== f.provider.value) return false;
    if (f.level.value && c.level !== f.level.value) return false;
    if (f.status.value && c.status !== f.status.value) return false;
    if (f.style.value && c.exam.style !== f.style.value) return false;
    if (maxFee != null && (c.fee.usd == null || c.fee.usd > maxFee)) return false;
    if (q) {
      const hay = [c.name, c.code, c.provider, c.scope, c.category, ...c.skills.map((s) => LABELS[s])].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const by = f.sort.value;
  const num = (v) => (v == null ? Infinity : v);
  list = list.sort((a, b) => {
    if (by === 'fee') return num(a.fee.usd) - num(b.fee.usd) || a.name.localeCompare(b.name);
    if (by === 'minutes') return num(a.exam.minutes) - num(b.exam.minutes) || a.name.localeCompare(b.name);
    if (by === 'level') return LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
  $('#browse-summary').textContent = `${list.length} of ${DATA.certifications.length} certifications from ${new Set(DATA.certifications.map((c) => c.provider)).size} providers. Provider facts checked ${DATA.checked_range}.`;
  $('#browse-results').innerHTML = list.length
    ? list.map((c) => card(c)).join('')
    : '<p class="empty">No certification matches these filters.</p>';
}

// ---------- compare ----------
function domainsHtml(cert) {
  if (!cert.domains.length) return '<span class="muted">Not in the catalog yet</span>';
  const max = Math.max(...cert.domains.map((d) => d.weight));
  return `<ul class="domains">${cert.domains
    .map(
      (d) => `<li><span>${esc(d.name)}</span><span>${d.weight}%</span><div class="meter"><i style="width:${(d.weight / max) * 100}%"></i></div></li>`,
    )
    .join('')}</ul>`;
}

function renderCompare() {
  const certs = compare.map((id) => BY_ID.get(id)).filter(Boolean);
  const body = $('#compare-body');
  if (!certs.length) {
    body.innerHTML = '<p class="empty">Nothing to compare yet. Use the Compare button on any certification.</p>';
    return;
  }
  const link = `${location.origin}${location.pathname}#compare?ids=${certs.map((c) => c.id).join(',')}`;
  const rows = [
    ['Provider', (c) => esc(c.provider)],
    ['Code', (c) => esc(c.code)],
    ['Level', (c) => esc(LABELS[c.level])],
    ['Registration', (c) => esc(LABELS[c.status]) + (c.requirements ? `<br><small>${esc(c.requirements)}</small>` : '')],
    ['Fee', (c) => `${esc(fee(c))}<br><small>${esc(c.fee.basis)}</small>`],
    ['Exam length', (c) => esc(duration(c))],
    ['Assessment', (c) => esc(LABELS[c.exam.style])],
    ['Questions', (c) => esc(c.exam.questions || 'See format')],
    ['Passing score', (c) => esc(c.exam.passing || 'Not in catalog')],
    ['Validity', (c) => esc(c.exam.validity || 'Not in catalog')],
    ['Format', (c) => esc(c.exam.format)],
    ['Scope', (c) => esc(c.scope)],
    ['Domains', (c) => domainsHtml(c)],
    ['AI during exam', (c) => esc(c.ai_policy || 'Check issuer rules')],
    ['Skills', (c) => esc(c.skills.map((s) => LABELS[s]).join(', '))],
    ['Checked on', (c) => esc(c.checked_on)],
  ];
  body.innerHTML = `
    <div class="share"><button type="button" id="copy-compare">Copy link</button><code>${esc(link)}</code></div>
    <div class="table-wrap"><table class="compare">
      <thead><tr><th scope="col"><span class="sr">Field</span></th>${certs
        .map(
          (c) => `<th scope="col">${esc(c.name)}<div class="actions">
            <button type="button" data-act="detail" data-id="${esc(c.id)}">Details</button>
            <button type="button" data-act="plan" data-id="${esc(c.id)}">Plan</button>
            <button type="button" data-act="compare" data-id="${esc(c.id)}">Remove</button></div></th>`,
        )
        .join('')}</tr></thead>
      <tbody>${rows
        .map(([label, fn]) => `<tr><th scope="row">${label}</th>${certs.map((c) => `<td>${fn(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody>
    </table></div>`;
  $('#copy-compare').addEventListener('click', (e) => copy(link, e.currentTarget));
}

// ---------- detail dialog ----------
let openId = null;

function openDetail(id) {
  const c = BY_ID.get(id);
  if (!c) return;
  openId = id;
  const sources = c.sources.map((s) => DATA.sources[s]).filter(Boolean);
  const reports = c.reports.map((r) => DATA.reports[r]).filter(Boolean);
  const fact = (label, value) => (value ? `<div class="fact"><span>${label}</span><b>${esc(value)}</b></div>` : '');
  $('#detail-body').innerHTML = `
    <div class="dialog-head">
      <div><h2 id="detail-title">${esc(c.name)}</h2><div class="sub">${esc(c.provider)} · ${esc(c.code)} · ${esc(c.category)}</div></div>
      <button type="button" data-act="close" aria-label="Close">Close</button>
    </div>
    <div class="facts">
      ${fact('Fee', `${fee(c)} · ${c.fee.basis}`)}
      ${fact('Exam length', duration(c))}
      ${fact('Assessment', LABELS[c.exam.style])}
      ${fact('Level', LABELS[c.level])}
      ${fact('Questions', c.exam.questions)}
      ${fact('Passing score', c.exam.passing)}
      ${fact('Validity', c.exam.validity)}
      ${fact('Registration', LABELS[c.status])}
    </div>
    <p>${esc(c.scope)}</p>
    ${c.requirements ? `<p class="note">${esc(c.requirements)}</p>` : ''}
    <div class="section-label">Format</div><p>${esc(c.exam.format)}</p>
    ${c.fee.note ? `<div class="section-label">About the fee</div><p>${esc(c.fee.note)}</p>` : ''}
    ${c.ai_policy ? `<div class="section-label">AI during the exam</div><p>${esc(c.ai_policy)}</p>` : ''}
    ${c.domains.length ? `<div class="section-label">Exam domains</div>${domainsHtml(c)}<p><small>${esc(c.domains_note || '')}</small></p>` : ''}
    ${c.caveats.length ? `<div class="section-label">Caveats</div>${c.caveats.map((x) => `<p class="note">${esc(x)}</p>`).join('')}` : ''}
    <div class="section-label">Sources (checked ${esc(c.checked_on)})</div>
    <ul class="refs">${sources
      .map((s) => `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>${s.note ? `<small>${esc(s.note)}</small>` : ''}</li>`)
      .join('')}</ul>
    ${reports.length ? `<div class="section-label">Candidate reports (${reports.length})</div>
      <p><small>Self-reported experiences. They show how people prepared; they do not set a pass rate.</small></p>
      ${reports
        .map(
          (r) => `<div class="report"><a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a> <small>· ${esc(r.platform)}</small>
          <p>${esc(r.summary)}</p>
          ${r.effort ? `<p><small>Effort: ${esc(r.effort)}</small></p>` : ''}
          ${r.background ? `<p><small>Background: ${esc(r.background)}</small></p>` : ''}
          ${r.limitations ? `<p><small>Limits: ${esc(r.limitations)}</small></p>` : ''}</div>`,
        )
        .join('')}`
      : ''}
    <div class="detail-actions">${actions(c, { detail: false })}</div>`;
  const dlg = $('#detail');
  if (!dlg.open) dlg.showModal();
}

// ---------- plan ----------
let hoursTouched = false;

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fillPlanForm() {
  const f = $('#plan-form');
  const groups = {};
  for (const c of [...DATA.certifications].sort((a, b) => a.name.localeCompare(b.name))) {
    (groups[c.provider] ||= []).push(c);
  }
  f.cert.innerHTML = Object.keys(groups)
    .sort()
    .map((p) => `<optgroup label="${esc(p)}">${groups[p].map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${esc(c.code)})</option>`).join('')}</optgroup>`)
    .join('');
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const order = [1, 2, 3, 4, 5, 6, 0];
  $('#days').innerHTML = order.map((d) => chipHtml('days', d, names[d], [1, 3, 5, 6].includes(d))).join('');
  f.start.value = todayLocal();
}

function setEstimate() {
  const f = $('#plan-form');
  const cert = BY_ID.get(f.cert.value);
  const levelHours = Object.fromEntries(DATA.taxonomy.levels.map((l) => [l.id, l.hours]));
  const est = estimateHours(cert, profile, levelHours);
  if (!hoursTouched) f.hours.value = est.hours;
  $('#hours-hint').textContent = `Suggested ${est.hours} h for your profile (range ${est.low}–${est.high} h for ${LABELS[cert.level]} level). A rough guess: adjust it after your baseline session.`;
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
  if (params.get('days')) {
    const days = params.get('days').split(',');
    $$('input[name="days"]', f).forEach((i) => (i.checked = days.includes(i.value)));
  }
  f.dataset.init = '1';
  setEstimate();
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
    days: $$('input[name="days"]:checked', f).map((i) => i.value).join(','),
  };
}

let currentPlan = null;

function renderPlan() {
  const f = $('#plan-form');
  const out = $('#plan-output');
  const cert = BY_ID.get(f.cert.value);
  const days = $$('input[name="days"]:checked', f).map((i) => Number(i.value));
  try {
    currentPlan = buildPlan({
      cert,
      hours: Number(f.hours.value),
      start: f.start.value || todayLocal(),
      days,
      sessionMinutes: Number(f.sessionMinutes.value),
      startTime: f.startTime.value || '19:00',
    });
  } catch (err) {
    currentPlan = null;
    out.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    return;
  }
  const p = currentPlan;
  const progressKey = `${KEYS.progress}${p.cert.id}:${p.sessions[0].date}`;
  const done = new Set(store.get(progressKey, []));
  // Calendar weeks, Monday first, counted from the week the plan starts in.
  const first = new Date(`${p.sessions[0].date}T00:00:00Z`);
  const monday = new Date(first);
  monday.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const weeks = new Map();
  for (const s of p.sessions) {
    const week = Math.floor((new Date(`${s.date}T00:00:00Z`) - monday) / (7 * 86400000)) + 1;
    if (!weeks.has(week)) weeks.set(week, []);
    weeks.get(week).push(s);
  }
  const sessionHtml = (s) => `<li class="session${done.has(s.n) ? ' done' : ''}" data-kind="${s.kind}">
        <input type="checkbox" data-n="${s.n}" aria-label="Mark session ${s.n} done" ${done.has(s.n) ? 'checked' : ''}>
        <span class="when">${s.weekday} ${s.date}</span>
        <span class="what"><b>${esc(s.title)}</b><p>${esc(s.detail)}</p></span>
        <span class="len">${s.minutes} min</span></li>`;
  const items = [...weeks]
    .map(([w, list]) => `<h3 class="week">Week ${w}</h3><ol class="sessions">${list.map(sessionHtml).join('')}</ol>`)
    .join('');
  const pct = Math.round((done.size / p.sessions.length) * 100);
  out.innerHTML = `
    <div class="plan-summary">
      <div class="stat"><b>${p.sessions.length}</b><span>sessions</span></div>
      <div class="stat"><b>${p.hours} h</b><span>planned</span></div>
      <div class="stat"><b>${p.weeks}</b><span>week${p.weeks === 1 ? '' : 's'}</span></div>
      <div class="stat"><b>${p.examDate}</b><span>earliest exam date</span></div>
      <div class="actions">
        <button type="button" id="dl-ics" class="primary">Add to calendar (.ics)</button>
        <button type="button" id="dl-md">Download .md</button>
        <button type="button" id="copy-plan">Copy link</button>
        <button type="button" id="print-plan">Print</button>
      </div>
    </div>
    <div class="progress"><div class="meter" aria-label="Progress"><i style="width:${pct}%"></i></div><small>${done.size} of ${p.sessions.length} done</small></div>
    ${p.inferredTopics ? '<p class="note">This certification has no published domain weights in the catalog, so topics were read from its scope summary. Replace them with the official exam objectives.</p>' : ''}
    <p class="hint">Book the exam only after the last mock goes well. Progress is saved in this browser.</p>
    ${items}`;
  $$('#plan-output input[type="checkbox"]').forEach((box) =>
    box.addEventListener('change', () => {
      const n = Number(box.dataset.n);
      if (box.checked) done.add(n);
      else done.delete(n);
      store.set(progressKey, [...done]);
      box.closest('.session').classList.toggle('done', box.checked);
      const pctNow = Math.round((done.size / p.sessions.length) * 100);
      $('#plan-output .progress i').style.width = `${pctNow}%`;
      $('#plan-output .progress small').textContent = `${done.size} of ${p.sessions.length} done`;
    }),
  );
  $('#dl-ics').addEventListener('click', () => download(`${p.cert.id}-plan.ics`, toICS(p), 'text/calendar'));
  $('#dl-md').addEventListener('click', () => download(`${p.cert.id}-plan.md`, toMarkdown(p), 'text/markdown'));
  $('#print-plan').addEventListener('click', () => window.print());
  $('#copy-plan').addEventListener('click', (e) => {
    const link = `${location.origin}${location.pathname}#plan?${new URLSearchParams(planParams())}`;
    copy(link, e.currentTarget);
  });
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
    const id = btn.dataset.id;
    if (btn.dataset.act === 'detail') openDetail(id);
    if (btn.dataset.act === 'compare') {
      toggleCompare(id);
      if ($('#detail').open) openDetail(openId);
    }
    if (btn.dataset.act === 'plan') {
      $('#detail').close();
      hoursTouched = false;
      go('plan', { cert: id });
    }
    if (btn.dataset.act === 'close') $('#detail').close();
  });
  const dlg = $('#detail');
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener('close', () => {
    if (parseHash().name === 'cert') history.replaceState(null, '', '#browse');
  });

  const pf = $('#profile-form');
  pf.addEventListener('change', () => {
    readProfileForm();
    renderMatch();
  });
  pf.addEventListener('input', (e) => {
    if (e.target.name === 'budget') {
      readProfileForm();
      renderMatch();
    }
  });
  $('#reset-profile').addEventListener('click', () => {
    profile = emptyProfile();
    store.set(KEYS.profile, profile);
    fillProfileForm();
    renderMatch();
  });

  $('#filters').addEventListener('input', renderBrowse);
  $('#filters').addEventListener('submit', (e) => e.preventDefault());

  const plan = $('#plan-form');
  plan.addEventListener('submit', (e) => e.preventDefault());
  plan.addEventListener('input', (e) => {
    if (e.target.name === 'hours') hoursTouched = true;
    if (e.target.name === 'cert') {
      hoursTouched = false;
      setEstimate();
    }
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
    $('#loading').textContent = `Could not load the catalog (${err.message}). Reload the page to try again.`;
    return;
  }
  DATA.reports = Object.fromEntries(DATA.reports.map((r) => [r.id, r]));
  BY_ID = new Map(DATA.certifications.map((c) => [c.id, c]));
  const t = DATA.taxonomy;
  for (const group of [t.levels, t.statuses, t.styles, t.roles, t.skills]) for (const x of group) LABELS[x.id] = x.label;
  const dates = DATA.certifications.map((c) => c.checked_on).sort();
  DATA.checked_range = dates[0] === dates.at(-1) ? `on ${dates[0]}` : `between ${dates[0]} and ${dates.at(-1)}`;

  profile = { ...emptyProfile(), ...store.get(KEYS.profile, {}) };
  setCompare(store.get(KEYS.compare, []).filter((id) => BY_ID.has(id)).slice(0, MAX_COMPARE));

  $('#hours-note').textContent = t.hours_note + ' Ranges: ' + t.levels.map((l) => `${l.label} ${l.hours[0]}–${l.hours[1]} h`).join(', ') + '.';
  $('#data-note').textContent = `The catalog lists ${DATA.certifications.length} certifications from ${new Set(DATA.certifications.map((c) => c.provider)).size} providers, with ${Object.keys(DATA.sources).length} issuer and reference sources and ${Object.keys(DATA.reports).length} candidate reports. Facts were checked ${DATA.checked_range}.`;
  $('#foot-data').textContent = `Catalog built ${DATA.generated_on}`;

  fillProfileForm();
  fillFilters();
  fillPlanForm();
  bind();
  $('#loading').remove();
  route();
}

init();
