import { emptyProfile, rank } from './lib/match.js';
import { buildPlan, estimateHours, planTopics, toICS, toMarkdown, KIND_LABEL, KIND_DETAIL } from './lib/planner.js';
import { providerMark, providerColor, badge, donut, hbars, columns } from './visuals.js';
import Fuse from './vendor/fuse.js';
import confetti from './vendor/confetti.js';

const MAX_COMPARE = 4;
const KEYS = {
  profile: 'pathfinder:profile',
  compare: 'pathfinder:compare',
  progress: 'pathfinder:progress:',
  confidence: 'pathfinder:confidence:',
  theme: 'pathfinder:theme',
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
const ext = (url, html, cls = '') => `<a class="${cls}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${html}</a>`;

let DATA = null;
let BY_ID = new Map();
let LABELS = {};
let profile = emptyProfile();
let compare = [];
let activeCat = '';
let activeProvider = '';
let fuse = null;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- visual vocabulary ----------
const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const CATS = {
  'AI engineering': { icon: 'bot', c: '--cat-ai' },
  'ML foundations': { icon: 'brain-circuit', c: '--cat-ml' },
  'AI security': { icon: 'shield-check', c: '--cat-sec' },
  'Cloud & platform': { icon: 'cloud', c: '--cat-cloud' },
};
const catOf = (c) => CATS[c.category] || { icon: 'layers', c: '--accent' };
const tile = (name, color, size = '') => `<span class="tile ${size}" style="--c:var(${color})">${icon(name)}</span>`;
const catTile = (c, size = '') => tile(catOf(c).icon, catOf(c).c, size);

// Levels as trail difficulty signs.
const SIGN = {
  entry: '<svg viewBox="0 0 14 14" aria-hidden="true"><circle class="entry" cx="7" cy="7" r="6"/></svg>',
  associate: '<svg viewBox="0 0 14 14" aria-hidden="true"><rect class="associate" x="1.5" y="1.5" width="11" height="11" rx="1.5"/></svg>',
  professional: '<svg viewBox="0 0 14 14" aria-hidden="true"><path class="professional" d="M7 .5 13.5 7 7 13.5.5 7z"/></svg>',
  expert: '<svg class="two" viewBox="0 0 26 14" aria-hidden="true"><path class="expert" d="M7 .5 13.5 7 7 13.5.5 7zM19 .5 25.5 7 19 13.5 12.5 7z"/></svg>',
};
const lvl = (level) => `<span class="lvl">${SIGN[level] || ''}${esc(LABELS[level])}</span>`;

const PREP = {
  'official-guide': { icon: 'book-open', label: 'Official guide' },
  course: { icon: 'graduation-cap', label: 'Course' },
  docs: { icon: 'file-text', label: 'Docs' },
  practice: { icon: 'dumbbell', label: 'Practice' },
};

const KIND = {
  baseline: { icon: 'flag' },
  learn: { icon: 'book-open', c: '--k-learn' },
  practice: { icon: 'wrench', c: '--k-practice' },
  mock: { icon: 'timer', c: '--k-mock' },
  review: { icon: 'scan-search' },
  remediate: { icon: 'refresh-cw' },
  final: { icon: 'trophy' },
};
const kindStyle = (k) => (KIND[k].c ? `style="--kc:var(${KIND[k].c})"` : '');
const kindN = (k) => (KIND[k].c ? '' : 'n');

function ring(value, size = 40, cls = '', label = '') {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return `<span class="ring ${cls}" ${label ? `aria-label="${esc(label)}" role="img"` : 'aria-hidden="true"'}>
    <svg width="${size}" height="${size}"><circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}"/>${value > 0 ? `<circle class="val" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-dasharray="${(c * value) / 100} ${c}"/>` : ''}</svg>
    <b>${Math.round(value)}${cls.includes('pct') ? '%' : ''}</b></span>`;
}

function dbar(cert, big = false) {
  return `<div class="dbar${big ? ' lg' : ''}" role="img" aria-label="Exam domain weights">${cert.domains
    .map((d, i) => `<span style="flex:${d.weight};background:var(--d${(i % 8) + 1})" title="${esc(d.name)}: ${d.weight}%"></span>`)
    .join('')}</div>`;
}

function legend(cert) {
  return `<ul class="legend">${cert.domains
    .map((d, i) => `<li><span class="sw" style="background:var(--d${(i % 8) + 1})"></span><span>${esc(d.name)}</span><b>${d.weight}%</b></li>`)
    .join('')}</ul>`;
}

// ---------- formatting ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function utc(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const iso = (dt) => dt.toISOString().slice(0, 10);

function day(s, { weekday = true, year = false } = {}) {
  const d = utc(s);
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

const FLAG = { restricted: ['lock', 'Restricted'], upcoming: ['clock', 'Not open yet'] };
const flag = (c) => (FLAG[c.status] ? `<span class="pill warn">${icon(FLAG[c.status][0])}${FLAG[c.status][1]}</span>` : '');

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
  if (document.startViewTransition && lastView !== null && !reducedMotion()) document.startViewTransition(renderRoute);
  else renderRoute();
}

function renderRoute() {
  const { name, params } = parseHash();
  let view = VIEWS[name] || 'list';
  const certId = params.get('id');
  if (view === 'cert' && !BY_ID.has(certId)) view = 'list';

  if (lastView === 'list' && view !== 'list') listScroll = window.scrollY;
  $$('.view').forEach((v) => (v.hidden = v.id !== `view-${view}`));
  $$('nav a').forEach((a) => {
    if (a.dataset.route === (view === 'cert' ? 'list' : view)) a.setAttribute('aria-current', 'page');
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

  const titles = { compare: 'Compare', plan: 'Study plan', about: 'About' };
  document.title = view === 'cert' ? `${BY_ID.get(certId).name} · pathfinder` : titles[view] ? `${titles[view]} · pathfinder` : 'pathfinder';
}

// ---------- compare state ----------
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

// ---------- list ----------
function chip(name, value, label, checked) {
  return `<label class="chip"><input type="checkbox" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''}><span>${esc(label)}</span></label>`;
}

const profileCount = () => profile.roles.length + profile.known.length + profile.want.length;

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
  const n = profileCount();
  $('#for-me span').textContent = n ? `For me · ${n}` : 'For me';
}

function setProfileOpen(open) {
  $('#profile').hidden = !open;
  $('#for-me').setAttribute('aria-expanded', String(open));
}

function fillFilters() {
  const f = $('#filters');
  const opt = (v, l) => `<option value="${esc(v)}">${esc(l)}</option>`;
  f.level.innerHTML = opt('', 'All levels') + DATA.taxonomy.levels.map((l) => opt(l.id, l.label)).join('');
}

function renderCats() {
  const all = DATA.certifications;
  const count = (cat) => all.filter((c) => c.category === cat).length;
  const btn = (id, label, ic, color, n) =>
    `<button type="button" class="cat" data-cat="${esc(id)}" aria-pressed="${activeCat === id}" style="--c:var(${color})">${tile(ic, color)}<span><b>${esc(label)}</b><small>${n}<span class="w"> certifications</span></small></span></button>`;
  $('#cats').innerHTML =
    btn('', 'Everything', 'layout-grid', '--accent', all.length) +
    Object.entries(CATS)
      .filter(([cat]) => count(cat))
      .map(([cat, m]) => btn(cat, cat, m.icon, m.c, count(cat)))
      .join('');
}

function renderProviders() {
  const all = DATA.certifications;
  const names = [...new Set(all.map((c) => c.provider))].sort((a, b) => all.filter((c) => c.provider === b).length - all.filter((c) => c.provider === a).length || a.localeCompare(b));
  $('#providers').innerHTML = names
    .map((n) => `<button type="button" class="prov" data-prov="${esc(n)}" aria-pressed="${activeProvider === n}">${providerMark(n)}<span>${esc(n)}</span><small>${all.filter((c) => c.provider === n).length}</small></button>`)
    .join('');
}

function scoring() {
  if (!profileCount()) return null;
  const results = rank(DATA.certifications, { ...profile, budget: null, includeRestricted: true, style: 'any' }, LABELS);
  return new Map(results.map((r) => [r.id, r]));
}

function renderList() {
  const f = $('#filters');
  const q = f.q.value.trim().toLowerCase();
  const maxFee = f.price.value === '' ? null : Number(f.price.value);
  const scores = scoring();
  const all = DATA.certifications;
  const hits = q ? new Map(fuse.search(q).map((r, i) => [r.item.id, i])) : null;
  let list = all.filter((c) => {
    if (activeCat && c.category !== activeCat) return false;
    if (activeProvider && c.provider !== activeProvider) return false;
    if (f.level.value && c.level !== f.level.value) return false;
    if (maxFee != null && (c.fee.usd == null || c.fee.usd > maxFee)) return false;
    if (hits && !hits.has(c.id)) return false;
    return true;
  });
  list = list.sort((a, b) => {
    if (scores) return scores.get(b.id).score - scores.get(a.id).score || a.name.localeCompare(b.name);
    if (hits) return hits.get(a.id) - hits.get(b.id);
    return a.name.localeCompare(b.name);
  });
  $$('#cats .cat').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === activeCat)));
  $$('#providers .prov').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.prov === activeProvider)));
  $('#list-head').textContent = `${list.length === all.length ? `All ${all.length}` : `${list.length} of ${all.length}`} certifications${scores ? ', best match first' : ''}`;
  $('#certs').innerHTML = list.length
    ? list.map((c, i) => card(c, scores && scores.get(c.id), i)).join('')
    : '<p class="empty">Nothing matches. Try fewer filters.</p>';
}

