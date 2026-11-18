import { emptyProfile, rank } from './lib/match.js';
import { applyMoves, behind, buildPlan, countStudyDays, estimateHours, planTopics, reschedule, toICS, toMarkdown, KIND_DETAIL } from './lib/planner.js';
import { buildRun, emptyHistory, grade, isCorrect, minutesFor, mistakes, mistakesCsv, record, totals } from './lib/practice.js';
import { INTERVALS, answer as answerReview, applyRun, daysUntil, loadReview, queue } from './lib/review.js';
import { providerColor, badge, donut, hbars, columns, domainColor } from './visuals.js';
import Fuse from './vendor/fuse.js';
import { t, getLang, setLang, dates, label, hoursNote, lib, kindDetail, markdownText, applyStatic } from './i18n.js';
import { examText } from './lib/examtext.js';
import { createSearch } from './lib/search.js';
import { SORTS, activeFilters, emptyFilters, examInSpanish, examOnline, filterCerts, filtersFromParams, filtersToParams, sortCerts } from './lib/listing.js';
import { nextSteps, pathsFor, shortName, similar } from './lib/related.js';
import { STUDY_KEYS, createStudyBackup, hasStudyData, parseStudyBackup, restoreStudyBackup } from './lib/backup.js';
import { mountChat } from './chat.js';

const MAX_COMPARE = 4;
const KEYS = {
  ...STUDY_KEYS,
  profile: 'pathfinder:profile',
  compare: 'pathfinder:compare',
  theme: 'pathfinder:theme',
  motion: 'pathfinder:motion',
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
let filters = emptyFilters();
let search = () => ({ ids: [], exact: [] });
let chat = null;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- visual vocabulary ----------
const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const CATS = {
  'AI engineering': { icon: 'bot', c: '--cat-ai' },
  'ML foundations': { icon: 'brain-circuit', c: '--cat-ml' },
  'AI security': { icon: 'shield-check', c: '--cat-sec' },
  'Cloud & platform': { icon: 'cloud', c: '--cat-cloud' },
  Cybersecurity: { icon: 'lock-keyhole', c: '--cat-cyber' },
  'Data & analytics': { icon: 'database', c: '--cat-data' },
  Networking: { icon: 'network', c: '--cat-net' },
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
  'official-guide': { icon: 'book-open' },
  course: { icon: 'graduation-cap' },
  docs: { icon: 'file-text' },
  practice: { icon: 'dumbbell' },
};
const prepKind = (r) => ({ icon: (PREP[r.kind] || { icon: 'file-text' }).icon, label: PREP[r.kind] ? t(`prep.${r.kind}`) : r.kind });
const catName = (cat) => t(`cat.${cat}`);
const kindLabel = (k) => t(`kind.${k}`);
const sname = (s) => lib(s.name.replace(/ \((\d+\/\d+)\)$/, '')) + (s.name.match(/ \(\d+\/\d+\)$/)?.[0] || '');

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
  return `<div class="dbar${big ? ' lg' : ''}" role="img" aria-label="${esc(t('donut.aria'))}">${cert.domains
    .map((d, i) => `<span style="flex:${d.weight};background:${domainColor(i)}" title="${esc(d.name)}: ${d.weight}%"></span>`)
    .join('')}</div>`;
}

function legend(cert) {
  return `<ul class="legend">${cert.domains
    .map((d, i) => `<li><span class="sw" style="background:${domainColor(i)}"></span><span>${esc(d.name)}</span><b>${d.weight}%</b></li>`)
    .join('')}</ul>`;
}

// ---------- formatting ----------