const catPill = (c) => `<span class="pill catp" style="--c:var(${catOf(c).c})">${icon(catOf(c).icon)}${esc(c.category)}</span>`;

function card(c, score, i = 0) {
  const inCompare = compare.includes(c.id);
  const full = !inCompare && compare.length >= MAX_COMPARE;
  return `<article class="card cert-card" style="--pc:${providerColor(c.provider)};--i:${Math.min(i, 14)}">
    <div class="row">
      ${badge(c, 58)}
      <div class="top-right">
        ${score ? ring(score.score, 40, '', `Match ${score.score} of 100`) : ''}
        <button type="button" class="btn icon-btn" data-act="compare" data-id="${esc(c.id)}" aria-pressed="${inCompare}" aria-label="${inCompare ? 'Remove from compare' : 'Add to compare'}" title="${inCompare ? 'In compare' : full ? 'Compare holds four' : 'Add to compare'}" ${full ? 'disabled' : ''}>${icon(inCompare ? 'check' : 'plus')}</button>
      </div>
    </div>
    <div>
      <h3><a href="#cert?id=${esc(c.id)}">${esc(c.name)}</a></h3>
      <div class="who">${esc(c.provider)} · ${esc(c.code)}</div>
    </div>
    <div class="tags">${catPill(c)}${flag(c)}</div>
    ${c.domains.length ? dbar(c) : ''}
    <div class="facts-inline">
      <span>${icon('badge-dollar-sign')}${esc(fee(c))}</span>
      <span>${icon('clock')}${esc(duration(c))}</span>
      ${lvl(c.level)}
    </div>
  </article>`;
}

// ---------- certification page ----------
function renderCert(id) {
  const c = BY_ID.get(id);
  const color = catOf(c).c;
  const sources = c.sources.map((s) => DATA.sources[s]).filter(Boolean);
  const reports = c.reports.map((r) => DATA.reports[r]).filter(Boolean);
  const official = sources[0];
  const scores = scoring();
  const mine = scores && scores.get(c.id);
  const inCompare = compare.includes(c.id);
  const full = !inCompare && compare.length >= MAX_COMPARE;
  const stat = (ic, label, value) =>
    value ? `<div class="card stat">${tile(ic, color, 'sm')}<div><small>${label}</small><b>${esc(value)}</b></div></div>` : '';
  const notes = [
    c.requirements && c.status === 'restricted' ? ['lock', c.requirements] : null,
    c.exam.format ? ['pen-line', c.exam.format] : null,
    c.fee.note ? ['badge-dollar-sign', c.fee.note] : null,
    c.ai_policy ? ['bot', `AI during the exam: ${c.ai_policy}`] : null,
    ...c.caveats.map((x) => ['info', x]),
  ].filter(Boolean);

  const left = [
    c.domains.length
      ? `<section class="card panel"><h2>${icon('layers')}Exam domains</h2><div class="donut-wrap">${donut(c.domains)}${legend(c)}</div>${c.domains_note ? `<p class="hint domains-note">${esc(c.domains_note)}</p>` : ''}</section>`
      : '',
    mine
      ? `<section class="card panel"><h2>${icon('sliders-horizontal')}Why it fits you</h2><div class="for-you">${ring(mine.score, 76, 'lg', `Match ${mine.score} of 100`)}<ul class="why">${mine.reasons
          .map((r) => `<li>${icon('circle-check')}<span>${esc(r)}</span></li>`)
          .join('')}${mine.warnings.map((w) => `<li class="warn">${icon('triangle-alert')}<span>${esc(w)}</span></li>`).join('')}</ul></div></section>`
      : '',
    notes.length
      ? `<section class="card panel"><h2>${icon('info')}Good to know</h2><ul class="notes">${notes.map(([ic, t]) => `<li>${icon(ic)}<span>${esc(t)}</span></li>`).join('')}</ul></section>`
      : '',
  ].join('');
  const right = [
    c.prep && c.prep.length
      ? `<section class="card panel"><h2>${icon('graduation-cap')}Prepare with</h2><div class="resources">${c.prep
          .map((r) => {
            const k = PREP[r.kind] || { icon: 'file-text', label: r.kind };
            return ext(
              r.url,
              `${tile(k.icon, color, 'sm')}<span><b>${esc(r.title)}</b>${r.note ? `<small>${esc(r.note)}</small>` : ''}<span class="pill">${k.label} · ${r.cost === 'paid' ? 'Paid' : 'Free'}</span></span>`,
              'res',
            );
          })
          .join('')}</div></section>`
      : '',
    `<section class="card panel"><h2>${icon('file-text')}Sources</h2>
      <p class="hint">Checked ${esc(day(c.checked_on, { weekday: false, year: true }))} against the issuer.</p>
      <details class="more"><summary>${sources.length} source${sources.length === 1 ? '' : 's'}</summary>${sources
        .map((s) => ext(s.url, `${esc(s.title)}${s.note ? `<small>${esc(s.note)}</small>` : ''}`, 'src'))
        .join('')}</details>
      ${reports.length ? `<details class="more"><summary>${reports.length} candidate report${reports.length === 1 ? '' : 's'}</summary>
        <p class="hint">Self-reported. Useful for how people prepared, not for pass rates.</p>
        ${reports.map((r) => `<div class="report">${ext(r.url, esc(r.title))} <span class="muted">· ${esc(r.platform)}</span><p>${esc(r.summary)}</p></div>`).join('')}</details>` : ''}
    </section>`,
  ].join('');

  $('#cert-body').innerHTML = `
    <a class="back" href="#">${icon('arrow-left')}All certifications</a>
    <div class="card cert-hero" style="--pc:${providerColor(c.provider)}">
      <div class="hero-badge">${badge(c, 128)}</div>
      <div>
        <p class="who"><span>${esc(c.provider)} · ${esc(c.code)}</span>${lvl(c.level)}${catPill(c)}${flag(c)}</p>
        <h1>${esc(c.name)}</h1>
        <p class="scope">${esc(c.scope)}</p>
        <div class="cert-actions">
          <a class="btn primary" href="#plan?cert=${esc(c.id)}">${icon('route')}Plan your study</a>
          <button type="button" class="btn" data-act="compare" data-id="${esc(c.id)}" aria-pressed="${inCompare}" ${full ? 'disabled title="Compare holds four"' : ''}>${icon(inCompare ? 'check' : 'columns-3')}${inCompare ? 'In compare' : 'Compare'}</button>
          ${official ? ext(official.url, `${icon('external-link')}Issuer page`, 'btn') : ''}
        </div>
      </div>
    </div>
    <div class="stat-grid">
      ${stat('badge-dollar-sign', 'Price', `${fee(c)}${c.fee.basis ? ` · ${c.fee.basis}` : ''}`)}
      ${stat('clock', 'Exam length', duration(c))}
      ${stat('list-checks', 'Questions', c.exam.questions)}
      ${stat('target', 'Passing score', c.exam.passing)}
      ${stat('calendar-check', 'Valid for', c.exam.validity)}
      ${stat('pen-line', 'Format', LABELS[c.exam.style])}
      ${stat(c.status === 'restricted' ? 'lock' : 'clipboard-list', 'Registration', LABELS[c.status])}
    </div>
    <div class="cols"><div>${left}</div><div>${right}</div></div>`;
}