function utc(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const iso = (dt) => dt.toISOString().slice(0, 10);

function day(s, { weekday = true, year = false } = {}) {
  const d = utc(s);
  const D = dates();
  return `${weekday ? `${D.days[d.getUTCDay()]} ` : ''}${d.getUTCDate()} ${D.months[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ''}`;
}

function span(a, b) {
  const x = utc(a);
  const y = utc(b);
  if (x.getUTCMonth() === y.getUTCMonth()) return `${x.getUTCDate()}–${y.getUTCDate()} ${dates().months[y.getUTCMonth()]}`;
  return `${day(a, { weekday: false })} – ${day(b, { weekday: false })}`;
}

function len(m) {
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`;
}

function fee(cert) {
  const usd = cert.fee.usd;
  if (usd == null) return t('fee.varies');
  if (usd === 0) return t('fee.free');
  return `US$${usd % 1 ? usd.toFixed(2) : usd}`;
}

/** An exam or fee fact as the issuer writes it, in the interface language when its shape is known. */
const ex = (text) => examText(text, getLang());

function duration(cert) {
  const m = cert.exam.minutes;
  if (!m) return cert.exam.style === 'practical' ? t('dur.practical') : '—';
  return len(m);
}

const FLAG = { restricted: 'lock', upcoming: 'clock' };
const flag = (c) => (FLAG[c.status] ? `<span class="pill warn">${icon(FLAG[c.status])}${t(`flag.${c.status}`)}</span>` : '');

// ---------- routing ----------
function parseHash() {
  const raw = location.hash.replace(/^#/, '');
  const [name, query = ''] = raw.split('?');
  return { name, params: new URLSearchParams(query) };
}

const VIEWS = { '': 'list', list: 'list', browse: 'list', match: 'list', ask: 'ask', cert: 'cert', path: 'path', compare: 'compare', plan: 'plan', practice: 'practice', progress: 'progress', about: 'about' };
let lastView = null;
let lastCert = null;
let listScroll = 0;
let jumpToResults = false;

function route() {
  if (document.startViewTransition && lastView !== null && !reducedMotion()) {
    const vt = document.startViewTransition(renderRoute);
    // A transition cut short (a resize, a second click) only skips the animation.
    vt.ready.catch(() => {});
  } else renderRoute();
}

function renderRoute() {
  const { name, params } = parseHash();
  let view = VIEWS[name] || 'list';
  const certId = params.get('id');
  const practiceId = params.get('cert');
  if (view !== 'practice') stopPracticeTimer();

  if (lastView === 'list' && view !== 'list') listScroll = window.scrollY;
  $$('.view').forEach((v) => (v.hidden = v.id !== `view-${view}`));
  $$('nav a').forEach((a) => {
    if (a.dataset.route === (['cert', 'path'].includes(view) ? 'list' : view)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (view === 'list') {
    if (name === 'match') setProfileOpen(true);
    // A link with filters (#list?cat=…&max=…) sets them; a bare one keeps what was chosen.
    if (name === 'list' && [...params.keys()].length) {
      filters = filtersFromParams(params, { categories: DATA.certifications.map((c) => c.category), providers: DATA.certifications.map((c) => c.provider) });
      // A filter the catalog has no data for yet (its control is hidden) would only empty the list.
      if ($('#f-es').hidden) filters.es = false;
      if ($('#f-online').hidden) filters.online = false;
      syncControls();
    }
    renderList();
  }
  if (view === 'cert') {
    if (BY_ID.has(certId)) renderCert(certId);
    else notFound('#cert-body', t('cert.notFound'), certId);
  }
  if (view === 'path') renderPath(certId);
  if (view === 'compare') {
    const ids = (params.get('ids') || '').split(',').filter((id) => BY_ID.has(id)).slice(0, MAX_COMPARE);
    if (ids.length) setCompare(ids);
    renderCompare();
  }
  if (view === 'plan') enterPlan(params);
  if (view === 'practice') renderPractice(practiceId, params);
  if (view === 'progress') renderProgress();
  if (view === 'ask') chat?.shown();

  const from = { view: lastView, cert: lastCert };
  const moved = view !== lastView || (['cert', 'path'].includes(view) && certId !== lastCert);
  if (moved) window.scrollTo(0, view === 'list' ? listScroll : 0);
  if (view === 'list' && jumpToResults) {
    jumpToResults = false;
    showResults();
  }
  // On a desktop the composer is ready to type in; on phones the keyboard would cover the page.
  const composer = moved && view === 'ask' && matchMedia('(pointer: fine)').matches;
  if (composer) $('#chat-input').focus({ preventScroll: true });
  lastView = view;
  lastCert = ['cert', 'path'].includes(view) ? certId : null;

  const titles = { ask: t('chat.title'), practice: t('practice.title'), compare: t('compare.title'), plan: t('plan.title'), progress: t('progress.title'), about: t('about.title') };
  if (view === 'cert' && BY_ID.has(certId)) document.title = `${BY_ID.get(certId).name} · pathfinder`;
  else if (!['cert', 'path'].includes(view)) document.title = titles[view] ? `${titles[view]} · pathfinder` : t('home.title');
  if (moved && from.view !== null) arrive(view, from, !composer);
  countView(view, certId || params.get('cert'));
}

// Anonymous page counts (Vercel Web Analytics, loaded by index.html on the public site only). One
// count per view or certification shown; search words and filters never leave the page.
let counted = '';
function countView(view, certId) {
  const id = ['cert', 'path', 'plan', 'practice'].includes(view) && /^[a-z0-9-]{2,60}$/.test(certId || '') ? certId : '';
  const path = `/#${view}${id ? `/${id}` : ''}`;
  if (path === counted) return;
  counted = path;
  window.va?.('pageview', { route: `/#${view}`, path });
}

/** After a route change, move focus to the new view's heading (or back to the card it came from) and announce its title. */
function arrive(view, from, focus) {
  const section = $(`#view-${view}`);
  let target = null;
  if (view === 'list' && from.view === 'cert' && from.cert) target = $(`#certs a[href="#cert?id=${CSS.escape(from.cert)}"]`);
  target ||= $('h1', section);
  if (focus && target) {
    if (!target.matches('a[href], button, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
  const status = $('#route-status');
  status.textContent = '';
  setTimeout(() => (status.textContent = view === 'list' ? t('route.home') : document.title.replace(/ · pathfinder$/, '')), 60);
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
  const tx = DATA.taxonomy;
  $('#want').innerHTML = tx.skills.map((s) => chip('want', s.id, label('skills', s), profile.want.includes(s.id))).join('');
  $('#known').innerHTML = tx.skills.map((s) => chip('known', s.id, label('skills', s), profile.known.includes(s.id))).join('');
  $('#roles').innerHTML = tx.roles.map((r) => chip('roles', r.id, label('roles', r), profile.roles.includes(r.id))).join('');
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
  $('#for-me span').textContent = n ? `${t('forMe')} · ${n}` : t('forMe');
  const extra = profile.roles.length + profile.known.length;
  $('#more-count').textContent = extra ? `· ${extra}` : '';
}

function setProfileOpen(open) {
  $('#profile').hidden = !open;
  $('#for-me').setAttribute('aria-expanded', String(open));
}

function fillFilters() {
  const f = $('#filters');
  const opt = (v, l) => `<option value="${esc(v)}">${esc(l)}</option>`;
  const keep = f.level.value;
  f.level.innerHTML = opt('', t('filter.allLevels')) + DATA.taxonomy.levels.map((l) => opt(l.id, label('levels', l))).join('');
  f.level.value = keep;
  for (const o of f.price.options) if (Number(o.value) > 0) o.textContent = t('price.upto', { n: o.value });
  const sort = $('#sort');
  const keepSort = sort.value || filters.sort;
  sort.innerHTML = SORTS.map((k) => opt(k, t(`sort.${k}`))).join('');
  sort.value = keepSort;
  // The Spanish and online filters show once the catalog says, for some certification, how its exam is taken.
  for (const [id, known] of [['#f-es', examInSpanish], ['#f-online', examOnline]]) {
    const n = DATA.certifications.filter((c) => known(c) === true).length;
    $(id).hidden = !n;
    $(id).title = t('filter.known', { n });
  }
}

/** A price ceiling the list doesn't offer (from a shared link or the chat) gets its own option. */
function setPriceOption(max) {
  const price = $('#filters').price;
  if (max != null && ![...price.options].some((o) => o.value === String(max))) {
    const after = [...price.options].find((o) => o.value !== '' && Number(o.value) > max);
    price.insertBefore(new Option(t('price.upto', { n: max }), String(max)), after || null);
  }
  price.value = max == null ? '' : String(max);
}

function readControls() {
  const f = $('#filters');
  filters = { ...filters, q: f.q.value.trim(), level: f.level.value, prov: f.prov.value, max: f.price.value === '' ? null : Number(f.price.value), sort: $('#sort').value || 'recommended', es: f.es.checked, online: f.online.checked };
}

function syncControls() {
  const f = $('#filters');
  f.q.value = filters.q;
  f.level.value = filters.level;
  f.prov.value = filters.prov;
  setPriceOption(filters.max);
  $('#sort').value = filters.sort;
  f.es.checked = filters.es;
  f.online.checked = filters.online;
}

/** Puts the filters in the address, so a filtered list can be shared and comes back on reload. */
function syncListUrl() {
  if ($('#view-list').hidden) return;
  const params = filtersToParams(filters).toString();
  if (!params && !['list', 'browse'].includes(parseHash().name)) return;
  const hash = params ? `#list?${params}` : '#list';
  if (location.hash !== hash) history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
}

function renderCats() {
  const all = DATA.certifications;
  const count = (cat) => all.filter((c) => c.category === cat).length;
  const btn = (id, label, ic, color, n) =>
    `<button type="button" class="cat" data-cat="${esc(id)}" aria-pressed="${filters.cat === id}" style="--c:var(${color})">${tile(ic, color, 'xs')}<b>${esc(label)}</b><small>${n}</small></button>`;
  const shown = Object.entries(CATS).filter(([cat]) => count(cat));
  $('#cats').innerHTML = btn('', t('cat.all'), 'layout-grid', '--accent', all.length) + shown.map(([cat, m]) => btn(cat, catName(cat), m.icon, m.c, count(cat))).join('');
}

/** Providers, the busiest first, with how many certifications each has. */
function renderProviders() {
  const all = DATA.certifications;
  const count = (n) => all.filter((c) => c.provider === n).length;
  const names = [...new Set(all.map((c) => c.provider))].sort((a, b) => count(b) - count(a) || a.localeCompare(b));
  const select = $('#filters').prov;
  select.innerHTML = `<option value="">${esc(t('filter.allProviders'))}</option>${names.map((n) => `<option value="${esc(n)}">${esc(n)} (${count(n)})</option>`).join('')}`;
  select.value = filters.prov;
}

function scoring() {
  if (!profileCount()) return null;
  const results = rank(DATA.certifications, { ...profile, budget: null, includeRestricted: true, style: 'any' }, LABELS);
  return new Map(results.map((r) => [r.id, r]));
}

/** The active filters in words, for the empty state. */
function filterWords() {
  const words = { q: `“${filters.q}”`, cat: catName(filters.cat), prov: filters.prov, level: LABELS[filters.level], max: filters.max === 0 ? t('price.free') : t('price.upto', { n: filters.max }), es: t('filter.es'), online: t('filter.online') };
  return activeFilters(filters).map((k) => words[k]);
}

let lastSearch = { ids: [], exact: [] };

function renderList() {
  readControls();
  const scores = scoring();
  const all = DATA.certifications;
  lastSearch = filters.q ? search(filters.q) : { ids: [], exact: [] };
  const hits = filters.q ? new Map(lastSearch.ids.map((id, i) => [id, i])) : null;
  const list = sortCerts(filterCerts(all, filters, { hits }), filters.sort, { hits, scores });
  $$('#cats .cat').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === filters.cat)));
  $('#list-head').textContent = t('list.head', { shown: list.length, total: all.length, scored: !!scores && !hits && filters.sort === 'recommended' });
  // A price ceiling keeps the certifications priced by country; say so next to the filter.
  const varies = filters.max ? list.filter((c) => c.fee.usd == null).length : 0;
  $('#list-note').hidden = !varies;
  $('#list-note').innerHTML = varies ? `${icon('info')}<span>${esc(t('list.varies', { n: varies }))}</span>` : '';
  renderSuggest(filters.q, list);
  renderPaths();
  syncListUrl();
  $('#certs').innerHTML = list.length
    ? list.map((c, i) => card(c, scores && scores.get(c.id), i)).join('')
    : `<div class="empty"><p>${esc(t('list.empty'))}</p>${
        activeFilters(filters).length
          ? `<p class="empty-filters">${filterWords().map((w) => `<span class="pill">${esc(w)}</span>`).join('')}</p><button type="button" class="btn" data-act="clear-filters">${icon('x')}${t('list.clear')}</button>`
          : ''
      }</div>`;
}

function clearFilters() {
  filters = { ...emptyFilters(), sort: filters.sort };
  syncControls();
  renderList();
}

const catPill = (c) => `<span class="pill catp" style="--c:var(${catOf(c).c})">${icon(catOf(c).icon)}${esc(catName(c.category))}</span>`;

/** The price on a card; a price set by country says so instead of a number. */
const feeFact = (c) =>
  c.fee.usd == null
    ? `<span class="varies" title="${esc(t('fee.variesHint'))}">${icon('badge-dollar-sign')}${esc(fee(c))}</span>`
    : `<span>${icon('badge-dollar-sign')}${esc(fee(c))}</span>`;

function card(c, score, i = 0) {
  const inCompare = compare.includes(c.id);
  const full = !inCompare && compare.length >= MAX_COMPARE;
  return `<article class="card cert-card" style="--pc:${providerColor(c.provider)};--i:${Math.min(i, 14)}">
    <div class="row">
      ${badge(c, 56)}
      <div class="title">
        <h3><a href="#cert?id=${esc(c.id)}">${esc(c.name)}</a></h3>
        <div class="who">${esc(c.provider)} · ${esc(c.code)}</div>
      </div>
      <div class="top-right">
        ${score ? ring(score.score, 40, '', t('match.aria', { n: score.score })) : ''}
        <button type="button" class="btn icon-btn" data-act="compare" data-id="${esc(c.id)}" aria-pressed="${inCompare}" aria-label="${inCompare ? t('compare.remove') : t('compare.add')}" title="${inCompare ? t('compare.in') : full ? t('compare.full') : t('compare.add')}" ${full ? 'disabled' : ''}>${icon(inCompare ? 'check' : 'plus')}</button>
      </div>
    </div>
    <div class="tags">${catPill(c)}${flag(c)}</div>
    ${c.domains.length ? dbar(c) : ''}
    <div class="facts-inline">
      ${feeFact(c)}
      <span>${icon('clock')}${esc(duration(c))}</span>
      ${lvl(c.level)}
    </div>
  </article>`;
}

// ---------- study paths ----------
// data/paths.json: suggested orders by goal. The home page shows one compact card per path of the
// chosen category, and each opens #path?id=… with its steps.
const pathText = (v) => (v ? v[getLang()] || v.en : '');
const pathById = (id) => (DATA.paths || []).find((p) => p.id === id);

function chain(p) {
  const step = (s) => {
    const [first, ...alts] = s.certs.map((id) => BY_ID.get(id)).filter(Boolean);
    return first ? `<span class="step-b">${esc(shortName(first))}${alts.length ? `<small>+${alts.length}</small>` : ''}</span>` : '';
  };
  return p.steps.map(step).join(`<span class="step-arrow" aria-hidden="true">${icon('arrow-right')}</span>`);
}

function renderPaths() {
  const shown = pathsFor(DATA.paths, filters.cat);
  $('#paths').hidden = !shown.length;
  $('#path-strip').innerHTML = shown
    .map((p) => {
      const m = CATS[p.category] || { icon: 'layers', c: '--accent' };
      const names = p.steps.map((s) => s.certs.map((id) => BY_ID.get(id)).filter(Boolean).map(shortName).reduce((a, b) => t('paths.or', { a, b }))).join(', ');
      return `<a class="card path-card" href="#path?id=${esc(p.id)}" style="--c:var(${m.c})" title="${esc(pathText(p.summary))}">
        <span class="path-top">${tile(m.icon, m.c, 'xs')}<b>${esc(pathText(p.title))}</b></span>
        <span class="path-sum">${esc(pathText(p.summary))}</span>
        <span class="path-chain" role="img" aria-label="${esc(t('paths.chain', { x: names }))}">${chain(p)}</span>
      </a>`;
    })
    .join('');
}

function renderPath(id) {
  const p = pathById(id);
  if (!p) return notFound('#path-body', t('paths.notFound'), id);
  const m = CATS[p.category] || { icon: 'layers', c: '--accent' };
  const first = p.steps[0].certs.find((c) => BY_ID.has(c));
  $('#path-body').innerHTML = `
    <a class="back" href="#list">${icon('arrow-left')}${t('cert.back')}</a>
    <div class="page-head path-head">${tile(m.icon, m.c)}<div><p class="eyebrow">${esc(t('paths.title'))} · ${esc(catName(p.category))}</p><h1 tabindex="-1">${esc(pathText(p.title))}</h1></div></div>
    <p class="path-lede">${esc(pathText(p.summary))}</p>
    <ol class="path-steps">${p.steps
      .map(
        (s, i) => `<li class="path-step">
          <span class="path-node" aria-hidden="true">${i + 1}</span>
          <div class="path-step-body">
            <h2>${esc(t('paths.step', { n: i + 1 }))}</h2>
            <p class="hint">${esc(pathText(s.note))}</p>
            <div class="grid">${s.certs.map((c) => BY_ID.get(c)).filter(Boolean).map((c, k) => card(c, null, k)).join('')}</div>
          </div>
        </li>`,
      )
      .join('')}</ol>
    <div class="path-cta">
      ${first ? `<a class="btn primary" href="#plan?cert=${esc(first)}">${icon('route')}${t('paths.planFirst')}</a>` : ''}
      <p class="hint">${esc(t('paths.note'))}</p>
    </div>`;
  document.title = `${pathText(p.title)} · pathfinder`;
}

// ---------- not found ----------
/** A link to a certification or path that isn't in the catalog: say so, offer close matches and a search. */
function notFound(target, title, id) {
  // Close matches: the whole id first, else its words, codes before the rest ("aws-saa-c09" → SAA).
  const words = String(id || '').replace(/[-_]+/g, ' ').trim();
  let found = search(words).ids;
  if (!found.length) {
    const parts = words.split(' ').filter((w) => /[a-z]{2}/i.test(w)).map((w) => search(w));
    found = [...new Set([...parts.flatMap((r) => r.exact), ...parts.flatMap((r) => r.ids)])];
  }
  const guess = found.slice(0, 3).map((x) => BY_ID.get(x));
  $(target).innerHTML = `<div class="card not-found">
      <span class="head-icon">${icon('scan-search')}</span>
      <h1 tabindex="-1">${esc(title)}</h1>
      <p class="hint">${esc(t('notFound.text'))}</p>
      <form class="nf-search" role="search">
        <label class="search"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><input type="search" name="q" value="${esc(words)}" aria-label="${esc(t('search.aria'))}" placeholder="${esc(t('search.placeholder'))}"></label>
        <button type="submit" class="btn">${t('notFound.search')}</button>
      </form>
      ${guess.length ? `<div class="nf-guess"><p class="label">${esc(t('notFound.maybe'))}</p><ul>${guess.map((c) => `<li><a href="#cert?id=${esc(c.id)}">${badge(c, 32, { label: false })}<span><b>${esc(c.name)}</b><small>${esc(c.provider)} · ${esc(c.code)}</small></span></a></li>`).join('')}</ul></div>` : ''}
      <a class="btn primary" href="#list">${icon('layout-grid')}${t('notFound.catalog')}</a>
    </div>`;
  $('form', $(target)).addEventListener('submit', (e) => {
    e.preventDefault();
    const q = e.currentTarget.q.value.trim();
    filters = { ...emptyFilters(), q };
    syncControls();
    jumpToResults = !!q;
    location.hash = q ? `#list?${filtersToParams(filters)}` : '#list';
  });
  document.title = `${title} · pathfinder`;
}

// ---------- certification page ----------
/** The planner's starting range for the level, "25–45 h". */
function studyHours(c) {
  const range = DATA.taxonomy.levels.find((l) => l.id === c.level)?.hours;
  return range ? `${range[0]}–${range[1]} h` : '';
}

/** Exam languages by name in the interface language, Spanish first: { es: [...], other: [...] } or null when unknown. */
function examLangs(c) {
  const codes = c.exam.languages;
  if (!Array.isArray(codes) || !codes.length) return null;
  let names;
  try {
    names = new Intl.DisplayNames([getLang()], { type: 'language' });
  } catch {
    names = { of: (x) => x };
  }
  const name = (code) => {
    try {
      return cap(names.of(code) || code);
    } catch {
      return code;
    }
  };
  const isEs = (code) => /^es(-|$)/i.test(code);
  return { es: codes.filter(isEs).map(name), other: codes.filter((x) => !isEs(x)).map(name) };
}

/** "Spanish, English and 3 more" with Spanish marked, as HTML; plain text for a title. */
function langsHtml(langs, shown = 2) {
  const list = [...langs.es.map((n) => `<mark class="es">${esc(n)}</mark>`), ...langs.other.map(esc)];
  const rest = list.length - shown;
  return rest > 1 ? `${list.slice(0, shown).join(', ')} ${esc(t('stat.langsMore', { n: rest }))}` : list.join(', ');
}

function deliveryText(c) {
  const d = c.exam.delivery;
  if (!Array.isArray(d) || !d.length) return '';
  return d.includes('online') && d.includes('test-center') ? t('delivery.both') : t(`delivery.${d[0]}`);
}

/** A certification as one compact linked row, for the next steps and related ones. */
const mini = (c, note = '') =>
  `<a class="mini" href="#cert?id=${esc(c.id)}">${badge(c, 40, { label: false })}<span class="mini-text"><b>${esc(c.name)}</b><small>${esc(c.provider)} · ${esc(c.code)}${note ? ` · ${esc(note)}` : ''}</small></span><span class="mini-meta">${esc(fee(c))}${lvl(c.level)}</span></a>`;

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
  const stat = (ic, label, value, sub, { html = false, title = '' } = {}) =>
    value
      ? `<div class="card stat"${title ? ` title="${esc(title)}"` : ''}>${tile(ic, color, 'sm')}<div><small>${label}</small><b>${html ? value : esc(value)}</b>${sub ? `<small class="sub">${esc(sub)}</small>` : ''}</div></div>`
      : '';
  const notes = [
    c.requirements && c.status === 'restricted' ? ['lock', c.requirements] : null,
    c.exam.format ? ['pen-line', c.exam.format] : null,
    c.fee.note ? ['badge-dollar-sign', c.fee.note] : null,
    c.ai_policy ? ['bot', t('cert.ai', { x: c.ai_policy })] : null,
    ...c.caveats.map((x) => ['info', x]),
  ].filter(Boolean);
  const langs = examLangs(c);
  const when = (d) => day(d, { weekday: false, year: true });
  const today = todayLocal();

  // Dated changes: a version retiring, a new outline, a deadline.
  const timeline = (c.timeline || []).filter((e) => e && e.date && e.text);
  const timelineHtml = timeline.length
    ? `<section class="card panel"><h2>${icon('calendar-clock')}${t('cert.timeline')}</h2><ul class="timeline">${timeline
        .map(
          (e) => `<li class="${e.date < today ? 'past' : ''}"><span class="tl-date">${esc(when(e.date))}</span><span class="tl-body"><span class="tag${e.kind === 'retires' || e.kind === 'deadline' ? ' warn' : ''}">${esc(e.date < today ? t('timeline.past') : t(`timeline.${e.kind}`))}</span> ${esc(e.text)}</span></li>`,
        )
        .join('')}</ul></section>`
    : '';

  // Free routes, discounts, retakes and accommodations, as the issuer publishes them.
  const access = c.access || {};
  const accessItem = (kind, x) =>
    `<li><span class="tag${kind === 'free_routes' ? ' good' : ''}">${esc(t(`access.${kind}`))}</span> <span>${esc(x.text)}${x.until ? ` <span class="muted">(${esc(t('access.until', { d: when(x.until) }))})</span>` : ''}${x.url ? ` ${ext(x.url, `${icon('external-link')}<span class="sr">${esc(t('cert.issuer'))}</span>`, 'ext-ic')}` : ''}</span></li>`;
  const accessRows = [
    ...(access.free_routes || []).map((x) => accessItem('free_routes', x)),
    ...(access.discounts || []).map((x) => accessItem('discounts', x)),
    ...['retake', 'accommodations'].filter((k) => access[k]).map((k) => accessItem(k, { text: access[k] })),
  ];
  const accessHtml = accessRows.length ? `<section class="card panel"><h2>${icon('badge-dollar-sign')}${t('cert.access')}</h2><ul class="access">${accessRows.join('')}</ul></section>` : '';

  const left = [
    timelineHtml,
    c.domains.length
      ? `<section class="card panel"><h2>${icon('layers')}${t('cert.domains')}</h2><div class="donut-wrap">${donut(c.domains, 168, { label: t('donut.label'), aria: t('donut.aria') })}${legend(c)}</div>${c.domains_note ? `<p class="hint domains-note">${esc(c.domains_note)}</p>` : ''}</section>`
      : '',
    mine
      ? `<section class="card panel"><h2>${icon('sliders-horizontal')}${t('cert.why')}</h2><div class="for-you">${ring(mine.score, 76, 'lg', t('match.aria', { n: mine.score }))}<ul class="why">${mine.reasons
          .map((r) => `<li>${icon('circle-check')}<span>${esc(lib(r))}</span></li>`)
          .join('')}${mine.warnings.map((w) => `<li class="warn">${icon('triangle-alert')}<span>${esc(lib(w))}</span></li>`).join('')}</ul></div></section>`
      : '',
    notes.length
      ? `<section class="card panel"><h2>${icon('info')}${t('cert.good')}</h2><ul class="notes">${notes.map(([ic, t]) => `<li>${icon(ic)}<span>${esc(t)}</span></li>`).join('')}</ul></section>`
      : '',
    accessHtml,
  ].join('');
  const resource = (r) => {
    const k = prepKind(r);
    const spanish = /^es(-|$)/i.test(r.lang || '');
    return ext(
      r.url,
      `${tile(k.icon, color, 'sm')}<span><b>${esc(r.title)}</b>${r.note ? `<small>${esc(r.note)}</small>` : ''}<span class="res-kind">${esc(k.label)} · ${r.cost === 'paid' ? t('paid') : t('free')}${spanish ? ` · <mark class="es">${esc(t('res.spanish'))}</mark>` : ''}</span></span>`,
      'res',
    );
  };
  // The first few resources show; the rest fold away so the column stays near the length of the other one.
  // In Spanish, resources in Spanish come first.
  const PREP_SHOWN = 5;
  const prep = [...(c.prep || [])].sort((a, b) => (getLang() === 'es' ? Number(/^es/i.test(b.lang || '')) - Number(/^es/i.test(a.lang || '')) : 0));
  const prepHtml = prep.length
    ? `<section class="card panel"><h2>${icon('graduation-cap')}${t('cert.prep')}</h2><div class="resources">${prep.slice(0, PREP_SHOWN).map(resource).join('')}</div>${
        prep.length > PREP_SHOWN
          ? `<details class="more more-res"><summary>${t('cert.morePrep', { n: prep.length - PREP_SHOWN })}</summary><div class="resources">${prep.slice(PREP_SHOWN).map(resource).join('')}</div></details>`
          : ''
      }</section>`
    : '';
  const reportsHtml = reports.length
    ? `<section class="card panel"><h2>${icon('book-open')}${t('cert.reports')}</h2><p class="hint">${t('cert.reportsHint')}</p>${reports
        .map((r) => `<div class="report">${ext(r.url, esc(r.title))} <span class="muted">· ${esc(r.platform)}</span><p>${esc(r.summary)}</p></div>`)
        .join('')}</section>`
    : '';
  const sourcesHtml = `<section class="card panel"><h2>${icon('file-text')}${t('cert.sources')}</h2>
      <p class="hint">${esc(t('cert.checked', { d: when(c.checked_on) }))}</p>
      ${c.badge && c.badge.source ? `<p class="hint">${ext(c.badge.source, esc(t('cert.badgeFrom')))}</p>` : ''}
      <details class="more"><summary>${t('cert.nSources', { n: sources.length })}</summary>${sources
        .map((s) => ext(s.url, `${esc(s.title)}${s.note ? `<small>${esc(s.note)}</small>` : ''}`, 'src'))
        .join('')}</details>
    </section>`;
  // Resources and reports on the right; sources sit under the left column on wide screens.
  const right = prepHtml + reportsHtml || sourcesHtml;
  const tail = prepHtml + reportsHtml ? `<div class="col-tail">${sourcesHtml}</div>` : '';

  // What follows it in the study paths, then others of its area one level around it.
  const next = nextSteps(c.id, DATA.paths);
  const nextIds = next.flatMap((s) => s.certs);
  const near = similar(c, DATA.certifications, { exclude: nextIds });
  const nextHtml = next.length
    ? `<section class="card panel"><h2>${icon('route')}${t('cert.next')}</h2><div class="minis">${next
        .flatMap((s) => s.certs.map((x) => BY_ID.get(x)).filter(Boolean).map((x) => mini(x)))
        .join('')}</div><p class="hint next-in">${next.map((s) => `<a href="#path?id=${esc(s.path.id)}">${esc(t('cert.nextIn', { x: pathText(s.path.title) }))}</a>`).join(' · ')}</p></section>`
    : '';
  const nearHtml = near.length ? `<section class="card panel"><h2>${icon('layout-grid')}${t('cert.related')}</h2><div class="minis">${near.map((x) => mini(x)).join('')}</div></section>` : '';

  // In Spanish, what paying from Argentina adds to a US dollar price.
  const ar = getLang() === 'es' && c.fee.usd !== 0 ? DATA.regions?.AR?.es : '';
  // Its first sentence says what changes; the rest (taxes, refunds) folds away.
  const [arLead, arRest] = ar ? [ar.split(/(?<=\.)\s+/)[0], ar.split(/(?<=\.)\s+/).slice(1).join(' ')] : ['', ''];

  const stats = [
    stat('badge-dollar-sign', t('stat.price'), fee(c), ex(c.fee.basis)),
    stat('clock', t('stat.length'), duration(c)),
    stat('list-checks', t('stat.questions'), ex(c.exam.questions)),
    stat('target', t('stat.passing'), ex(c.exam.passing)),
    stat('calendar-check', t('stat.valid'), ex(c.exam.validity)),
    stat('pen-line', t('stat.format'), LABELS[c.exam.style]),
    stat('book-open', t('stat.hours'), studyHours(c), t('stat.hoursSub')),
    langs ? stat('languages', t('stat.langs'), langsHtml(langs), '', { html: true, title: [...langs.es, ...langs.other].join(', ') }) : '',
    stat('building-2', t('stat.delivery'), deliveryText(c)),
    stat(c.status === 'restricted' ? 'lock' : 'clipboard-list', t('stat.registration'), LABELS[c.status]),
  ].filter(Boolean);
  // One row when they fit, otherwise two even rows on wide screens.
  const cols = stats.length <= 7 ? stats.length : Math.ceil(stats.length / 2);

  $('#cert-body').innerHTML = `
    <a class="back" href="#">${icon('arrow-left')}${t('cert.back')}</a>
    <div class="card cert-hero" style="--pc:${providerColor(c.provider)}">
      <div class="hero-badge">${badge(c, 128)}</div>
      <div>
        <p class="who"><span>${esc(c.provider)} · ${esc(c.code)}</span>${lvl(c.level)}${catPill(c)}${flag(c)}</p>
        <h1 tabindex="-1">${esc(c.name)}</h1>
        <p class="scope">${esc(c.scope)}</p>
        <div class="cert-actions">
          <a class="btn primary" href="#plan?cert=${esc(c.id)}">${icon('route')}${t('cert.plan')}</a>
          ${c.practice_questions ? `<a class="btn" href="#practice?cert=${esc(c.id)}">${icon('dumbbell')}${t('practice.btn')}</a>` : ''}
          <button type="button" class="btn" data-act="compare" data-id="${esc(c.id)}" aria-pressed="${inCompare}" ${full ? `disabled title="${t('compare.full')}"` : ''}>${icon(inCompare ? 'check' : 'columns-3')}${inCompare ? t('compare.in') : t('compare.btn')}</button>
          <button type="button" class="btn" data-act="share" data-id="${esc(c.id)}">${icon('share-2')}${t('cert.share')}</button>
          ${official ? ext(official.url, `${icon('external-link')}${t('cert.issuer')}`, 'btn') : ''}
        </div>
      </div>
    </div>
    <div class="stat-grid" style="--cols:${cols}">${stats.join('')}</div>
    ${ar ? `<div class="ar-note">${icon('info')}<div><p><b>${esc(t('cert.ar'))}.</b> ${esc(arLead)}</p>${arRest ? `<details><summary>${t('cert.arMore')}</summary><p>${esc(arRest)}</p></details>` : ''}</div></div>` : ''}
    <div class="cols cert-cols"><div>${left}</div><div class="col-side">${right}</div>${tail}</div>
    ${nextHtml || nearHtml ? `<div class="cols cert-next">${nextHtml}${nearHtml}</div>` : ''}
    <div class="cta-bar" id="cta-bar">
      <a class="btn primary" href="#plan?cert=${esc(c.id)}">${icon('route')}${t('cert.plan')}</a>
      ${c.practice_questions ? `<a class="btn" href="#practice?cert=${esc(c.id)}">${icon('dumbbell')}${t('practice.btn')}</a>` : ''}
    </div>`;
  watchCta();
}

// On phones a bar with the plan and practice buttons stays at the bottom once the ones at the top scroll away.
let ctaWatch = null;
function watchCta() {
  ctaWatch?.disconnect();
  const actions = $('#cert-body .cert-actions');
  const bar = $('#cta-bar');
  if (!actions || !bar || !('IntersectionObserver' in window)) return;
  ctaWatch = new IntersectionObserver(([e]) => bar.classList.toggle('on', !e.isIntersecting && e.boundingClientRect.top < 0));
  ctaWatch.observe(actions);
}

// ---------- compare page ----------
// One table: a row per fact, a column per certification. The names stay in a header that sticks
// under the top bar, so on a phone, where the columns get narrow, you always see which is which.
function renderCompare() {
  const certs = compare.map((id) => BY_ID.get(id)).filter(Boolean);
  const body = $('#compare-body');
  if (!certs.length) {
    body.innerHTML = `<p class="empty">${t('compare.empty')}</p>`;
    return;
  }
  const link = `${location.origin}${location.pathname}#compare?ids=${certs.map((c) => c.id).join(',')}`;
  const dash = '<span class="muted">—</span>';
  const row = (ic, label, value, cls = '') =>
    `<div class="cmp-r${cls ? ` ${cls}` : ''}" role="row"><div class="cmp-label" role="rowheader">${icon(ic)}<span>${label}</span></div>${certs
      .map((c) => `<div class="cmp-v" role="cell">${value(c) || dash}</div>`)
      .join('')}</div>`;
  const text = (s) => (s ? esc(s) : '');
  const sub = (s) => (s ? `<small>${esc(s)}</small>` : '');
  body.innerHTML = `
    <div class="compare-tools">
      <button type="button" class="btn" id="copy-compare">${icon('link')}${t('copyLink')}</button>
      <button type="button" class="btn" id="clear-compare">${icon('x')}${t('clear')}</button>
    </div>
    <p class="copy-spot" id="copy-spot" hidden></p>
    <div class="cmp" role="table" aria-label="${esc(t('compare.title'))}" style="--n:${certs.length}">
      <div class="cmp-r cmp-head" role="row"><div class="cmp-label" role="columnheader"></div>${certs
        .map(
          (c) => `<div class="cmp-cert" role="columnheader">${badge(c, 40, { label: false })}<div><h2><a href="#cert?id=${esc(c.id)}"><span class="long">${esc(c.name)}</span><span class="short">${esc(shortName(c))}</span></a></h2><small>${esc(c.provider)} · ${esc(c.code)}</small></div></div>`,
        )
        .join('')}</div>
      ${row('badge-dollar-sign', t('stat.price'), (c) => `${text(fee(c))}${sub(ex(c.fee.basis))}`)}
      ${row('clock', t('stat.length'), (c) => text(duration(c)))}
      ${row('list-checks', t('stat.questions'), (c) => text(ex(c.exam.questions)))}
      ${row('target', t('stat.passing'), (c) => text(ex(c.exam.passing)))}
      ${row('calendar-check', t('stat.valid'), (c) => text(ex(c.exam.validity)))}
      ${row('gauge', t('stat.level'), (c) => lvl(c.level))}
      ${row('book-open', t('stat.hours'), (c) => text(studyHours(c)))}
      ${row('languages', t('stat.langs'), (c) => {
        const langs = examLangs(c);
        return langs ? langsHtml(langs, 3) : '';
      })}
      ${row('building-2', t('stat.delivery'), (c) => text(deliveryText(c)))}
      ${row('pen-line', t('stat.format'), (c) => text(LABELS[c.exam.style]))}
      ${row('dumbbell', t('stat.practice'), (c) => (c.practice_questions ? `<a href="#practice?cert=${esc(c.id)}">${esc(t('compare.practiceN', { n: c.practice_questions }))}</a>` : `<span class="muted">${esc(t('compare.noPractice'))}</span>`))}
      ${row(certs.some((c) => c.status === 'restricted') ? 'lock' : 'clipboard-list', t('stat.registration'), (c) => text(LABELS[c.status]))}
      ${row('layers', t('stat.domains'), (c) => (c.domains.length ? dbar(c) + legend(c) : ''), 'cmp-domains')}
      ${row('bot', t('stat.ai'), (c) => text(c.ai_policy))}
      <div class="cmp-r cmp-actions" role="row"><div class="cmp-label" role="rowheader"></div>${certs
        .map(
          (c) => `<div class="cmp-v" role="cell"><a class="btn" href="#plan?cert=${esc(c.id)}">${icon('route')}${t('compare.plan')}</a><button type="button" class="link" data-act="compare" data-id="${esc(c.id)}">${t('compare.removeOne')}</button></div>`,
        )
        .join('')}</div>
    </div>`;
  $('#copy-compare').addEventListener('click', (e) => copyOrShare(link, e.currentTarget, $('#copy-spot')));
  $('#clear-compare').addEventListener('click', () => {
    setCompare([]);
    renderCompare();
  });
}

/** Copies a link; where the clipboard is blocked, offers the share sheet, and failing that the link itself, selected. */
async function copyOrShare(text, button, spot) {
  try {
    await navigator.clipboard.writeText(text);
    const before = button.innerHTML;
    button.innerHTML = `${icon('check')}${t('copied')}`;
    setTimeout(() => (button.innerHTML = before), 1500);
    return;
  } catch {
    /* blocked: try the next way */
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: `${t('compare.title')} · pathfinder`, url: text });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  spot.hidden = false;
  spot.innerHTML = `<label>${esc(t('copy.manual'))} <input type="text" readonly value="${esc(text)}"></label>`;
  const input = $('input', spot);
  input.focus();
  input.select();
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
    .map((d) => `<label><input type="checkbox" name="days" value="${d}" ${[1, 3, 5, 6].includes(d) ? 'checked' : ''}><span></span></label>`)
    .join('');
  labelDays();
  f.start.value = todayLocal();
}

function labelDays() {
  const D = dates();
  $$('#days label').forEach((l) => {
    const d = Number($('input', l).value);
    l.title = D.dayNames[d];
    $('input', l).setAttribute('aria-label', D.dayNames[d]);
    $('span', l).textContent = D.days[d];
  });
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
  $('#hours-hint').innerHTML = `${esc(t('plan.suggested', { h: suggested, level: LABELS[cert.level].toLowerCase() }))}${off ? ` · <button type="button" class="link" data-act="use-hours">${t('plan.useIt')}</button>` : ''}`;
}

const confidenceKey = (id) => `${KEYS.confidence}${id}`;

function renderConfidence() {
  const cert = BY_ID.get($('#plan-form').cert.value);
  const { topics } = planTopics(cert);
  const saved = store.get(confidenceKey(cert.id), {});
  $('#confidence-rows').innerHTML = topics
    .map((tp, i) => {
      const current = saved[tp.name] || 3;
      const options = [1, 2, 3, 4, 5]
        .map((n) => `<label><input type="radio" name="conf-${i}" value="${n}" data-topic="${esc(tp.name)}" ${n === current ? 'checked' : ''}><span>${n}</span></label>`)
        .join('');
      return `<div class="conf-row"><span>${esc(lib(tp.name))}</span><div class="scale" role="radiogroup" aria-label="${esc(t('plan.confAria', { x: lib(tp.name) }))}">${options}</div></div>`;
    })
    .join('');
  setRatedLabel(Object.keys(saved).length);
}