// ---------- compare page ----------
function renderCompare() {
  const certs = compare.map((id) => BY_ID.get(id)).filter(Boolean);
  const body = $('#compare-body');
  if (!certs.length) {
    body.innerHTML = '<p class="empty">Nothing here yet. Use the + on any certification to add it.</p>';
    return;
  }
  const link = `${location.origin}${location.pathname}#compare?ids=${certs.map((c) => c.id).join(',')}`;
  const row = (ic, label, value) => `<div class="cmp-row">${icon(ic)}<div><small>${label}</small>${value}</div></div>`;
  body.innerHTML = `
    <div class="compare-tools">
      <button type="button" class="btn" id="copy-compare">${icon('link')}Copy link</button>
      <button type="button" class="btn" id="clear-compare">${icon('x')}Clear</button>
    </div>
    <div class="cmp" style="--n:${certs.length}">${certs
      .map(
        (c) => `<article class="card cmp-col">
          <div class="head">${badge(c, 46, { label: false })}<div><h3><a href="#cert?id=${esc(c.id)}">${esc(c.name)}</a></h3><div class="who">${esc(c.provider)} · ${esc(c.code)}</div></div></div>
          ${row('badge-dollar-sign', 'Price', esc(fee(c)))}
          ${row('clock', 'Exam length', esc(duration(c)))}
          ${row('list-checks', 'Questions', esc(c.exam.questions || '—'))}
          ${row('target', 'Passing score', esc(c.exam.passing || '—'))}
          ${row('calendar-check', 'Valid for', esc(c.exam.validity || '—'))}
          ${row('gauge', 'Level', lvl(c.level))}
          ${row('pen-line', 'Format', esc(LABELS[c.exam.style]))}
          ${row(c.status === 'restricted' ? 'lock' : 'clipboard-list', 'Registration', esc(LABELS[c.status]))}
          ${row('layers', 'Domains', c.domains.length ? dbar(c) + legend(c) : '—')}
          ${row('bot', 'AI in the exam', esc(c.ai_policy || '—'))}
          <button type="button" class="link" data-act="compare" data-id="${esc(c.id)}">Remove</button>
        </article>`,
      )
      .join('')}</div>`;
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
  suggested = estimateHours(cert, profile, levelHours).hours;
  if (!hoursTouched) f.hours.value = suggested;
  updateHint();
}