function setRatedLabel(n) {
  $('#confidence summary span').textContent = n ? t('plan.rated', { n }) : t('plan.rate');
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
  // No certification asked for and none picked yet on this visit, or one the catalog doesn't
  // have: ask, instead of planning for whichever comes first in the list.
  if (id ? !BY_ID.has(id) : !f.dataset.init) return choosePlanCert(id);
  showPlanForm(true);
  if (id && f.cert.value !== id) {
    f.cert.value = id;
    hoursTouched = false;
  }
  if (params.get('hours')) {
    f.hours.value = params.get('hours');
    hoursTouched = true;
  }
  if (params.get('start')) f.start.value = params.get('start');
  if (params.get('len')) setSessionLength(f.sessionMinutes, params.get('len'));
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

function showPlanForm(on) {
  $('#plan-choose').hidden = on;
  $('#plan-form').hidden = !on;
  $('#plan-output').hidden = !on;
}

/** Lowercase without accents, for matching what people type. */
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A link row with the certification's badge, for the choosers. */
const certRow = (c, href, sub) =>
  `<li><a class="choose-row" href="${esc(href)}">${badge(c, 34, { label: false })}<span><b>${esc(c.name)}</b><small>${esc(sub)}</small></span>${icon('arrow-right')}</a></li>`;

function choosePlanCert(unknown) {
  showPlanForm(false);
  const plans = Object.values(trackedPlans()).filter((params) => BY_ID.has(params.cert));
  const picks = compare.map((id) => BY_ID.get(id)).filter(Boolean);
  const box = $('#plan-choose');
  box.innerHTML = `
    ${unknown ? `<div class="status warn">${icon('triangle-alert')}<span>${esc(t('plan.unknown', { x: unknown }))}</span></div>` : ''}
    <section class="card panel choose">
      <h2>${icon('search')}${t('plan.choose')}</h2>
      <input type="search" id="plan-q" placeholder="${esc(t('plan.chooseSearch'))}" aria-label="${esc(t('plan.chooseSearch'))}" autocomplete="off" spellcheck="false">
      <ul class="choose-list" id="plan-q-list"></ul>
      <p class="hint" id="plan-q-hint"></p>
    </section>
    ${plans.length ? `<section class="card panel"><h2>${icon('activity')}${t('plan.yourPlans')}</h2><ul class="choose-list">${plans
      .map((params) => {
        const c = BY_ID.get(params.cert);
        return certRow(c, `#plan?${new URLSearchParams(params)}`, `${c.provider} · ${c.code}${params.exam ? ` · ${t('progress.examOn', { d: day(params.exam) })}` : ''}`);
      })
      .join('')}</ul></section>` : ''}
    ${picks.length ? `<section class="card panel"><h2>${icon('columns-3')}${t('plan.inCompare')}</h2><ul class="choose-list">${picks.map((c) => certRow(c, `#plan?cert=${c.id}`, `${c.provider} · ${c.code}`)).join('')}</ul></section>` : ''}`;
  const input = $('#plan-q');
  const paint = () => {
    const q = fold(input.value.trim());
    const words = q.split(/\s+/).filter(Boolean);
    const hay = (c) => fold(`${c.name} ${c.code} ${c.provider}`);
    // The exact code first, then the more words found in the code, then names that start with it.
    const rank = (c) => (fold(c.code) === q ? -99 : 0) - 2 * words.filter((w) => fold(c.code).includes(w)).length - (fold(c.name).startsWith(q) ? 1 : 0);
    const hits = words.length ? DATA.certifications.filter((c) => words.every((w) => hay(c).includes(w))).sort((a, b) => rank(a) - rank(b)).slice(0, 8) : [];
    $('#plan-q-list').innerHTML = hits.map((c) => certRow(c, `#plan?cert=${c.id}`, `${c.provider} · ${c.code}`)).join('');
    $('#plan-q-hint').innerHTML = words.length && !hits.length ? esc(t('plan.chooseNone')) : words.length ? '' : t('plan.chooseHint');
  };
  input.addEventListener('input', paint);
  input.addEventListener('keydown', (e) => {
    const first = $('#plan-q-list a');
    if (e.key !== 'Enter' || !first) return;
    e.preventDefault();
    location.hash = first.getAttribute('href');
  });
  paint();
  if (matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
}

// A shared or tracked plan can carry any length the list doesn't offer (2 h 15,
// say). Without an option for it the select goes blank and the plan fails.
function setSessionLength(select, value) {
  const m = Math.round(Number(value));
  if (!(m >= 15)) return;
  if (![...select.options].some((o) => Number(o.value) === m)) {
    const after = [...select.options].find((o) => Number(o.value) > m);
    select.insertBefore(new Option(len(m), String(m)), after || null);
  }
  select.value = String(m);
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

/** Sessions per kind as small chips: "Practice 2 · Fix 1". */
const kindCounts = (sessions) => {
  const n = new Map();
  for (const s of sessions) n.set(s.kind, (n.get(s.kind) || 0) + 1);
  return `<ul class="cut-kinds">${[...n].map(([k, c]) => `<li><span class="k ${kindN(k)}" ${kindStyle(k)}>${icon(KIND[k].icon)}</span>${esc(kindLabel(k))} <b>${c}</b></li>`).join('')}</ul>`;
};

/** Behind on the plan: how far, and what rescheduling from today would do. Empty when on track. */
function behindHtml(p, done, days, key) {
  const today = todayLocal();
  const late = behind(p.sessions, [...done], today);
  if (!late.count) return '';
  const target = p.deadline?.targetDate || null;
  const r = reschedule({ sessions: p.sessions, done: [...done], today, days, targetDate: target });
  const skipped = p.sessions.filter((s) => r.skipped.includes(s.n));
  const what = !r.available
    ? `<p>${esc(t('plan.reschedNone', { d: day(target) }))}</p>`
    : skipped.length
      ? `<p>${esc(t('plan.reschedCut', { n: r.remaining, a: r.available }))}</p>${kindCounts(skipped)}`
      : `<p>${esc(t(target ? 'plan.reschedFits' : 'plan.reschedOpen', { n: r.remaining, a: r.available }))}</p>`;
  return `<div class="status warn stack">${icon('triangle-alert')}<div><p><b>${esc(t('plan.behind', { n: late.count, d: day(late.since) }))}</b></p>${what}
    ${r.available ? `<p><button type="button" class="btn" data-act="resched" data-key="${esc(key)}">${icon('calendar-clock')}${t('plan.reschedule')}</button></p>` : ''}</div></div>`;
}

function statusHtml(p, done, days, key) {
  const d = p.deadline;
  const moved = p.rescheduled
    ? `<div class="status info resched">${icon('calendar-clock')}<span>${esc(t('plan.rescheduled', { d: day(p.rescheduled.on) }))}${p.skipped?.length ? ` ${esc(t('plan.leftOut'))}` : ''}</span>${p.skipped?.length ? kindCounts(p.skipped) : ''}<button type="button" class="link" data-act="unresched" data-key="${esc(key)}">${t('plan.undo')}</button></div>`
    : '';
  // Behind replaces the "fits" line: it no longer holds until the plan is rescheduled.
  const late = behindHtml(p, done, days, key);
  if (late && (!d || d.fits)) return late + moved;
  if (!d) return `<div class="status info">${icon('flag')}${esc(t('plan.statusInfo', { d: day(p.examDate) }))}</div>${moved}`;
  if (d.fits) {
    // After a reschedule the spare days are the ones left after the last session.
    const next = utc(p.sessions.at(-1).date);
    next.setUTCDate(next.getUTCDate() + 1);
    const spare = p.rescheduled ? countStudyDays(iso(next), d.targetDate, days) : d.spare;
    return `<div class="status good">${icon('circle-check')}${esc(t('plan.fits', { d: day(d.targetDate), spare }))}</div>${moved}`;
  }
  const fixes = [];
  if (d.suggestedMinutes) fixes.push(t('plan.fixLen', { x: len(d.suggestedMinutes) }));
  fixes.push(t('plan.fixDays'));
  fixes.push(t('plan.fixExam', { d: day(p.examDate) }));
  // The sessions stop before the exam anyway; say what was cut to get there.
  const cut = p.cut
    ? `<p>${esc(t('plan.cut', { n: p.sessions.length, h: p.hours, N: p.cut.sessions, H: p.cut.hours }))}</p>
      <ul class="cut-kinds" aria-label="${esc(t('plan.cutAria'))}">${p.cut.kinds.map((k) => `<li><span class="k ${kindN(k.kind)}" ${kindStyle(k.kind)}>${icon(KIND[k.kind].icon)}</span>${esc(kindLabel(k.kind))} <b>${k.from} → ${k.to}</b></li>`).join('')}</ul>
      ${p.cut.grouped ? `<p>${esc(t('plan.cutGrouped'))}</p>` : ''}`
    : '';
  return `${late}<div class="status warn stack">${icon('triangle-alert')}<div><p><b>${esc(t('plan.noFit', { d: day(d.targetDate), needed: d.needed, available: d.available, fixes }))}</b></p>${cut}</div></div>${moved}`;
}

function monthsHtml(p, done) {
  const byDate = new Map(p.sessions.map((s) => [s.date, s]));
  const today = todayLocal();
  const examDay = p.deadline ? p.deadline.targetDate : p.examDate;
  const first = utc(p.sessions[0].date);
  const last = utc([p.sessions.at(-1).date, examDay].sort().at(-1));
  const out = [];
  let y = first.getUTCFullYear();
  let m = first.getUTCMonth();
  while (y < last.getUTCFullYear() || (y === last.getUTCFullYear() && m <= last.getUTCMonth())) {
    const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells = dates().dow.map((d) => `<span class="dow">${d}</span>`);
    for (let i = 0; i < lead; i++) cells.push('<span></span>');
    for (let d = 1; d <= days; d++) {
      const date = iso(new Date(Date.UTC(y, m, d)));
      const s = byDate.get(date);
      const isToday = date === today ? ' today' : '';
      if (s) {
        const state = done.has(s.n) ? ' done' : date < today ? ' missed' : '';
        cells.push(`<span class="d s ${kindN(s.kind)}${state}${isToday}" data-n="${s.n}" ${kindStyle(s.kind)} title="${esc(`${day(date)} · ${kindLabel(s.kind)}: ${cap(sname(s))}`)}">${icon(KIND[s.kind].icon)}</span>`);
      } else if (date === examDay) {
        cells.push(`<span class="d exam${isToday}" title="${esc(`${day(date)} · ${t('plan.examDay')}`)}">${icon('target')}</span>`);
      } else {
        cells.push(`<span class="d${isToday}">${d}</span>`);
      }
    }
    out.push(`<div class="card month"><h3>${dates().monthNames[m]} ${y}</h3><div class="mgrid">${cells.join('')}</div></div>`);
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
    out.innerHTML = `<p class="empty">${esc(lib(err.message))}.</p>`;
    return;
  }
  const planStart = p.sessions[0].date;
  const progressKey = `${KEYS.progress}${p.cert.id}:${planStart}`;
  p = movedPlan(p, progressKey, days);
  const done = new Set(store.get(progressKey, []));
  const tracked = isTracked(progressKey);
  if (tracked) setTracked(progressKey, trackParams(), true);
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
  const today = todayLocal();
  const stopState = (s) => (done.has(s.n) ? ' done' : s.date < today ? ' missed' : s.date === today ? ' today' : '');
  const stopTag = (s) => (done.has(s.n) ? '' : s.date < today ? `<span class="tag warn">${t('progress.legendMissed')}</span>` : s.date === today ? `<span class="tag">${t('progress.today')}</span>` : '');
  // Sessions that have practice to go with them link to it: the session's domain, a full timed
  // mock, a short diagnostic, or the review queue. The run ticks the session off when it ends.
  const PRACTICE_LINK = { baseline: 'practice.linkBaseline', practice: 'practice.linkDomain', mock: 'practice.linkMock', remediate: 'practice.linkReview' };
  const practiceHref = (s) => {
    if (s.kind === 'remediate') return `#practice?cert=${cert.id}&tab=review`;
    const q = new URLSearchParams({ cert: cert.id, plan: planStart, s: s.n });
    if (s.kind === 'practice' && s.topic) q.set('domain', s.topic);
    if (s.kind === 'mock') q.set('mode', 'mock');
    if (s.kind === 'baseline') q.set('size', '10');
    return `#practice?${q}`;
  };
  const stop = (s) => `<li class="stop${stopState(s)}" data-kind="${s.kind}">
      <span class="node ${kindN(s.kind)}" ${kindStyle(s.kind)}>${icon(KIND[s.kind].icon)}</span>
      <div class="card body">
        <small>${day(s.date)} · ${kindLabel(s.kind)}${stopTag(s)}</small>
        <b>${esc(cap(sname(s)))}</b>
        <span class="len">${icon('clock')}${len(s.minutes)}</span>
        ${cert.practice_questions && PRACTICE_LINK[s.kind] ? `<a class="pa-link" href="${esc(practiceHref(s))}">${icon('dumbbell')}${t(PRACTICE_LINK[s.kind])}</a>` : ''}
        <label class="check"><input type="checkbox" data-n="${s.n}" aria-label="${esc(t('plan.sessionDone', { n: s.n }))}" ${done.has(s.n) ? 'checked' : ''}><span>${icon('check')}</span></label>
      </div></li>`;
  const kinds = [...new Set(p.sessions.map((s) => s.kind))];
  const mockSession = p.sessions.find((s) => s.kind === 'mock');
  const examDay = p.deadline ? p.deadline.targetDate : p.examDate;
  const byTopic = new Map();
  for (const s of p.sessions) {
    // A session that covers several domains splits its time between them.
    const names = s.topics || (s.topic ? [s.topic] : []);
    for (const n of names) byTopic.set(n, (byTopic.get(n) || 0) + s.minutes / names.length);
  }
  const topicRows = p.topics
    .map((tp, i) => ({ label: lib(tp), value: Math.round(((byTopic.get(tp) || 0) / 60) * 10) / 10, color: domainColor(i) }))
    .filter((r) => r.value > 0);
  const weekRows = [...weeks].map(([w, items], i) => ({
    label: t('plan.wk', { n: i + 1 }),
    value: Math.round((items.reduce((sum, s) => sum + s.minutes, 0) / 60) * 10) / 10,
    title: t('plan.weekTitle', { n: i + 1, r: weekRange(w), h: Math.round((items.reduce((sum, s) => sum + s.minutes, 0) / 60) * 10) / 10 }),
    mark: items.some((s) => s.kind === 'mock'),
  }));
  const summaryStat = (ic, label, value) => `<div class="card stat">${tile(ic, '--accent', 'sm')}<div><small>${label}</small><b>${value}</b></div></div>`;

  out.innerHTML = `
    <div class="plan-summary">
      ${summaryStat('calendar-days', t('plan.sessions'), p.sessions.length)}
      ${summaryStat('clock', t('plan.studyTime'), `${p.hours} h`)}
      ${summaryStat('flag', t('plan.fromTo'), `${day(p.sessions[0].date, { weekday: false })} – ${day(p.sessions.at(-1).date, { weekday: false })}`)}
      ${summaryStat('target', p.deadline ? t('plan.examDay') : t('plan.earliest'), day(examDay))}
      <div class="card progress-card" id="progress">${ring(pct(), 52, 'good pct', t('plan.pctDone', { p: pct() }))}<div><b id="progress-n">${t('plan.of', { a: done.size, b: p.sessions.length })}</b><small>${t('plan.done')}</small></div></div>
    </div>
    <div id="plan-status">${statusHtml(p, done, days, progressKey)}</div>
    <div class="plan-actions">
      <button type="button" class="btn primary" id="dl-ics">${icon('calendar-plus')}${t('plan.calendar')}</button>
      <button type="button" class="btn" id="track-plan" aria-pressed="${tracked}">${icon('activity')}<span>${tracked ? t('plan.tracking') : t('plan.track')}</span></button>
      <button type="button" class="btn" id="dl-md">${icon('download')}Markdown</button>
      <button type="button" class="btn" id="copy-plan">${icon('link')}${t('copyLink')}</button>
      <button type="button" class="btn" id="print-plan">${icon('printer')}${t('plan.print')}</button>
    </div>
    ${p.inferredTopics ? `<p class="note">${esc(t('plan.inferred'))}</p>` : ''}
    <div class="months">${monthsHtml(p, done)}</div>
    <ul class="kinds">${kinds.map((k) => `<li><span class="k ${kindN(k)}" ${kindStyle(k)}>${icon(KIND[k].icon)}</span>${kindLabel(k)}</li>`).join('')}<li><span class="k exam">${icon('target')}</span>${t('plan.examDay')}</li></ul>
    <div class="plan-charts">
      <section class="card panel"><h2>${icon('chart-bar')}${t('plan.byTopic')}</h2>${hbars(topicRows)}</section>
      <section class="card panel"><h2>${icon('chart-column')}${t('plan.perWeek')}</h2>${columns(weekRows, 'h', t('plan.perWeekAria'))}<p class="hint">${t('plan.mockWeeks')}</p></section>
    </div>
    ${[...weeks]
      .map(([w, items], i) => `<h3 class="week">${t('plan.week', { n: i + 1 })} <small>${weekRange(w)}</small></h3><ol class="trail">${items.map(stop).join('')}</ol>`)
      .join('')}
    <div class="plan-extra">
      <section class="card panel"><h2>${icon('info')}${t('plan.what')}</h2>
        <dl class="keydl">${kinds.map((k) => `<dt><span class="kinds"><span class="k ${kindN(k)}" ${kindStyle(k)}>${icon(KIND[k].icon)}</span></span>${kindLabel(k)}</dt><dd>${esc(k === 'mock' ? kindDetail('mock', mockSession.detail, mockSession.minutes) : kindDetail(k, KIND_DETAIL[k]))}</dd>`).join('')}</dl>
      </section>
      ${cert.prep && cert.prep.length ? `<section class="card panel"><h2>${icon('graduation-cap')}${t('plan.resources')}</h2><div class="resources">${cert.prep
        .map((r) => {
          const k = prepKind(r);
          return ext(r.url, `${tile(k.icon, '--accent', 'sm')}<span><b>${esc(r.title)}</b><span class="res-kind">${esc(k.label)} · ${r.cost === 'paid' ? t('paid') : t('free')}</span></span>`, 'res');
        })
        .join('')}</div></section>` : ''}
    </div>`;

  $$('#plan-output .check input').forEach((box) =>
    box.addEventListener('change', () => {
      const n = Number(box.dataset.n);
      if (box.checked) done.add(n);
      else done.delete(n);
      store.set(progressKey, [...done]);
      const session = p.sessions.find((x) => x.n === n);
      const li = box.closest('.stop');
      li.className = `stop${stopState(session)}`;
      $('.tag', li)?.remove();
      $('small', li).insertAdjacentHTML('beforeend', stopTag(session));
      const cell = $(`#plan-output .mgrid [data-n="${n}"]`);
      if (cell) {
        cell.classList.toggle('done', box.checked);
        cell.classList.toggle('missed', !box.checked && session.date < today);
      }
      $('#progress .ring').outerHTML = ring(pct(), 52, 'good pct', t('plan.pctDone', { p: pct() }));
      $('#plan-status').innerHTML = statusHtml(p, done, days, progressKey);
      $('#progress-n').textContent = t('plan.of', { a: done.size, b: p.sessions.length });
      if (box.checked && !isTracked(progressKey)) setTracked(progressKey, trackParams(), true);
      const kind = p.sessions.find((s) => s.n === n)?.kind;
      if (box.checked && (done.size === p.sessions.length || kind === 'final' || kind === 'mock')) celebrate(done.size === p.sessions.length ? 220 : 90);
    }),
  );
  // Practice from a session counts for this plan, so it shows in Progress like a ticked session does.
  $$('#plan-output .pa-link').forEach((a) => a.addEventListener('click', () => isTracked(progressKey) || setTracked(progressKey, trackParams(), true)));
  $('#dl-ics').addEventListener('click', () => download(`${p.cert.id}-plan.ics`, toICS(localPlan(p), new Date(), { exam: t('plan.examDay') }), 'text/calendar'));
  $('#dl-md').addEventListener('click', () => download(`${p.cert.id}-plan.md`, toMarkdown(localPlan(p), { resources: cert.prep || [], text: markdownText() }), 'text/markdown'));
  $('#track-plan').addEventListener('click', () => setTracked(progressKey, trackParams(), !isTracked(progressKey)));
  $('#print-plan').addEventListener('click', () => window.print());
  $('#copy-plan').addEventListener('click', (e) => copy(`${location.origin}${location.pathname}#plan?${new URLSearchParams(planParams())}`, e.currentTarget));
}

function celebrate(count) {
  if (reducedMotion()) return;
  const css = getComputedStyle(document.documentElement);
  const colors = ['--accent', '--k-learn', '--k-practice', '--k-mock', '--d4'].map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
  // Loaded on the first celebration, so the first visit doesn't wait for it.
  import('./vendor/confetti.js')
    .then(({ default: confetti }) => confetti({ particleCount: count, spread: 75, startVelocity: 38, origin: { y: 0.75 }, colors, disableForReducedMotion: true }))
    .catch(() => {});
}

function effectiveTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function setThemeButton() {
  const dark = effectiveTheme() === 'dark';
  $('#theme use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
  $('#theme').setAttribute('aria-label', dark ? t('theme.toLight') : t('theme.toDark'));
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
  button.innerHTML = `${icon(ok ? 'check' : 'x')}${ok ? t('copied') : t('copyFailed')}`;
  setTimeout(() => (button.innerHTML = before), 1500);
}

// ---------- wiring ----------
function bind() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act], button[data-cat]');
    if (!btn) return;
    if (btn.dataset.cat !== undefined) {
      filters.cat = btn.dataset.cat;
      renderList();
      return;
    }
    if (btn.dataset.act === 'clear-filters') clearFilters();
    if (btn.dataset.act === 'compare') {
      toggleCompare(btn.dataset.id);
      const { name, params } = parseHash();
      const view = VIEWS[name] || 'list';
      if (view === 'cert') renderCert(params.get('id'));
      if (view === 'compare') renderCompare();
      if (view === 'list') renderList();
    }
    if (btn.dataset.act === 'share') share(btn.dataset.id);
    if (btn.dataset.act === 'untrack') {
      setTracked(btn.dataset.key, null, false);
      renderProgress();
    }
    if (btn.dataset.act === 'resched' || btn.dataset.act === 'unresched') {
      const onPlan = !$('#view-plan').hidden;
      const params = onPlan ? trackParams() : trackedPlans()[btn.dataset.key];
      if (params) (btn.dataset.act === 'resched' ? rescheduleFrom : undoReschedule)(btn.dataset.key, params);
      if (onPlan) renderPlan();
      else renderProgress();
    }
    if (btn.dataset.act === 'use-hours') {
      hoursTouched = false;
      $('#plan-form').hours.value = suggested;
      updateHint();
      renderPlan();
    }
  });

  $('#filters').addEventListener('input', renderList);
  $('#sort').addEventListener('input', renderList);
  $('#filters').addEventListener('submit', (e) => e.preventDefault());
  $('#q').addEventListener('input', renderList);
  $('#q').addEventListener('keydown', onSearchKey);
  $('#q').addEventListener('focus', openSuggest);
  $('#q').addEventListener('blur', closeSuggest);
  // Keep the focus in the box while a suggestion is pressed, so blur doesn't close the list first.
  $('#q-pop').addEventListener('mousedown', (e) => e.preventDefault());
  $('#q-pop').addEventListener('click', onSuggestClick);
  $('#mq-toggle').addEventListener('click', () => {
    const paused = !$('#marquee').classList.contains('paused');
    setMotionPaused(paused);
    store.set(KEYS.motion, paused ? 'paused' : 'moving');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    if ($('#view-list').hidden) return;
    e.preventDefault();
    $('#q').focus();
  });
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
      // Keep the address on the certification shown, so back, reload and links agree with it.
      history.replaceState(null, '', `#plan?cert=${encodeURIComponent(e.target.value)}`);
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

  $('#lang').addEventListener('click', () => {
    setLang(getLang() === 'es' ? 'en' : 'es');
    localize();
    renderRoute();
  });

  bindStudyBackup();
  window.addEventListener('hashchange', route);
}

// ---------- practice ----------
const PRACTICE = new Map();
let practiceTimer = null;
let practiceKey = null;
let practiceState = null;
const practiceKeys = (id) => ({ run: `${KEYS.practice}run:${id}`, history: `${KEYS.practice}${id}`, review: `${KEYS.practice}review:${id}` });
const REVIEW_SIZE = 20;
// A suggested accuracy to reach in practice before booking. pathfinder's suggestion, not an issuer rule.
const TARGET = 80;
const stopPracticeTimer = () => {
  clearInterval(practiceTimer);
  practiceTimer = null;
  practiceKey = null;
};

async function loadPractice(id) {
  if (!PRACTICE.has(id)) {
    const res = await fetch(`practice/${id}.json`);
    if (!res.ok) throw new Error(`practice ${res.status}`);
    PRACTICE.set(id, await res.json());
  }
  return PRACTICE.get(id);
}

const pText = (v) => v[getLang()] || v.en;
const examSize = (c) => c.exam.question_count ?? parseInt(c.exam.questions, 10);
const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const domainBars = (per, target = null) =>
  `<ul class="pa-domains">${per
    .map(
      (d, i) => `<li><span>${esc(d.name)} <small>${d.weight}%</small></span><span class="hb-track"><i style="width:${d.pct ?? 0}%;background:${domainColor(i)}"></i>${target ? `<span class="pa-mark" style="left:${target}%"></span>` : ''}</span><b>${d.pct === null ? '—' : `${d.pct}%`}</b><small>${d.ok}/${d.n}</small></li>`,
    )
    .join('')}</ul>`;

/** A certification without practice questions, or none named: say so and list the ones that have them. */
function practiceMissing(c) {
  const sets = DATA.certifications.filter((x) => x.practice_questions);
  $('#practice-body').innerHTML = `${c ? `<a class="back" href="#cert?id=${esc(c.id)}">${icon('arrow-left')}${esc(c.name)}</a>` : ''}
    <div class="page-head"><span class="head-icon">${icon('dumbbell')}</span><h1>${t('practice.title')}</h1></div>
    <div class="status info">${icon('info')}<span>${esc(c ? t('practice.noSet', { x: c.name }) : t('practice.pickSet'))}${c ? ` <a href="#cert?id=${esc(c.id)}">${esc(t('practice.toCert'))}</a>` : ''}</span></div>
    <section class="card panel"><h2>${icon('dumbbell')}${t('practice.withSets')}</h2><ul class="choose-list">${sets
      .map((x) => certRow(x, `#practice?cert=${x.id}`, `${x.provider} · ${x.code} · ${t('practice.count', { n: x.practice_questions })}`))
      .join('')}</ul></section>`;
}

/** The tracked plan session a practice link came from (?plan=<first session date>&s=<n>). */
function planSession(certId, params) {
  const start = params.get('plan');
  const n = Number(params.get('s'));
  if (!start || !n) return null;
  const key = `${KEYS.progress}${certId}:${start}`;
  const tracked = trackedPlans()[key];
  const session = tracked && planFrom(tracked, key)?.sessions.find((s) => s.n === n);
  return session ? { key, n, session, params: tracked } : null;
}

const sessionName = (s) => `${kindLabel(s.kind)}: ${cap(sname(s))}`;

async function renderPractice(id, params) {
  stopPracticeTimer();
  const body = $('#practice-body');
  const c = BY_ID.get(id);
  if (!c?.practice_questions) return practiceMissing(c);
  let set;
  try {
    set = await loadPractice(id);
  } catch {
    body.innerHTML = `<a class="back" href="#cert?id=${esc(id)}">${icon('arrow-left')}${esc(c.name)}</a><div class="status warn">${icon('triangle-alert')}${esc(t('practice.loadError'))}</div>`;
    return;
  }
  // The route may have changed while the file loaded.
  if (parseHash().name !== 'practice' || parseHash().params.get('cert') !== id) return;
  const keys = practiceKeys(id);
  const history = () => store.get(keys.history, emptyHistory());
  const review = () => loadReview(store.get(keys.review, null), history(), Date.now());
  const ctx = { id, c, set, keys, history, review, params, from: planSession(id, params), tab: params.get('tab') || 'start', attempt: params.get('attempt') };
  practiceState = ctx;
  const run = store.get(keys.run, null);
  if (run && run.timed && !run.paused && run.end <= Date.now()) return finishPractice(ctx, run);
  if (ctx.attempt) return practiceResult(ctx);
  if (params.get('review')) return practiceReview(ctx, params.get('review') === 'early');
  if (run && params.get('run') === '1') return practiceExam(ctx, run);
  practiceHome(ctx, run);
}

const dueCount = (ctx) => queue(ctx.review(), ctx.set.questions, Date.now()).due.length;

function practiceHead(ctx, active) {
  const tab = (key, label) => `<a href="#practice?cert=${esc(ctx.id)}${key === 'start' ? '' : `&tab=${key}`}" ${active === key ? 'aria-current="page"' : ''}>${label}</a>`;
  const due = dueCount(ctx);
  return `<a class="back" href="#cert?id=${esc(ctx.id)}">${icon('arrow-left')}${esc(ctx.c.name)}</a>
    <div class="page-head"><span class="head-icon">${icon('dumbbell')}</span><h1>${t('practice.title')}: ${esc(ctx.c.code)}</h1></div>
    <p class="hint pa-intro">${esc(t('practice.intro', { n: ctx.set.questions.length }))}</p>
    <div class="pa-tabs">${tab('start', t('practice.tabStart'))}${tab('review', `${t('practice.tabReview')}${due ? ` <b class="pa-n">${due}</b>` : ''}`)}${tab('bank', t('practice.tabBank'))}${tab('mistakes', t('practice.tabMistakes'))}</div>`;
}

function practiceHome(ctx, run) {
  if (ctx.tab === 'bank') return practiceBank(ctx);
  if (ctx.tab === 'mistakes') return practiceMistakes(ctx);
  if (ctx.tab === 'review') return practiceReviewTab(ctx);
  const { c, set, id, from } = ctx;
  const full = examSize(c);
  const hist = ctx.history();
  // From a plan session: its domain in study mode, a mock at full length with the clock, or 10 questions.
  const preset = {
    domain: c.domains.some((d) => d.name === ctx.params.get('domain')) ? ctx.params.get('domain') : '',
    mock: ctx.params.get('mode') === 'mock',
    size: Number(ctx.params.get('size')) || 0,
  };
  const studyFirst = !!preset.domain && !preset.mock;
  const inDomain = (name) => set.questions.filter((q) => q.domain === name).length;
  const when = (ms) => new Date(ms).toLocaleDateString(getLang());
  const past = [...hist.attempts].reverse().slice(0, 10);
  const due = dueCount(ctx);
  const radio = (name, value, label, on) => `<label><input type="radio" name="${name}" value="${esc(value)}" ${on ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  // One primary action: continue the run in progress, or start a new one.
  $('#practice-body').innerHTML = `${practiceHead(ctx, 'start')}
    ${from ? `<div class="status info pa-resume">${icon('route')}<span>${esc(t('practice.fromPlan', { x: sessionName(from.session), d: day(from.session.date) }))}</span></div>` : ''}
    ${run ? `<div class="status pa-resume">${icon('timer')}<span>${esc(t('practice.resume', { a: Object.keys(run.answers).length, b: run.ids.length }))}</span>
      <a class="btn primary" href="#practice?cert=${esc(id)}&run=1">${t('practice.continue')}</a><button type="button" class="btn" id="pa-discard">${t('practice.discard')}</button></div>` : ''}
    ${due ? `<div class="status pa-resume">${icon('refresh-cw')}<span>${esc(t('practice.reviewDue', { n: due }))}</span><a class="btn" href="#practice?cert=${esc(id)}&review=due">${t('practice.reviewStart')}</a></div>` : ''}
    <section class="card panel pa-start">
      <div class="pa-form">
        <span class="pa-label" id="pa-mode-l">${t('practice.mode')}</span>
        <div class="pa-field"><div class="segmented" role="radiogroup" aria-labelledby="pa-mode-l">${radio('pa-mode', 'exam', t('practice.modeExam'), !studyFirst)}${radio('pa-mode', 'study', t('practice.modeStudy'), studyFirst)}</div><p class="hint" id="pa-mode-hint"></p></div>
        <label class="pa-label" for="pa-domain-pick">${t('practice.domain')}</label>
        <div class="pa-field"><select id="pa-domain-pick"><option value="">${esc(t('practice.allDomains'))} (${set.questions.length})</option>${c.domains
          .filter((d) => inDomain(d.name))
          .map((d) => `<option value="${esc(d.name)}" ${d.name === preset.domain ? 'selected' : ''}>${esc(d.name)} (${inDomain(d.name)})</option>`)
          .join('')}</select></div>
        <span class="pa-label" id="pa-size-l">${t('practice.size')}</span>
        <div class="pa-field"><div class="segmented" role="radiogroup" aria-labelledby="pa-size-l" id="pa-sizes"></div></div>
        <span class="pa-label" aria-hidden="true"></span>
        <label class="pa-check" id="pa-timed-row"><input type="checkbox" id="pa-timed" checked> <span id="pa-timed-label"></span></label>
      </div>
      <div class="pa-go"><button type="button" class="btn${run ? '' : ' primary'}" id="pa-start" ${run ? 'disabled' : ''}>${icon('play')}${t('practice.start')}</button></div>
      <p class="hint" id="pa-short" hidden></p>
    </section>
    ${hist.attempts.length
      ? `<div class="progress-cols">
          <section class="card panel"><h2>${icon('chart-bar')}${t('practice.overall')}</h2>${domainBars(totals(hist, c.domains))}<p class="hint">${esc(t('practice.notScore'))}</p></section>
          <section class="card panel"><h2>${icon('activity')}${t('practice.history')}</h2><ul class="pa-history">${past
            .map((a) => `<li><span>${esc(when(a.when))}</span><b>${a.pct === null ? '—' : `${a.pct}%`}</b><small>${a.ok}/${a.n}</small><a href="#practice?cert=${esc(id)}&attempt=${esc(a.id)}">${t('practice.open')}</a></li>`)
            .join('')}</ul></section>
        </div>`
      : `<p class="hint">${esc(t('practice.noHistory'))}</p>`}`;
  const mode = () => $('input[name="pa-mode"]:checked').value;
  const domain = () => $('#pa-domain-pick').value;
  const pool = () => (domain() ? set.questions.filter((q) => q.domain === domain()) : set.questions);
  const size = () => Number($('input[name="pa-size"]:checked').value);
  const minutes = () => minutesFor({ minutes: c.exam.minutes, questions: full }, Math.min(size(), pool().length));
  const paintSizes = () => {
    const n = pool().length;
    const sizes = domain() ? (n > 10 ? [[10, '10'], [n, t('practice.sizeAll', { n })]] : [[n, t('practice.sizeAll', { n })]]) : n >= full ? [[10, '10'], [full, t('practice.sizeFull', { n: full })]] : [[10, '10'], [n, t('practice.sizeAll', { n })]];
    const pick = sizes.some(([v]) => v === preset.size) ? preset.size : sizes.at(-1)[0];
    $('#pa-sizes').innerHTML = sizes.map(([v, label]) => radio('pa-size', v, label, v === pick)).join('');
    $('#pa-short').hidden = n >= full || !!domain();
    $('#pa-short').textContent = t('practice.shortBank', { need: full, n });
  };
  const paint = () => {
    $('#pa-mode-hint').textContent = t(mode() === 'study' ? 'practice.modeStudyHint' : 'practice.modeExamHint');
    $('#pa-timed-row').hidden = mode() === 'study';
    $('#pa-timed-label').textContent = t('practice.timed', { min: minutes() });
  };
  paintSizes();
  paint();
  $('#pa-domain-pick').addEventListener('change', paintSizes);
  $('#practice-body .pa-start').addEventListener('change', paint);
  $('#pa-discard')?.addEventListener('click', () => {
    store.set(ctx.keys.run, null);
    practiceHome(ctx, null);
  });
  $('#pa-start').addEventListener('click', () => {
    const count = Math.min(size(), pool().length);
    const study = mode() === 'study';
    const timed = !study && $('#pa-timed').checked;
    const domains = domain() ? c.domains.filter((d) => d.name === domain()) : c.domains;
    const ids = buildRun({ questions: pool(), domains, size: count, seen: new Set(Object.keys(hist.questions)) });
    const now = Date.now();
    store.set(ctx.keys.run, {
      ids,
      answers: {},
      marked: [],
      checked: [],
      mode: study ? 'study' : 'exam',
      domain: domain() || null,
      from: from ? { key: from.key, n: from.n } : null,
      cur: 0,
      timed,
      minutes: minutes(),
      end: now + minutes() * 60000,
      paused: null,
    });
    location.hash = `#practice?cert=${id}&run=1`;
  });
}

// Keys for the question on screen (practiceKey): 1–9 or the option's letter picks it, Enter goes on.
document.addEventListener('keydown', (e) => {
  if (!practiceKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || $('#view-practice').hidden) return;
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  practiceKey(e);
});

/** A handler for practiceKey. A focused button or link handles Enter itself. */
const optionKeys = (q, pick, enter) => (e) => {
  if (e.key === 'Enter') {
    if (e.target.closest('button, a, summary')) return;
    e.preventDefault();
    enter();
    return;
  }
  if (e.key.length !== 1) return;
  const k = e.key.toUpperCase();
  const opt = /^[1-9]$/.test(k) ? q.options[Number(k) - 1] : q.options.find((o) => o.key.toUpperCase() === k);
  if (!opt) return;
  e.preventDefault();
  pick(opt.key);
};