function updateHint() {
  const f = $('#plan-form');
  const cert = BY_ID.get(f.cert.value);
  const off = Number(f.hours.value) !== suggested;
  $('#hours-hint').innerHTML = `Suggested: ${suggested} h for ${esc(LABELS[cert.level].toLowerCase())} level${off ? ` · <button type="button" class="link" data-act="use-hours">use it</button>` : ''}`;
}

const confidenceKey = (id) => `${KEYS.confidence}${id}`;

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
  setRatedLabel(Object.keys(saved).length);
}

function setRatedLabel(n) {
  $('#confidence summary span').textContent = n ? `Rate your topics · ${n} rated` : 'Rate your topics';
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

function statusHtml(p) {
  const d = p.deadline;
  if (!d) return `<div class="status info">${icon('flag')}Keep this pace and you can sit the exam from ${day(p.examDate)}.</div>`;
  if (d.fits) {
    return `<div class="status good">${icon('circle-check')}Fits before your exam on ${day(d.targetDate)}${d.spare ? `, with ${d.spare} spare day${d.spare === 1 ? '' : 's'}` : ''}.</div>`;
  }
  const fixes = [];
  if (d.suggestedMinutes) fixes.push(`${len(d.suggestedMinutes)} sessions`);
  fixes.push('more study days');
  fixes.push(`an exam on ${day(p.examDate)} or later`);
  return `<div class="status warn">${icon('triangle-alert')}Does not fit before ${day(d.targetDate)}: ${d.needed} sessions, ${d.available} study days. Try ${fixes.slice(0, -1).join(', ')} or ${fixes.at(-1)}.</div>`;
}

function monthsHtml(p, done) {
  const byDate = new Map(p.sessions.map((s) => [s.date, s]));
  const examDay = p.deadline ? p.deadline.targetDate : p.examDate;
  const first = utc(p.sessions[0].date);
  const last = utc([p.sessions.at(-1).date, examDay].sort().at(-1));
  const out = [];
  let y = first.getUTCFullYear();
  let m = first.getUTCMonth();
  while (y < last.getUTCFullYear() || (y === last.getUTCFullYear() && m <= last.getUTCMonth())) {
    const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => `<span class="dow">${d}</span>`);
    for (let i = 0; i < lead; i++) cells.push('<span></span>');
    for (let d = 1; d <= days; d++) {
      const date = iso(new Date(Date.UTC(y, m, d)));
      const s = byDate.get(date);
      if (s) {
        cells.push(`<span class="d s ${kindN(s.kind)}${done.has(s.n) ? ' done' : ''}" data-n="${s.n}" ${kindStyle(s.kind)} title="${esc(`${day(date)} · ${KIND_LABEL[s.kind]}: ${cap(s.name)}`)}">${icon(KIND[s.kind].icon)}</span>`);
      } else if (date === examDay) {
        cells.push(`<span class="d exam" title="${esc(`${day(date)} · Exam`)}">${icon('target')}</span>`);
      } else {
        cells.push(`<span class="d">${d}</span>`);
      }
    }
    out.push(`<div class="card month"><h3>${MONTH_NAMES[m]} ${y}</h3><div class="mgrid">${cells.join('')}</div></div>`);
    if (m === 11) {
      y += 1;
      m = 0;
    } else {
      m += 1;
    }
  }
  return out.join('');
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
  const pct = () => Math.round((done.size / p.sessions.length) * 100);

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
  const weekRange = (w) => {
    const a = new Date(monday);
    a.setUTCDate(monday.getUTCDate() + w * 7);
    const b = new Date(a);
    b.setUTCDate(a.getUTCDate() + 6);
    return span(iso(a), iso(b));
  };
  const stop = (s) => `<li class="stop${done.has(s.n) ? ' done' : ''}" data-kind="${s.kind}">
      <span class="node ${kindN(s.kind)}" ${kindStyle(s.kind)}>${icon(KIND[s.kind].icon)}</span>
      <div class="card body">
        <small>${day(s.date)} · ${KIND_LABEL[s.kind]}</small>
        <b>${esc(cap(s.name))}</b>
        <span class="len">${icon('clock')}${len(s.minutes)}</span>
        <label class="check"><input type="checkbox" data-n="${s.n}" aria-label="Session ${s.n} done" ${done.has(s.n) ? 'checked' : ''}><span>${icon('check')}</span></label>
      </div></li>`;
  const kinds = [...new Set(p.sessions.map((s) => s.kind))];
  const mockDetail = p.sessions.find((s) => s.kind === 'mock')?.detail;
  const examDay = p.deadline ? p.deadline.targetDate : p.examDate;
  const byTopic = new Map();
  for (const s of p.sessions) if (s.topic) byTopic.set(s.topic, (byTopic.get(s.topic) || 0) + s.minutes);
  const topicRows = p.topics
    .map((t, i) => ({ label: t, value: Math.round(((byTopic.get(t) || 0) / 60) * 10) / 10, color: `var(--d${(i % 8) + 1})` }))
    .filter((r) => r.value > 0);
  const weekRows = [...weeks].map(([w, items], i) => ({
    label: `W${i + 1}`,
    value: Math.round((items.reduce((t, s) => t + s.minutes, 0) / 60) * 10) / 10,
    title: `Week ${i + 1} (${weekRange(w)}): ${Math.round((items.reduce((t, s) => t + s.minutes, 0) / 60) * 10) / 10} h`,
    mark: items.some((s) => s.kind === 'mock'),
  }));
  const summaryStat = (ic, label, value) => `<div class="card stat">${tile(ic, '--accent', 'sm')}<div><small>${label}</small><b>${value}</b></div></div>`;

  out.innerHTML = `
    <div class="plan-summary">
      ${summaryStat('calendar-days', 'Sessions', p.sessions.length)}
      ${summaryStat('clock', 'Study time', `${p.hours} h`)}
      ${summaryStat('flag', 'From – to', `${day(p.sessions[0].date, { weekday: false })} – ${day(p.sessions.at(-1).date, { weekday: false })}`)}
      ${summaryStat('target', p.deadline ? 'Exam' : 'Earliest exam', day(examDay))}
      <div class="card progress-card" id="progress">${ring(pct(), 52, 'good pct', `${pct()}% done`)}<div><b id="progress-n">${done.size} of ${p.sessions.length}</b><small>sessions done</small></div></div>
    </div>
    ${statusHtml(p)}
    <div class="plan-actions">
      <button type="button" class="btn primary" id="dl-ics">${icon('calendar-plus')}Add to calendar</button>
      <button type="button" class="btn" id="dl-md">${icon('download')}Markdown</button>
      <button type="button" class="btn" id="copy-plan">${icon('link')}Copy link</button>
      <button type="button" class="btn" id="print-plan">${icon('printer')}Print</button>
    </div>
    ${p.inferredTopics ? '<p class="note">No official domains in the catalog for this one, so topics come from its summary. Swap in the issuer\'s objectives.</p>' : ''}
    <div class="months">${monthsHtml(p, done)}</div>
    <ul class="kinds">${kinds.map((k) => `<li><span class="k ${kindN(k)}" ${kindStyle(k)}>${icon(KIND[k].icon)}</span>${KIND_LABEL[k]}</li>`).join('')}<li><span class="k exam">${icon('target')}</span>Exam</li></ul>
    <div class="plan-charts">
      <section class="card panel"><h2>${icon('chart-bar')}Time by topic</h2>${hbars(topicRows)}</section>
      <section class="card panel"><h2>${icon('chart-column')}Hours per week</h2>${columns(weekRows)}<p class="hint">Highlighted weeks include a timed mock.</p></section>
    </div>
    ${[...weeks]
      .map(([w, items], i) => `<h3 class="week">Week ${i + 1} <small>${weekRange(w)}</small></h3><ol class="trail">${items.map(stop).join('')}</ol>`)
      .join('')}
    <div class="plan-extra">
      <section class="card panel"><h2>${icon('info')}What each session is</h2>
        <dl class="keydl">${kinds.map((k) => `<dt><span class="kinds"><span class="k ${kindN(k)}" ${kindStyle(k)}>${icon(KIND[k].icon)}</span></span>${KIND_LABEL[k]}</dt><dd>${esc(k === 'mock' ? mockDetail : KIND_DETAIL[k])}</dd>`).join('')}</dl>
      </section>
      ${cert.prep && cert.prep.length ? `<section class="card panel"><h2>${icon('graduation-cap')}Resources</h2><div class="resources">${cert.prep
        .map((r) => {
          const k = PREP[r.kind] || { icon: 'file-text', label: r.kind };
          return ext(r.url, `${tile(k.icon, '--accent', 'sm')}<span><b>${esc(r.title)}</b><span class="pill">${k.label} · ${r.cost === 'paid' ? 'Paid' : 'Free'}</span></span>`, 'res');
        })
        .join('')}</div></section>` : ''}
    </div>`;

  $$('#plan-output .check input').forEach((box) =>
    box.addEventListener('change', () => {
      const n = Number(box.dataset.n);
      if (box.checked) done.add(n);
      else done.delete(n);
      store.set(progressKey, [...done]);
      box.closest('.stop').classList.toggle('done', box.checked);
      $(`#plan-output .mgrid [data-n="${n}"]`)?.classList.toggle('done', box.checked);
      $('#progress .ring').outerHTML = ring(pct(), 52, 'good pct', `${pct()}% done`);
      $('#progress-n').textContent = `${done.size} of ${p.sessions.length}`;
      const kind = p.sessions.find((s) => s.n === n)?.kind;
      if (box.checked && (done.size === p.sessions.length || kind === 'final' || kind === 'mock')) celebrate(done.size === p.sessions.length ? 220 : 90);
    }),
  );
  $('#dl-ics').addEventListener('click', () => download(`${p.cert.id}-plan.ics`, toICS(p), 'text/calendar'));
  $('#dl-md').addEventListener('click', () => download(`${p.cert.id}-plan.md`, toMarkdown(p, { resources: cert.prep || [] }), 'text/markdown'));
  $('#print-plan').addEventListener('click', () => window.print());
  $('#copy-plan').addEventListener('click', (e) => copy(`${location.origin}${location.pathname}#plan?${new URLSearchParams(planParams())}`, e.currentTarget));
}