const keysHint = (q, key) => `<p class="hint pa-keys">${esc(t(key, { n: q.options.length, last: q.options.at(-1).key }))}</p>`;

/** The answer just checked in study mode or review: right or not, then the explanation. */
const verdictHtml = (q, right, text) =>
  `<div class="status ${right ? 'good' : 'warn'} pa-verdict" role="status">${icon(right ? 'circle-check' : 'triangle-alert')}<span>${esc(text)}</span></div><p class="pa-why">${esc(pText(q.explanation))}</p>`;

function practiceExam(ctx, run) {
  const byId = new Map(ctx.set.questions.map((q) => [q.id, q]));
  const save = () => store.set(ctx.keys.run, run);
  const left = () => run.ids.length - run.ids.filter((x) => run.answers[x]?.length).length;
  // Study mode shows the answer and the explanation once a question is checked; exam mode waits for the end.
  const study = run.mode === 'study';
  run.checked ||= [];
  const isChecked = (x) => study && run.checked.includes(x);
  let asking = false;
  const tick = () => {
    if (!run.timed || run.paused) return;
    const ms = run.end - Date.now();
    const el = $('#pa-clock');
    if (el) {
      el.textContent = clock(ms);
      el.classList.toggle('low', ms < 300000);
    }
    if (ms <= 0) {
      stopPracticeTimer();
      finishPractice(ctx, run);
    }
  };
  const finishNow = () => {
    if (run.paused) {
      run.end += Date.now() - run.paused;
      run.paused = null;
    }
    stopPracticeTimer();
    finishPractice(ctx, run);
  };
  const paint = () => {
    const q = byId.get(run.ids[run.cur]);
    const picked = run.answers[q.id] || [];
    const multi = q.correct.length > 1;
    const shown = isChecked(q.id);
    const last = run.cur === run.ids.length - 1;
    const grid = run.ids
      .map((x, i) => `<button type="button" data-go="${i}" class="${run.answers[x]?.length ? 'ans' : ''}${isChecked(x) ? (isCorrect(byId.get(x), run.answers[x]) ? ' ok' : ' no') : ''}${run.marked.includes(x) ? ' mk' : ''}" ${i === run.cur ? 'aria-current="true"' : ''}>${i + 1}</button>`)
      .join('');
    const primary = study && !shown
      ? `<button type="button" class="btn primary" id="pa-check" ${picked.length ? '' : 'disabled'}>${icon('check')}${t('practice.check')}</button>`
      : study && last
        ? `<button type="button" class="btn primary" id="pa-done">${t('practice.seeResult')}${icon('arrow-right')}</button>`
        : `<button type="button" class="btn primary" id="pa-next" ${last ? 'disabled' : ''}>${t('practice.next')}${icon('arrow-right')}</button>`;
    $('#practice-body').innerHTML = `
      <div class="pa-bar">
        ${run.timed ? `<b id="pa-clock" class="pa-clock" role="timer">${run.paused ? clock(run.end - run.paused) : clock(run.end - Date.now())}</b><button type="button" class="btn" id="pa-pause">${icon(run.paused ? 'play' : 'pause')}${t(run.paused ? 'practice.play' : 'practice.pause')}</button>` : `<span class="tag">${esc(t(study ? 'practice.modeStudy' : 'practice.modeExam'))}</span>`}
        <span class="pa-spacer"></span>
        <button type="button" class="btn" id="pa-finish">${icon('flag')}${t('practice.finish')}</button>
      </div>
      ${asking ? `<div class="status warn pa-resume">${icon('triangle-alert')}<span>${esc(t('practice.finishSure'))}${left() ? ` ${esc(t('practice.finishLeft', { n: left() }))}` : ''}</span><button type="button" class="btn primary" id="pa-yes">${t('practice.finishYes')}</button><button type="button" class="btn" id="pa-no">${t('practice.finishNo')}</button></div>` : ''}
      ${run.paused
        ? `<div class="card panel pa-paused"><p>${esc(t('practice.paused'))}</p></div>`
        : `<section class="card panel pa-q">
            <small class="pa-meta">${esc(t('practice.q', { a: run.cur + 1, b: run.ids.length }))} · ${esc(q.domain)}</small>
            <h2 class="pa-prompt">${esc(pText(q.prompt))}</h2>
            ${multi && !shown ? `<p class="pa-pick">${esc(t('practice.selectN', { n: q.correct.length }))}</p>` : ''}
            <div class="pa-options">${shown
              ? shownOptions(q, picked)
              : q.options
                  .map((o) => `<button type="button" class="pa-opt${multi ? ' multi' : ''}" data-key="${esc(o.key)}" aria-pressed="${picked.includes(o.key)}"><span class="k">${esc(o.key)}</span><span>${esc(pText(o.text))}</span></button>`)
                  .join('')}</div>
            ${shown ? verdictHtml(q, isCorrect(q, picked), t(isCorrect(q, picked) ? 'practice.studyRight' : 'practice.studyWrong')) : ''}
            <div class="pa-nav">
              <button type="button" class="btn" id="pa-prev" ${run.cur === 0 ? 'disabled' : ''}>${icon('arrow-left')}${t('practice.prev')}</button>
              <button type="button" class="btn" id="pa-mark" aria-pressed="${run.marked.includes(q.id)}">${icon('flag')}${t(run.marked.includes(q.id) ? 'practice.marked' : 'practice.mark')}</button>
              ${primary}
            </div>
            ${keysHint(q, study ? 'practice.keysStudy' : 'practice.keysExam')}
          </section>
          <nav class="pa-grid" aria-label="${esc(t('practice.grid'))}">${grid}</nav>`}`;
    const on = (sel, fn) => $(sel)?.addEventListener('click', fn);
    on('#pa-pause', () => {
      if (run.paused) {
        run.end += Date.now() - run.paused;
        run.paused = null;
      } else run.paused = Date.now();
      save();
      paint();
    });
    on('#pa-finish', () => {
      asking = true;
      paint();
    });
    on('#pa-no', () => {
      asking = false;
      paint();
    });
    on('#pa-yes', finishNow);
    const go = (i) => {
      run.cur = i;
      save();
      paint();
      window.scrollTo(0, 0);
    };
    const choose = (k) => {
      if (shown) return;
      const now = run.answers[q.id] || [];
      if (multi) run.answers[q.id] = now.includes(k) ? now.filter((x) => x !== k) : [...now, k];
      else run.answers[q.id] = now[0] === k ? [] : [k];
      save();
      paint();
    };
    const check = () => {
      if (!picked.length) return;
      run.checked = [...run.checked, q.id];
      save();
      paint();
      $('#pa-next:not(:disabled), #pa-done')?.focus({ preventScroll: true });
    };
    const done = () => {
      if (left()) {
        asking = true;
        paint();
      } else finishNow();
    };
    on('#pa-prev', () => go(run.cur - 1));
    on('#pa-next', () => go(run.cur + 1));
    on('#pa-check', check);
    on('#pa-done', done);
    on('#pa-mark', () => {
      run.marked = run.marked.includes(q.id) ? run.marked.filter((x) => x !== q.id) : [...run.marked, q.id];
      save();
      paint();
    });
    $$('#practice-body [data-go]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));
    $$('#practice-body .pa-opt[data-key]').forEach((b) => b.addEventListener('click', () => choose(b.dataset.key)));
    practiceKey = run.paused || asking ? null : optionKeys(q, choose, () => (study && !shown ? check() : study && last ? done() : !last && go(run.cur + 1)));
  };
  paint();
  // The interval exists before the first tick, so an expired run cannot leave one running.
  if (run.timed) {
    clearInterval(practiceTimer);
    practiceTimer = setInterval(tick, 1000);
    tick();
  }
}

function finishPractice(ctx, run) {
  stopPracticeTimer();
  const { c, set, keys, id } = ctx;
  store.set(keys.run, null);
  const answers = Object.fromEntries(Object.entries(run.answers).filter(([, a]) => a.length));
  const result = grade({ questions: set.questions, domains: c.domains, ids: run.ids, answers });
  if (!result.n) {
    location.hash = `#practice?cert=${id}`;
    return;
  }
  const when = Date.now();
  const meta = { mode: run.mode || 'exam', ...(run.domain ? { domain: run.domain } : {}) };
  if (run.from) {
    // A run started from a plan session ticks it off once at least half of it was answered.
    const ticked = result.n * 2 >= run.ids.length;
    if (ticked) store.set(run.from.key, [...new Set([...store.get(run.from.key, []), run.from.n])]);
    meta.from = { ...run.from, ticked };
  }
  // Read the schedule before the history changes: with no schedule saved yet, it starts from the old history.
  const review = ctx.review();
  store.set(keys.history, record(ctx.history(), result, answers, when, meta));
  store.set(keys.review, applyRun(review, result, run.marked || [], when));
  if (result.pct >= 70) celebrate(90);
  location.hash = `#practice?cert=${id}&attempt=a${when}`;
}

/** Options with the right ones and your picks shown. */
const shownOptions = (q, given = []) =>
  q.options
    .map((o) => {
      const right = q.correct.includes(o.key);
      const mine = given.includes(o.key);
      return `<div class="pa-opt shown${right ? ' right' : mine ? ' wrong' : ''}"><span class="k">${esc(o.key)}</span><span>${esc(pText(o.text))}${right ? ` <small>${t('practice.correct')}</small>` : mine ? ` <small>${t('practice.yours')}</small>` : ''}</span></div>`;
    })
    .join('');

const reviewCard = (q, answer, state = '') =>
  `<details class="card pa-review"><summary><small class="pa-meta">${esc(q.domain)}${state ? ` · ${state}` : ''}</small><b>${esc(pText(q.prompt))}</b></summary><div class="pa-options">${shownOptions(q, answer || [])}</div><p class="pa-why">${esc(pText(q.explanation))}</p></details>`;

function practiceResult(ctx) {
  const { id, set, c } = ctx;
  const a = ctx.history().attempts.find((x) => x.id === ctx.attempt);
  if (!a) {
    location.hash = `#practice?cert=${id}`;
    return;
  }
  const missed = new Set(a.wrong);
  const answered = set.questions.filter((q) => a.answers[q.id]);
  const due = dueCount(ctx);
  // The plan session this run came from: marked done (with undo), or offered when too little was answered.
  const tracked = a.from && trackedPlans()[a.from.key];
  const session = tracked && planFrom(tracked, a.from.key)?.sessions.find((s) => s.n === a.from.n);
  const sessionHtml = () => {
    if (!session) return '';
    const done = store.get(a.from.key, []).includes(a.from.n);
    const text = t(done ? 'practice.sessionDone' : a.from.ticked ? 'practice.sessionOpen' : 'practice.sessionOffer', { x: sessionName(session) });
    return `<div class="status ${done ? 'good' : 'info'} pa-resume" id="pa-session" role="status">${icon(done ? 'circle-check' : 'route')}<span>${esc(text)}</span>
      <button type="button" class="btn" id="pa-session-toggle">${t(done ? 'practice.undo' : 'practice.markDone')}</button>
      <a class="btn" href="#plan?${esc(new URLSearchParams(tracked).toString())}">${icon('route')}${t('practice.toPlan')}</a></div>`;
  };
  const bindSession = () =>
    $('#pa-session-toggle')?.addEventListener('click', () => {
      const done = new Set(store.get(a.from.key, []));
      if (done.has(a.from.n)) done.delete(a.from.n);
      else done.add(a.from.n);
      store.set(a.from.key, [...done]);
      $('#pa-session').outerHTML = sessionHtml();
      bindSession();
      $('#pa-session-toggle').focus();
    });
  const paint = (onlyWrong) => {
    const list = onlyWrong ? answered.filter((q) => missed.has(q.id)) : answered;
    $('#practice-body').innerHTML = `<a class="back" href="#practice?cert=${esc(id)}">${icon('arrow-left')}${t('practice.back')}</a>
      <div class="page-head"><span class="head-icon">${icon('target')}</span><h1>${t('practice.result')}</h1></div>
      ${sessionHtml()}
      <section class="card panel pa-score">
        <b class="pa-big">${a.pct}%</b>
        <div><p>${esc(t('practice.resultOf', { ok: a.ok, n: a.n }))}</p>
        ${a.total > a.n ? `<p class="hint">${esc(t('practice.resultLeft', { n: a.total - a.n }))}</p>` : ''}
        <p class="hint">${esc(t('practice.weighted', { p: a.weighted }))}</p></div>
        <a class="btn primary" href="#practice?cert=${esc(id)}">${icon('play')}${t('practice.again')}</a>
        ${due ? `<a class="btn" href="#practice?cert=${esc(id)}&review=due">${icon('refresh-cw')}${t('practice.tabReview')} · ${due}</a>` : ''}
        <dl class="pa-pass">
          ${c.exam.passing ? `<div><dt>${t('practice.passing')}</dt><dd>${esc(c.exam.passing)}</dd></div>` : ''}
          <div><dt>${t('practice.target')} <span class="tag">${t('practice.suggestion')}</span></dt><dd>${esc(t('practice.targetValue', { p: TARGET }))}</dd></div>
        </dl>
        <p class="hint pa-note">${esc(t('practice.notScore'))} ${esc(t('practice.scaled'))}</p>
      </section>
      <section class="card panel"><h2>${icon('chart-bar')}${t('practice.byDomain')}</h2>${domainBars(a.per, TARGET)}<p class="hint pa-note">${esc(t('practice.targetLine', { p: TARGET }))}</p></section>
      <div class="pa-reviewhead"><h2>${t('practice.review')}</h2><div class="segmented"><label><input type="radio" name="pa-rev" value="all" ${onlyWrong ? '' : 'checked'}><span>${t('practice.reviewAll')}</span></label><label><input type="radio" name="pa-rev" value="wrong" ${onlyWrong ? 'checked' : ''}><span>${t('practice.reviewWrong')} (${missed.size})</span></label></div></div>
      ${list.map((q) => reviewCard(q, a.answers[q.id], missed.has(q.id) ? `<span class="tag warn">${icon('flag')}</span>` : '')).join('')}`;
    $$('input[name="pa-rev"]').forEach((r) => r.addEventListener('change', () => paint(r.value === 'wrong' && r.checked)));
    bindSession();
  };
  paint(a.wrong.length > 0);
}

/** Local calendar day of a timestamp, as YYYY-MM-DD for day(). */
const localDay = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function practiceReviewTab(ctx) {
  const { id, set } = ctx;
  const now = Date.now();
  const { due, later } = queue(ctx.review(), set.questions, now);
  const byId = new Map(set.questions.map((q) => [q.id, q]));
  const status = due.length ? t('practice.reviewDue', { n: due.length }) : later.length ? t('practice.reviewNext', { d: day(localDay(later[0].due)) }) : t('practice.reviewEmpty');
  const go = (mode, cls, label) => `<a class="btn ${cls}" href="#practice?cert=${esc(id)}&review=${mode}">${icon('refresh-cw')}${label}</a>`;
  const row = (r) => `<li><span>${esc(pText(byId.get(r.id).prompt))}</span><small>${esc(r.due <= now ? t('practice.dueNow') : t('practice.dueIn', { n: daysUntil(r.due, now) }))}</small></li>`;
  $('#practice-body').innerHTML = `${practiceHead(ctx, 'review')}
    <section class="card panel">
      <h2>${icon('refresh-cw')}${t('practice.tabReview')}</h2>
      <p>${esc(status)}</p>
      ${due.length ? `<div class="pa-setup">${go('due', 'primary', t('practice.reviewStart'))}</div>` : later.length ? `<div class="pa-setup">${go('early', '', t('practice.reviewEarly'))}</div>` : ''}
      <p class="hint pa-how">${esc(t('practice.reviewHow', { days: INTERVALS.join(', ') }))}</p>
    </section>
    ${due.length || later.length ? `<section class="card panel"><h2>${icon('calendar-clock')}${t('practice.reviewList')}</h2><ul class="pa-history">${[...due, ...later].map(row).join('')}</ul></section>` : ''}`;
}

/** One question at a time with the answer right after each check. Every check updates the schedule. */
function practiceReview(ctx, early) {
  const { id, set, keys } = ctx;
  const byId = new Map(set.questions.map((q) => [q.id, q]));
  const back = `#practice?cert=${id}&tab=review`;
  const { due, later } = queue(ctx.review(), set.questions, Date.now());
  const ids = (early ? [...due, ...later] : due).slice(0, REVIEW_SIZE).map((r) => r.id);
  if (!ids.length) {
    location.hash = back;
    return;
  }
  let cur = 0;
  let picked = [];
  let verdict = null;
  let ok = 0;
  const head = `<a class="back" href="${esc(back)}">${icon('arrow-left')}${t('practice.back')}</a>
    <div class="page-head"><span class="head-icon">${icon('refresh-cw')}</span><h1>${t('practice.tabReview')}: ${esc(ctx.c.code)}</h1></div>`;
  const paint = () => {
    if (cur >= ids.length) {
      practiceKey = null;
      const left = dueCount(ctx);
      $('#practice-body').innerHTML = `${head}
        <section class="card panel pa-score">
          <b class="pa-big">${ok}/${ids.length}</b>
          <div><p>${esc(t('practice.reviewScore', { ok, n: ids.length }))}</p><p class="hint">${esc(t('practice.reviewLeft', { n: left }))}</p></div>
          ${left ? `<button type="button" class="btn primary" id="pa-again">${icon('refresh-cw')}${t('practice.reviewAgain')}</button>` : ''}
          <a class="btn${left ? '' : ' primary'}" href="${esc(back)}">${t('practice.back')}</a>
        </section>`;
      $('#pa-again')?.addEventListener('click', () => practiceReview(ctx, false));
      if (ok === ids.length) celebrate(60);
      return;
    }
    const q = byId.get(ids[cur]);
    const multi = q.correct.length > 1;
    const options = verdict
      ? shownOptions(q, picked)
      : q.options
          .map((o) => `<button type="button" class="pa-opt${multi ? ' multi' : ''}" data-key="${esc(o.key)}" aria-pressed="${picked.includes(o.key)}"><span class="k">${esc(o.key)}</span><span>${esc(pText(o.text))}</span></button>`)
          .join('');
    $('#practice-body').innerHTML = `${head}
      <section class="card panel pa-q">
        <small class="pa-meta">${esc(t('practice.q', { a: cur + 1, b: ids.length }))} · ${esc(q.domain)}</small>
        <h2 class="pa-prompt">${esc(pText(q.prompt))}</h2>
        ${multi && !verdict ? `<p class="pa-pick">${esc(t('practice.selectN', { n: q.correct.length }))}</p>` : ''}
        <div class="pa-options">${options}</div>
        ${verdict ? verdictHtml(q, verdict.right, verdict.text) : ''}
        <div class="pa-nav pa-nav-end">${
          verdict
            ? `<button type="button" class="btn primary" id="pa-next">${cur === ids.length - 1 ? t('practice.finish') : t('practice.next')}${icon('arrow-right')}</button>`
            : `<button type="button" class="btn primary" id="pa-check" ${picked.length ? '' : 'disabled'}>${icon('check')}${t('practice.check')}</button>`
        }</div>
        ${keysHint(q, 'practice.keysStudy')}
      </section>`;
    const choose = (k) => {
      if (verdict) return;
      if (multi) picked = picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k];
      else picked = picked[0] === k ? [] : [k];
      paint();
    };
    $$('#practice-body .pa-opt[data-key]').forEach((b) => b.addEventListener('click', () => choose(b.dataset.key)));
    practiceKey = optionKeys(q, choose, () => (verdict ? $('#pa-next').click() : picked.length && $('#pa-check').click()));
    $('#pa-check')?.addEventListener('click', () => {
      const now = Date.now();
      const right = isCorrect(q, picked);
      const before = ctx.review();
      const after = answerReview(before, q.id, right, now);
      store.set(keys.review, after);
      if (right) ok += 1;
      verdict = {
        right,
        text: !right ? t('practice.reviewMiss') : after === before ? t('practice.reviewRightEarly') : t('practice.reviewRight', { n: daysUntil(after.cards[q.id].due, now) }),
      };
      paint();
      $('#pa-next')?.focus();
    });
    $('#pa-next')?.addEventListener('click', () => {
      cur += 1;
      picked = [];
      verdict = null;
      paint();
      window.scrollTo(0, 0);
    });
  };
  paint();
}

function practiceBank(ctx) {
  const { c, set } = ctx;
  const hist = ctx.history();
  let domain = '';
  let filter = 'all';
  let query = '';
  $('#practice-body').innerHTML = `${practiceHead(ctx, 'bank')}
    <div class="pa-filters">
      <input type="search" id="pa-search" placeholder="${esc(t('practice.search'))}" aria-label="${esc(t('practice.search'))}">
      <select id="pa-domain" aria-label="${esc(t('practice.allDomains'))}"><option value="">${t('practice.allDomains')}</option>${c.domains.map((d) => `<option>${esc(d.name)}</option>`).join('')}</select>
      <div class="segmented">${[['all', 'filterAll'], ['wrong', 'filterWrong'], ['new', 'filterNew']].map(([v, k], i) => `<label><input type="radio" name="pa-filter" value="${v}" ${i ? '' : 'checked'}><span>${t(`practice.${k}`)}</span></label>`).join('')}</div>
    </div>
    <p class="hint" id="pa-count"></p><div id="pa-list"></div>`;
  const paint = () => {
    const needle = query.trim().toLowerCase();
    const list = set.questions.filter((q) => {
      if (domain && q.domain !== domain) return false;
      const h = hist.questions[q.id];
      if (filter === 'wrong' && !h?.wrong) return false;
      if (filter === 'new' && h) return false;
      return !needle || `${pText(q.prompt)} ${q.options.map((o) => pText(o.text)).join(' ')}`.toLowerCase().includes(needle);
    });
    $('#pa-count').textContent = t('practice.shown', { a: list.length, b: set.questions.length });
    $('#pa-list').innerHTML = list.map((q) => reviewCard(q, hist.questions[q.id]?.last)).join('');
  };
  $('#pa-search').addEventListener('input', (e) => {
    query = e.target.value;
    paint();
  });
  $('#pa-domain').addEventListener('change', (e) => {
    domain = e.target.value;
    paint();
  });
  $$('input[name="pa-filter"]').forEach((r) =>
    r.addEventListener('change', () => {
      filter = r.value;
      paint();
    }),
  );
  paint();
}

function practiceMistakes(ctx) {
  const { id, set } = ctx;
  const rows = mistakes(ctx.history(), set.questions);
  $('#practice-body').innerHTML = `${practiceHead(ctx, 'mistakes')}
    ${rows.length
      ? `<div class="pa-downloads"><button type="button" class="btn" id="pa-csv">${icon('download')}${t('practice.csv')}</button><button type="button" class="btn" id="pa-json">${icon('download')}${t('practice.json')}</button></div>
        ${rows.map((r) => reviewCard(r.question, r.last, esc(t('practice.timesWrong', { n: r.wrong, m: r.seen })))).join('')}`
      : `<p class="hint">${esc(t('practice.noMistakes'))}</p>`}`;
  $('#pa-csv')?.addEventListener('click', () => download(`${id}-mistakes.csv`, mistakesCsv(rows, getLang()), 'text/csv'));
  $('#pa-json')?.addEventListener('click', () =>
    download(`${id}-mistakes.json`, JSON.stringify(rows.map((r) => ({ id: r.question.id, domain: r.question.domain, question: pText(r.question.prompt), your_answer: r.last, correct: r.question.correct, times_wrong: r.wrong, times_seen: r.seen })), null, 2), 'application/json'),
  );
}

function practiceProgress() {
  const rows = DATA.certifications
    .filter((c) => c.practice_questions)
    .map((c) => {
      const keys = practiceKeys(c.id);
      const history = store.get(keys.history, emptyHistory());
      const now = Date.now();
      const due = Object.values(loadReview(store.get(keys.review, null), history, now).cards).filter((card) => card.due <= now).length;
      return { c, attempts: history.attempts, due };
    })
    .filter((x) => x.attempts.length);
  if (!rows.length) return '';
  return `<section class="card panel"><h2>${icon('dumbbell')}${t('practice.progress')}</h2><ul class="pa-history">${rows
    .map(({ c, attempts, due }) => `<li><span>${esc(c.code)}</span><small>${esc(t('practice.progressRow', { a: attempts.length, p: attempts.at(-1).pct }))}</small>${due ? `<a href="#practice?cert=${esc(c.id)}&tab=review">${icon('refresh-cw')}${esc(t('practice.progressDue', { n: due }))}</a>` : ''}<a href="#practice?cert=${esc(c.id)}">${t('practice.open')}</a></li>`)
    .join('')}</ul></section>`;
}

// ---------- tracked plans and progress ----------
function bindStudyBackup() {
  const fileInput = $('#study-backup-file');
  const restoreButton = $('#study-backup-restore');
  const status = $('#study-backup-status');
  const show = (key) => {
    status.dataset.i18n = key;
    status.textContent = t(key);
  };
  $('#study-backup-download').addEventListener('click', () => {
    try {
      download(`pathfinder-study-${todayLocal()}.json`, createStudyBackup(localStorage), 'application/json');
      show('backup.downloaded');
    } catch {
      show('backup.downloadFailed');
    }
  });
  restoreButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      show('backup.tooLarge');
      return;
    }
    restoreButton.disabled = true;
    try {
      let data;
      try {
        data = parseStudyBackup(await file.text());
      } catch {
        show('backup.invalid');
        return;
      }
      const restore = () => {
        if ($('#view-progress').hidden) return false;
        if (hasStudyData(localStorage) && !window.confirm(t('backup.replace'))) return false;
        restoreStudyBackup(localStorage, data);
        return true;
      };
      // Coordinate two simultaneous restores in different tabs when Web Locks is available.
      const restored = navigator.locks ? await navigator.locks.request('pathfinder:restore-study', restore) : restore();
      if (restored) renderProgress();
      show(restored ? 'backup.restored' : 'backup.canceled');
    } catch {
      show('backup.restoreFailed');
    } finally {
      restoreButton.disabled = false;
    }
  });
}

const trackedPlans = () => store.get(KEYS.plans, {});
const isTracked = (key) => key in trackedPlans();

function trackParams() {
  const params = planParams();
  return { ...params, start: params.start || todayLocal() };
}

function setTracked(key, params, on) {
  const plans = trackedPlans();
  if (on) plans[key] = params;
  else delete plans[key];
  store.set(KEYS.plans, plans);
  const btn = $('#track-plan');
  if (btn) {
    btn.setAttribute('aria-pressed', String(on));
    $('span', btn).textContent = on ? t('plan.tracking') : t('plan.track');
  }
}

// Rescheduling saves new dates (and sessions left out) per plan, next to its ticks. They belong to
// the plan they were made on: a plan rebuilt with other settings drops them.
const reschedKey = (key) => key.replace(KEYS.progress, KEYS.resched);
const planSig = (p) => `${p.sessions.length}:${p.hours}:${p.sessions.at(-1).date}`;
const daysOf = (params) => params.days.split(',').filter(Boolean).map(Number);

function savedMoves(base, key) {
  const saved = store.get(reschedKey(key), null);
  return saved && saved.sig === planSig(base) ? saved : null;
}

function movedPlan(base, key, days) {
  const saved = savedMoves(base, key);
  return saved ? { ...applyMoves(base, saved, days), rescheduled: saved } : base;
}

/** Move what is left of a plan onto the study days from today, keeping one step of undo. */
function rescheduleFrom(key, params) {
  const base = planFrom(params);
  if (!base) return;
  const days = daysOf(params);
  const saved = savedMoves(base, key);
  const p = saved ? applyMoves(base, saved, days) : base;
  const r = reschedule({ sessions: p.sessions, done: store.get(key, []), today: todayLocal(), days, targetDate: params.exam || null });
  store.set(reschedKey(key), {
    sig: planSig(base),
    on: todayLocal(),
    dates: { ...saved?.dates, ...r.dates },
    skipped: [...(saved?.skipped || []), ...r.skipped],
    prev: saved ? { on: saved.on, dates: saved.dates, skipped: saved.skipped } : null,
  });
  if (!isTracked(key)) setTracked(key, params, true);
}

function undoReschedule(key) {
  const saved = store.get(reschedKey(key), null);
  store.set(reschedKey(key), saved?.prev ? { sig: saved.sig, ...saved.prev, prev: null } : null);
}

/** A tracked plan rebuilt from its settings; with its key, its saved moves applied too. */
function planFrom(params, key = null) {
  const cert = BY_ID.get(params.cert);
  if (!cert) return null;
  try {
    const plan = buildPlan({
      cert,
      hours: Number(params.hours),
      start: params.start,
      days: params.days.split(',').filter(Boolean).map(Number),
      sessionMinutes: Number(params.len) || 90,
      startTime: params.time || '19:00',
      confidence: store.get(confidenceKey(cert.id), {}),
      targetDate: params.exam || null,
    });
    return key ? movedPlan(plan, key, daysOf(params)) : plan;
  } catch {
    return null;
  }
}

/** Sessions in date order: done, missed (past and not ticked) or planned. */
function progressData() {
  const today = todayLocal();
  const plans = Object.entries(trackedPlans())
    .map(([key, params]) => ({ key, params, plan: planFrom(params, key) }))
    .filter((x) => x.plan);
  const sessions = [];
  for (const x of plans) {
    x.done = new Set(store.get(x.key, []));
    for (const s of x.plan.sessions) sessions.push({ ...s, plan: x, done: x.done.has(s.n), past: s.date < today, today: s.date === today });
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date) || a.n - b.n);
  // Streak: completed sessions in a row, counting back from today. Today's open session is not a miss yet.
  let streak = 0;
  for (const s of [...sessions].filter((x) => x.date <= today).reverse()) {
    if (s.done) streak += 1;
    else if (s.today) continue;
    else break;
  }
  return { today, plans, sessions, streak };
}

function renderProgress() {
  const body = $('#progress-body');
  const { today, plans, sessions, streak } = progressData();
  if (!plans.length) {
    body.innerHTML = `<div class="card empty-card">${tile('activity', '--accent')}<p>${esc(t('progress.empty'))}</p><a class="btn primary" href="#plan">${icon('route')}${t('progress.start')}</a></div>${practiceProgress()}`;
    return;
  }
  const done = sessions.filter((s) => s.done);
  const hours = Math.round((done.reduce((m, s) => m + s.minutes, 0) / 60) * 10) / 10;
  const missed = sessions.filter((s) => s.past && !s.done).length;
  const upcoming = sessions.filter((s) => !s.done && !s.past).slice(0, 6);
  const tileStat = (ic, lbl, value, sub = '') => `<div class="card stat">${tile(ic, '--accent', 'sm')}<div><small>${lbl}</small><b>${value}</b>${sub ? `<small class="sub">${esc(sub)}</small>` : ''}</div></div>`;

  // Five weeks of scheduled sessions: two back, this one, two ahead. Monday first.
  const now = utc(today);
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7) - 14);
  const byDate = new Map();
  for (const s of sessions) (byDate.get(s.date) || byDate.set(s.date, []).get(s.date)).push(s);
  const cells = dates().dow.map((d) => `<span class="dow">${d}</span>`);
  for (let i = 0; i < 35; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const date = iso(d);
    const list = byDate.get(date) || [];
    const state = !list.length ? '' : list.every((s) => s.done) ? 'done' : list.some((s) => s.past && !s.done) ? 'missed' : 'planned';
    const title = list.map((s) => `${s.plan.plan.cert.code} · ${kindLabel(s.kind)}: ${cap(sname(s))}`).join('\n');
    cells.push(`<span class="d ${state}${date === today ? ' today' : ''}" ${title ? `title="${esc(`${day(date)}\n${title}`)}"` : ''}>${d.getUTCDate()}</span>`);
  }

  const next = (s) => `<li class="card up">
      ${badge(BY_ID.get(s.plan.params.cert), 34, { label: false })}
      <div><small>${day(s.date)}${s.today ? ` · ${t('progress.today')}` : ''} · ${len(s.minutes)}</small><b>${esc(kindLabel(s.kind))}: ${esc(cap(sname(s)))}</b><span class="who">${esc(s.plan.plan.cert.code)}</span></div>
      <a class="btn icon-btn" href="#plan?${esc(new URLSearchParams(s.plan.params).toString())}" aria-label="${esc(t('progress.open'))}">${icon('arrow-right')}</a>
    </li>`;

  const planCard = (x) => {
    const c = BY_ID.get(x.params.cert);
    const total = x.plan.sessions.length;
    const pct = Math.round((x.done.size / total) * 100);
    const nextOne = x.plan.sessions.find((s) => !x.done.has(s.n) && s.date >= today) || x.plan.sessions.find((s) => !x.done.has(s.n));
    const examDay = x.plan.deadline ? x.plan.deadline.targetDate : x.plan.examDate;
    const late = behind(x.plan.sessions, [...x.done], today);
    const room = late.count && reschedule({ sessions: x.plan.sessions, done: [...x.done], today, days: daysOf(x.params), targetDate: x.params.exam || null }).available;
    return `<article class="card plan-card" style="--pc:${providerColor(c.provider)}">
      <div class="head">${badge(c, 52, { label: false })}<div><h3><a href="#cert?id=${esc(c.id)}">${esc(c.name)}</a></h3><div class="who">${esc(c.provider)} · ${esc(c.code)}</div></div>${ring(pct, 52, 'good pct', t('plan.pctDone', { p: pct }))}</div>
      <p class="meta"><span>${icon('calendar-days')}${t('plan.of', { a: x.done.size, b: total })} ${t('plan.done')}</span><span>${icon('target')}${esc(t('progress.examOn', { d: day(examDay) }))}</span></p>
      ${nextOne ? `<p class="meta next">${icon('arrow-right')}<span>${esc(t('progress.nextOne', { x: `${day(nextOne.date)} · ${kindLabel(nextOne.kind)}: ${cap(sname(nextOne))}` }))}</span></p>` : ''}
      ${late.count ? `<p class="meta late">${icon('triangle-alert')}<span>${esc(t('progress.behindPlan', { n: late.count }))}${room ? '' : ` ${esc(t('plan.reschedNone', { d: day(examDay) }))}`}</span>${room ? `<button type="button" class="link" data-act="resched" data-key="${esc(x.key)}">${t('plan.reschedule')}</button>` : ''}</p>` : ''}
      <div class="plan-card-actions"><a class="btn" href="#plan?${esc(new URLSearchParams(x.params).toString())}">${icon('route')}${t('progress.open')}</a><button type="button" class="link" data-act="untrack" data-key="${esc(x.key)}">${t('progress.stop')}</button></div>
    </article>`;
  };

  body.innerHTML = `
    <div class="plan-summary progress-summary">
      ${tileStat('flame', t('progress.streak'), streak, t('progress.streakUnit', { n: streak }))}
      ${tileStat('clock', t('progress.hours'), `${hours} h`)}
      ${tileStat('circle-check', t('progress.sessions'), t('plan.of', { a: done.length, b: sessions.length }))}
      ${tileStat('route', t('progress.plans'), plans.length)}
    </div>
    ${missed ? `<div class="status warn">${icon('triangle-alert')}${esc(t('progress.behind', { n: missed }))}</div>` : ''}
    <div class="progress-cols">
      <section class="card panel"><h2>${icon('calendar-clock')}${t('progress.next')}</h2>${upcoming.length ? `<ol class="up-list">${upcoming.map(next).join('')}</ol>` : `<p class="hint">${t('progress.nothingNext')}</p>`}</section>
      <section class="card panel"><h2>${icon('calendar-days')}${t('progress.weeks')}</h2><div class="mgrid strip">${cells.join('')}</div>
        <ul class="strip-key"><li><span class="d done"></span>${t('progress.legendDone')}</li><li><span class="d missed"></span>${t('progress.legendMissed')}</li><li><span class="d planned"></span>${t('progress.legendPlanned')}</li><li><span class="d today"></span>${t('progress.today')}</li></ul>
      </section>
    </div>
    <div class="plan-cards">${plans.map(planCard).join('')}</div>
    ${practiceProgress()}`;
}