function celebrate(count) {
  if (reducedMotion()) return;
  const css = getComputedStyle(document.documentElement);
  const colors = ['--accent', '--k-learn', '--k-practice', '--k-mock', '--d4'].map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
  confetti({ particleCount: count, spread: 75, startVelocity: 38, origin: { y: 0.75 }, colors, disableForReducedMotion: true });
}

function effectiveTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function setThemeButton() {
  const dark = effectiveTheme() === 'dark';
  $('#theme use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
  $('#theme').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
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
  const before = button.innerHTML;
  let ok = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    ok = false;
  }
  button.innerHTML = `${icon(ok ? 'check' : 'x')}${ok ? 'Copied' : 'Copy failed'}`;
  setTimeout(() => (button.innerHTML = before), 1500);
}

// ---------- wiring ----------
function bind() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act], button[data-cat], button[data-prov]');
    if (!btn) return;
    if (btn.dataset.prov !== undefined) {
      activeProvider = activeProvider === btn.dataset.prov ? '' : btn.dataset.prov;
      renderList();
      return;
    }
    if (btn.dataset.cat !== undefined) {
      activeCat = btn.dataset.cat;
      renderList();
      return;
    }
    if (btn.dataset.act === 'compare') {
      toggleCompare(btn.dataset.id);
      const { name, params } = parseHash();
      const view = VIEWS[name] || 'list';
      if (view === 'cert') renderCert(params.get('id'));
      if (view === 'compare') renderCompare();
      if (view === 'list') renderList();
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
    if (e.target.dataset.topic) return;
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
    const rated = readConfidence();
    store.set(confidenceKey(cert), rated);
    setRatedLabel(Object.keys(rated).length);
    renderPlan();
  });

  $('#theme').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set(KEYS.theme, next);
    setThemeButton();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setThemeButton);

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
  const all = DATA.certifications;
  const providers = new Set(all.map((c) => c.provider)).size;
  const free = all.filter((c) => c.fee.usd === 0).length;
  const withPrep = all.filter((c) => c.prep && c.prep.length).length;
  const dates = all.map((c) => c.checked_on).sort();
  const fmt = (d) => day(d, { weekday: false, year: true });
  const checked = dates[0] === dates.at(-1) ? `on ${fmt(dates[0])}` : `between ${fmt(dates[0])} and ${fmt(dates.at(-1))}`;

  profile = { ...emptyProfile(), ...store.get(KEYS.profile, {}) };
  setCompare(store.get(KEYS.compare, []).filter((id) => BY_ID.has(id)).slice(0, MAX_COMPARE));

  $('#list-lede').textContent = 'Compare prices, exam formats and domains, then turn any certification into a dated study plan.';
  const heroStat = (ic, n, label) => `<span class="stat-chip">${tile(ic, '--accent', 'sm')}<span><b>${n}</b><small>${label}</small></span></span>`;
  $('#hero-stats').innerHTML =
    heroStat('layers', all.length, 'certifications') +
    heroStat('building-2', providers, 'providers') +
    heroStat('graduation-cap', withPrep, 'with prep guides') +
    (free ? heroStat('badge-dollar-sign', free, 'free') : '');
  $('#level-key').innerHTML = t.levels.map((l) => `<li>${lvl(l.id)}</li>`).join('');
  $('#hours-note').textContent = `${t.hours_note} Ranges: ${t.levels.map((l) => `${l.label.toLowerCase()} ${l.hours[0]}–${l.hours[1]} h`).join(', ')}.`;
  $('#data-note').textContent = `${all.length} certifications from ${providers} providers, ${Object.keys(DATA.sources).length} sources and ${Object.keys(DATA.reports).length} candidate reports, checked ${checked}. Every fact links to the issuer's own page.`;
  $('#foot-data').textContent = `Catalog ${fmt(DATA.generated_on)}`;

  fuse = new Fuse(
    all.map((c) => ({ id: c.id, name: c.name, code: c.code, provider: c.provider, category: c.category, skills: c.skills.map((s) => LABELS[s]).join(' '), scope: c.scope })),
    {
      keys: [{ name: 'name', weight: 3 }, { name: 'code', weight: 3 }, { name: 'provider', weight: 2 }, { name: 'skills', weight: 1.5 }, 'category', 'scope'],
      threshold: 0.34,
      ignoreLocation: true,
    },
  );
  const featured = ['claude-architect-foundations', 'nvidia-nca-genl', 'aws-aif-c01', 'google-agentic-architect', 'lf-mcpa', 'databricks-genai-engineer', 'redhat-ex267', 'github-gh-600'].filter((id) => BY_ID.has(id));
  $('#floaters').innerHTML = featured.map((id, i) => `<a href="#cert?id=${id}" class="floater f${i}" title="${esc(BY_ID.get(id).name)}">${badge(BY_ID.get(id), 76)}</a>`).join('');

  fillProfile();
  fillFilters();
  renderCats();
  renderProviders();
  setThemeButton();
  fillPlanForm();
  bind();
  $('#loading').remove();
  route();
}

init();