// Calendar and Markdown exports in the interface language.
function localPlan(p) {
  if (getLang() === 'en') return p;
  const D = dates();
  return {
    ...p,
    sessions: p.sessions.map((s) => ({
      ...s,
      weekday: D.days[utc(s.date).getUTCDay()],
      title: `${kindLabel(s.kind)}: ${cap(sname(s))}`,
      detail: kindDetail(s.kind, s.detail, s.minutes),
    })),
  };
}

async function share(id) {
  const c = BY_ID.get(id);
  // The static page in the current language: c/<id>/ or es/c/<id>/.
  const url = `${location.origin}${location.pathname.replace(/index\.html$/, '')}${getLang() === 'en' ? '' : `${getLang()}/`}c/${id}/`;
  const button = $(`#cert-body [data-act="share"]`);
  if (navigator.share) {
    try {
      await navigator.share({ title: `${c.name} · pathfinder`, url });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  copy(url, button);
}

// ---------- hero ----------
/** Every certification as a badge, split over two rows that drift in opposite directions.
 *  Each row holds its set twice so the -50% shift loops without a seam. */
function renderMarquee() {
  const byProvider = new Map();
  for (const c of DATA.certifications) byProvider.set(c.provider, [...(byProvider.get(c.provider) || []), c]);
  const groups = [...byProvider.values()].sort((a, b) => b.length - a.length);
  // Deal one per provider per round so neighbours rarely share an issuer colour.
  const order = [];
  for (let round = 0; order.length < DATA.certifications.length; round++) for (const g of groups) if (g[round]) order.push(g[round]);
  const rows = [[], []];
  order.forEach((c, i) => rows[i % 2].push(c));
  rows.forEach((row, r) => {
    // Mouse shortcuts only: the same links follow in the list, so the rows stay out of the tab order.
    // The first badges of each row are on screen as the page opens; the rest load as they drift in.
    const set = (copy) => row.map((c, i) => `<a href="#cert?id=${esc(c.id)}" title="${esc(c.name)}" tabindex="-1" style="--k:${i}">${badge(c, 64, { label: false, eager: !copy && i < 6 })}</a>`).join('');
    $(`#mq-${r + 1}`).innerHTML = `<div class="mq-track" style="--dur:${(row.length * (r ? 3.6 : 3.1)).toFixed(1)}s"><div class="mq-set">${set(false)}</div><div class="mq-set mq-copy">${set(true)}</div></div>`;
  });
}

function setMotionPaused(paused) {
  $('#marquee').classList.toggle('paused', paused);
  const button = $('#mq-toggle');
  button.setAttribute('aria-pressed', String(paused));
  $('use', button).setAttribute('href', paused ? '#i-play' : '#i-pause');
}

// The chat (chat.js) hands what lib/intent.js reads in the conversation to the "For me" form, where
// every choice can be changed. The budget becomes the price filter; the experience only if the text gave one.
function refineFromIntent(intent) {
  if ($('#view-list').hidden) {
    // The chat has its own page: open the catalog first, without a hashchange that would
    // restore the old scroll position after the jump below.
    history.pushState(null, '', location.pathname + location.search);
    renderRoute();
  }
  const p = intent.profile;
  profile = { ...profile, roles: p.roles, known: p.known, want: p.want, experience: intent.levelStated ? p.experience : profile.experience };
  store.set(KEYS.profile, profile);
  fillProfile();
  if (p.roles.length || p.known.length) $('#profile-more').open = true;
  if (p.budget != null) setPriceOption(p.budget);
  setProfileOpen(true);
  renderList();
  $('#for-me').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

// ---------- search suggestions ----------
// The hero search lists its best matches right under the box, so nobody has to scroll past the
// badges to see what they found. Enter or "See all" jumps to the full grid below.
const SUGGEST = 6;
let suggest = { ids: [], active: -1 };

function renderSuggest(q, list) {
  suggest = { ids: list.slice(0, SUGGEST).map((c) => c.id), active: -1 };
  if (!q) return closeSuggest();
  $('#q-list').innerHTML = list
    .slice(0, SUGGEST)
    .map(
      (c, i) => `<li role="option" id="q-opt-${i}" aria-selected="false"><a class="q-opt" href="#cert?id=${esc(c.id)}" tabindex="-1">
        ${badge(c, 36, { label: false })}
        <span class="q-text"><span class="q-name">${esc(c.name)}</span><span class="q-meta">${esc(c.provider)} · ${esc(c.code)}</span></span>
        <span class="q-fee">${esc(fee(c))}</span></a></li>`,
    )
    .join('');
  $('#q-foot').innerHTML =
    (list.length
      ? `<button type="button" class="q-all" data-q="all">${esc(t('search.all', { n: list.length }))}</button>`
      : `<p class="q-none">${esc(t('search.none'))}</p>`) +
    `<a class="q-ask" href="#ask" data-q="ask">${icon('sparkles')}<span>${esc(t('search.askAi', { q }))}</span></a>`;
  $('#q').removeAttribute('aria-activedescendant');
  if (document.activeElement === $('#q')) openSuggest();
}

function openSuggest() {
  if (!$('#q').value.trim()) return;
  $('#q-pop').hidden = false;
  $('#q').setAttribute('aria-expanded', 'true');
}

function closeSuggest() {
  $('#q-pop').hidden = true;
  $('#q').setAttribute('aria-expanded', 'false');
  $('#q').removeAttribute('aria-activedescendant');
  suggest.active = -1;
  $$('#q-list [aria-selected="true"]').forEach((li) => li.setAttribute('aria-selected', 'false'));
}

function moveSuggest(step) {
  const n = suggest.ids.length;
  if (!n) return;
  openSuggest();
  // -1 means back in the box; past either end wraps around through it.
  let next = suggest.active + step;
  if (next < -1) next = n - 1;
  if (next > n - 1) next = -1;
  suggest.active = next;
  $$('#q-list [role="option"]').forEach((li, i) => li.setAttribute('aria-selected', String(i === next)));
  if (next < 0) return $('#q').removeAttribute('aria-activedescendant');
  $('#q').setAttribute('aria-activedescendant', `q-opt-${next}`);
  $(`#q-opt-${next}`).scrollIntoView({ block: 'nearest' });
}

function onSearchKey(e) {
  if (e.isComposing) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    moveSuggest(e.key === 'ArrowDown' ? 1 : -1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    // A code or nickname typed whole ("az 900", "sec+") opens its certification.
    const exact = lastSearch.exact.length === 1 && suggest.ids.includes(lastSearch.exact[0]) ? lastSearch.exact[0] : null;
    const id = suggest.ids[suggest.active] || exact;
    closeSuggest();
    if (id) location.hash = `#cert?id=${id}`;
    else showResults();
  } else if (e.key === 'Escape' && !$('#q-pop').hidden) {
    // Without this the search box would also clear itself.
    e.preventDefault();
    closeSuggest();
  }
}

function onSuggestClick(e) {
  const act = e.target.closest('[data-q]')?.dataset.q;
  if (act === 'all') {
    closeSuggest();
    showResults();
  } else if (act === 'ask') {
    e.preventDefault();
    const q = $('#q').value.trim();
    closeSuggest();
    askAbout(q);
  } else if (e.target.closest('.q-opt')) closeSuggest();
}

/** Opens the chat with the search words already typed, unless a message is half written. */
function askAbout(text) {
  const box = $('#chat-input');
  if (text && !box.value.trim()) {
    box.value = text;
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }
  location.hash = '#ask';
}

function showResults() {
  const head = $('#list-head');
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  head.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}

// ---------- language ----------
/** The catalog search, with category and skill names in both languages. */
function buildSearch() {
  search = createSearch(DATA.certifications, Fuse, {
    doc: (c) => ({ category: `${c.category} ${t(`cat.${c.category}`)}`, skills: DATA.taxonomy.skills.filter((s) => c.skills.includes(s.id)).map((s) => `${s.label} ${label('skills', s)}`).join(' ') }),
  });
}

function buildLabels() {
  LABELS = {};
  const tx = DATA.taxonomy;
  for (const group of ['levels', 'statuses', 'styles', 'roles', 'skills']) for (const x of tx[group]) LABELS[x.id] = label(group, x);
}

function renderSiteText() {
  const all = DATA.certifications;
  const tx = DATA.taxonomy;
  const providers = new Set(all.map((c) => c.provider)).size;
  const free = all.filter((c) => c.fee.usd === 0).length;
  const withPrep = all.filter((c) => c.prep && c.prep.length).length;
  const checkedDates = all.map((c) => c.checked_on).sort();
  const fmt = (d) => day(d, { weekday: false, year: true });
  const checked = checkedDates[0] === checkedDates.at(-1) ? t('about.checkedOn', { d: fmt(checkedDates[0]) }) : t('about.checkedBetween', { a: fmt(checkedDates[0]), b: fmt(checkedDates.at(-1)) });
  const heroStat = (n, lbl) => `<span><b>${n}</b> ${lbl}</span>`;
  $('#hero-stats').innerHTML = heroStat(all.length, t('hero.certs')) + heroStat(providers, t('hero.providers')) + heroStat(withPrep, t('hero.prep')) + (free ? heroStat(free, t('hero.free')) : '');
  $('#level-key').innerHTML = tx.levels.map((l) => `<li>${lvl(l.id)}</li>`).join('');
  $('#hours-note').textContent = `${hoursNote(tx.hours_note)} ${t('about.ranges', { x: tx.levels.map((l) => `${label('levels', l).toLowerCase()} ${l.hours[0]}–${l.hours[1]} h`).join(', ') })}`;
  $('#data-note').textContent = t('about.dataNote', { n: all.length, p: providers, s: Object.keys(DATA.sources).length, r: Object.keys(DATA.reports).length, checked });
  $('#foot-data').textContent = t('foot.catalog', { d: fmt(DATA.generated_on) });
  $('#lang').textContent = t('lang.switch');
  $('#lang').setAttribute('aria-label', t('lang.aria'));
}

function localize() {
  applyStatic();
  buildLabels();
  buildSearch();
  renderSiteText();
  fillProfile();
  fillFilters();
  renderCats();
  renderProviders();
  labelDays();
  setRatedLabel(Object.keys(readConfidence()).length);
  setThemeButton();
  chat?.localize();
}

async function init() {
  applyStatic();
  try {
    const res = await fetch('catalog.json'); // the build adds ?v=<build>, like index.html's preload
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
  } catch (err) {
    $('#loading').textContent = t('load.error', { e: err.message });
    return;
  }
  DATA.reports = Object.fromEntries(DATA.reports.map((r) => [r.id, r]));
  BY_ID = new Map(DATA.certifications.map((c) => [c.id, c]));
  buildLabels();
  const all = DATA.certifications;

  profile = { ...emptyProfile(), ...store.get(KEYS.profile, {}) };
  setCompare(store.get(KEYS.compare, []).filter((id) => BY_ID.has(id)).slice(0, MAX_COMPARE));

  buildSearch();
  renderMarquee();
  setMotionPaused(store.get(KEYS.motion, false) === 'paused');

  renderSiteText();
  fillProfile();
  fillFilters();
  renderCats();
  renderProviders();
  setThemeButton();
  fillPlanForm();
  bind();
  // Sticky parts of a view (the compare header) sit under the top bar, whose height changes on phones.
  const top = $('.top');
  const topHeight = () => document.documentElement.style.setProperty('--top-h', `${top.offsetHeight}px`);
  topHeight();
  if ('ResizeObserver' in window) new ResizeObserver(topHeight).observe(top);
  chat = mountChat({ data: DATA, helpers: { icon, lvl, fee, flag }, onRefine: refineFromIntent });
  $('#loading').remove();
  route();
  registerWorker();
}

// The offline copy (sw.js) is registered once the page has loaded, so it never competes with the
// first visit's downloads. A newer build's worker waits instead of taking over an open page: if this
// page already is that build (it came from the network), the worker takes over quietly; otherwise a
// notice offers to refresh, and the page reloads once the new worker is in charge.
function registerWorker() {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!('serviceWorker' in navigator) || (location.protocol !== 'https:' && !local)) return;
  const sw = navigator.serviceWorker;
  const build = new URL(import.meta.url).searchParams.get('v') || 'dev';
  let reloading = false;
  sw.addEventListener('controllerchange', () => reloading && location.reload());
  const versionOf = (worker) =>
    new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (e) => resolve(e.data);
      worker.postMessage('version', [channel.port2]);
      setTimeout(() => resolve(null), 2000);
    });
  const offer = async (worker) => {
    if (!worker || !sw.controller) return; // a first install has nothing to replace
    if ((await versionOf(worker)) === build) return worker.postMessage('activate');
    if ($('#update')) return;
    const note = document.createElement('div');
    note.id = 'update';
    note.className = 'update';
    note.setAttribute('role', 'status');
    note.innerHTML = `<span data-i18n="update.ready">${esc(t('update.ready'))}</span><button type="button" class="btn primary" data-i18n="update.reload">${esc(t('update.reload'))}</button>`;
    $('button', note).addEventListener('click', () => {
      reloading = true;
      worker.postMessage('activate');
    });
    document.body.append(note);
  };
  const start = () =>
    sw
      .register('sw.js')
      .then((reg) => {
        offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => worker.state === 'installed' && offer(worker));
        });
        // A tab left open for days still hears about new builds: look again when it comes back, at most hourly.
        let checked = Date.now();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible' || Date.now() - checked < 3600e3) return;
          checked = Date.now();
          reg.update().catch(() => {});
        });
      })
      .catch(() => {
        /* offline support is optional */
      });
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
}

init();
