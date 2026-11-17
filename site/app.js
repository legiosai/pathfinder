import { emptyProfile, rank } from './lib/match.js';
import { buildPlan, estimateHours, planTopics, toICS, toMarkdown, KIND_DETAIL } from './lib/planner.js';
import { buildRun, emptyHistory, grade, isCorrect, minutesFor, mistakes, mistakesCsv, record, totals } from './lib/practice.js';
import { INTERVALS, answer as answerReview, applyRun, daysUntil, loadReview, queue } from './lib/review.js';
import { badge, weights, hbars, columns } from './visuals.js';
import Fuse from './vendor/fuse.js';
import confetti from './vendor/confetti.js';
import { t, getLang, setLang, dates, label, hoursNote, lib, kindDetail, markdownText, applyStatic } from './i18n.js';
import { mountDescribe } from './describe.js';

const MAX_COMPARE = 4;
const KEYS = {
  profile: 'pathfinder:profile',
  compare: 'pathfinder:compare',
  progress: 'pathfinder:progress:',
  confidence: 'pathfinder:confidence:',
  theme: 'pathfinder:theme',
  plans: 'pathfinder:plans',
  motion: 'pathfinder:motion',
  practice: 'pathfinder:practice:',
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
let fuse = null;
let describe = null;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- visual vocabulary ----------
const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// Categories in display order; any other category in the catalog follows them.
const CATS = ['AI engineering', 'ML foundations', 'AI security', 'Cloud & platform', 'Cybersecurity', 'Data & analytics'];

// Levels as trail difficulty signs: the shape carries the level, in ink.
const SIGN = {
  entry: '<svg viewBox="0 0 14 14" aria-hidden="true"><circle class="entry" cx="7" cy="7" r="6"/></svg>',
  associate: '<svg viewBox="0 0 14 14" aria-hidden="true"><rect class="associate" x="1.5" y="1.5" width="11" height="11" rx="1.5"/></svg>',
  professional: '<svg viewBox="0 0 14 14" aria-hidden="true"><path class="professional" d="M7 .5 13.5 7 7 13.5.5 7z"/></svg>',
  expert: '<svg class="two" viewBox="0 0 26 14" aria-hidden="true"><path class="expert" d="M7 .5 13.5 7 7 13.5.5 7zM19 .5 25.5 7 19 13.5 12.5 7z"/></svg>',
};
const lvl = (level) => `<span class="lvl">${SIGN[level] || ''}${esc(LABELS[level])}</span>`;

const prepLabel = (r) => (['official-guide', 'course', 'docs', 'practice'].includes(r.kind) ? t(`prep.${r.kind}`) : r.kind);
const catName = (cat) => t(`cat.${cat}`);
const kindLabel = (k) => t(`kind.${k}`);
const sname = (s) => lib(s.name.replace(/ \((\d+\/\d+)\)$/, '')) + (s.name.match(/ \(\d+\/\d+\)$/)?.[0] || '');

/** A score or share as a small number. `pct` adds the percent sign and a hairline bar under it. */
function meter(value, cls = '', label = '') {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const pct = cls.includes('pct');
  return `<span class="meter ${cls}" ${label ? `aria-label="${esc(label)}" role="img"` : 'aria-hidden="true"'}><b>${v}${pct ? '<small>%</small>' : ''}</b>${pct ? `<i style="--v:${v}%"></i>` : ''}</span>`;
}

/** A prep resource as a quiet row: title, note, kind and cost. */
const resource = (r, withNote = true) =>
  ext(r.url, `<b>${esc(r.title)}</b>${withNote && r.note ? `<small>${esc(r.note)}</small>` : ''}<span class="res-kind">${esc(prepLabel(r))} · ${r.cost === 'paid' ? t('paid') : t('free')}</span>`, 'res');

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

function duration(cert) {
  const m = cert.exam.minutes;
  if (!m) return cert.exam.style === 'practical' ? t('dur.practical') : '—';
  return len(m);
}

const FLAG = { restricted: 'lock', upcoming: 'clock' };
const flag = (c) => (FLAG[c.status] ? `<span class="flag">${icon(FLAG[c.status])}${t(`flag.${c.status}`)}</span>` : '');

// ---------- routing ----------
function parseHash() {
  const raw = location.hash.replace(/^#/, '');
  const [name, query = ''] = raw.split('?');
  return { name, params: new URLSearchParams(query) };
}

const VIEWS = { '': 'list', list: 'list', browse: 'list', match: 'list', cert: 'cert', compare: 'compare', plan: 'plan', practice: 'practice', progress: 'progress', about: 'about' };
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
  const practiceId = params.get('cert');
  if (view === 'practice' && !BY_ID.get(practiceId)?.practice_questions) view = 'list';
  if (view !== 'practice') stopPracticeTimer();

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
  if (view === 'practice') renderPractice(practiceId, params);
  if (view === 'progress') renderProgress();

  const moved = view !== lastView || (view === 'cert' && certId !== lastCert);
  if (moved) window.scrollTo(0, view === 'list' ? listScroll : 0);
  lastView = view;
  lastCert = view === 'cert' ? certId : null;

  const titles = { practice: t('practice.title'), compare: t('compare.title'), plan: t('plan.title'), progress: t('progress.title'), about: t('about.title') };
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
  const all = DATA.certifications;
  const n = (p) => all.filter((c) => c.provider === p).length;
  const providers = [...new Set(all.map((c) => c.provider))].sort((a, b) => n(b) - n(a) || a.localeCompare(b));
  const keepProvider = f.provider.value;
  f.provider.innerHTML = opt('', t('filter.allProviders')) + providers.map((p) => opt(p, `${p} (${n(p)})`)).join('');
  f.provider.value = keepProvider;
  const keep = f.level.value;
  f.level.innerHTML = opt('', t('filter.allLevels')) + DATA.taxonomy.levels.map((l) => opt(l.id, label('levels', l))).join('');
  f.level.value = keep;
  for (const o of f.price.options) if (Number(o.value) > 0) o.textContent = t('price.upto', { n: o.value });
}

/** Categories as text tabs with their counts. */
function renderCats() {
  const all = DATA.certifications;
  const count = (cat) => all.filter((c) => c.category === cat).length;
  const cats = [...CATS, ...new Set(all.map((c) => c.category).filter((x) => !CATS.includes(x)))].filter(count);
  const name = (cat) => (catName(cat) === `cat.${cat}` ? cat : catName(cat));
  const btn = (id, text, n) => `<button type="button" class="cat" data-cat="${esc(id)}" aria-pressed="${activeCat === id}">${esc(text)}<small>${n}</small></button>`;
  $('#cats').innerHTML = btn('', t('cat.all'), all.length) + cats.map((cat) => btn(cat, name(cat), count(cat))).join('');
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
    if (f.provider.value && c.provider !== f.provider.value) return false;
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
  $('#list-head').textContent = t('list.head', { shown: list.length, total: all.length, scored: !!scores });
  const certs = $('#certs');
  certs.classList.toggle('scored', !!scores);
  certs.innerHTML = list.length ? listHead(!!scores) + list.map((c) => certRow(c, scores && scores.get(c.id))).join('') : `<p class="empty">${t('list.empty')}</p>`;
}

/** Column labels over the list. Each row carries its own labels for screen readers, so this one is hidden from them. */
const listHead = (scored) =>
  `<div class="cert-row cert-row-head" aria-hidden="true"><span></span><span>${t('plan.cert')}</span><span>${t('stat.level')}</span><span class="cr-num">${t('stat.price')}</span><span class="cr-num">${t('stat.length')}</span>${scored ? `<span class="cr-num">${t('list.fit')}</span>` : ''}<span></span></div>`;

/** One certification as a row: badge, name over issuer and code, then level, price and length in columns. */
function certRow(c, score) {
  const inCompare = compare.includes(c.id);
  const full = !inCompare && compare.length >= MAX_COMPARE;
  return `<article class="cert-row">
    <span class="cr-badge">${badge(c, 36, { label: false })}</span>
    <div class="cr-name">
      <h3><a href="#cert?id=${esc(c.id)}">${esc(c.name)}</a></h3>
      <p class="who">${esc(c.provider)} · ${esc(c.code)}${flag(c)}</p>
      <p class="cr-meta">${lvl(c.level)}<span>${esc(fee(c))}</span><span>${esc(duration(c))}</span></p>
    </div>
    <span class="cr-level">${lvl(c.level)}</span>
    <span class="cr-num"><span class="sr">${t('stat.price')}: </span>${esc(fee(c))}</span>
    <span class="cr-num"><span class="sr">${t('stat.length')}: </span>${esc(duration(c))}</span>
    ${score ? `<span class="cr-num cr-fit">${meter(score.score, '', t('match.aria', { n: score.score }))}</span>` : ''}
    <button type="button" class="btn ghost icon-btn cr-cmp" data-act="compare" data-id="${esc(c.id)}" aria-pressed="${inCompare}" aria-label="${inCompare ? t('compare.remove') : t('compare.add')}" title="${inCompare ? t('compare.in') : full ? t('compare.full') : t('compare.add')}" ${full ? 'disabled' : ''}>${icon(inCompare ? 'check' : 'plus')}</button>
  </article>`;
}

// ---------- certification page ----------
function renderCert(id) {
  const c = BY_ID.get(id);
  const sources = c.sources.map((s) => DATA.sources[s]).filter(Boolean);
  const reports = c.reports.map((r) => DATA.reports[r]).filter(Boolean);
  const official = sources[0];
  const scores = scoring();
  const mine = scores && scores.get(c.id);
  const inCompare = compare.includes(c.id);
  const full = !inCompare && compare.length >= MAX_COMPARE;
  // Facts as one definition list; `html` is already escaped.
  const fact = (term, html, sub) => (html ? `<div><dt>${term}</dt><dd>${html}${sub ? ` <small>${esc(sub)}</small>` : ''}</dd></div>` : '');
  const notes = [
    c.requirements && c.status === 'restricted' ? c.requirements : null,
    c.exam.format,
    c.fee.note,
    c.ai_policy ? t('cert.ai', { x: c.ai_policy }) : null,
    ...c.caveats,
  ].filter(Boolean);

  const main = [
    c.domains.length ? `<section class="sect"><h2>${t('cert.domains')}</h2>${weights(c.domains)}${c.domains_note ? `<p class="hint domains-note">${esc(c.domains_note)}</p>` : ''}</section>` : '',
    mine
      ? `<section class="sect"><h2>${t('cert.why')}</h2><div class="for-you">${meter(mine.score, 'lg', t('match.aria', { n: mine.score }))}<ul class="why">${mine.reasons
          .map((r) => `<li>${icon('check')}<span>${esc(lib(r))}</span></li>`)
          .join('')}${mine.warnings.map((w) => `<li class="warn">${icon('triangle-alert')}<span>${esc(lib(w))}</span></li>`).join('')}</ul></div></section>`
      : '',
    notes.length ? `<section class="sect"><h2>${t('cert.good')}</h2><ul class="notes">${notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : '',
  ].join('');
  // The first few resources show; the rest fold away so the column stays near the length of the other one.
  const PREP_SHOWN = 5;
  const prep = c.prep || [];
  const prepHtml = prep.length
    ? `<section class="sect"><h2>${t('cert.prep')}</h2><div class="resources">${prep.slice(0, PREP_SHOWN).map((r) => resource(r)).join('')}</div>${
        prep.length > PREP_SHOWN
          ? `<details class="more more-res"><summary>${t('cert.morePrep', { n: prep.length - PREP_SHOWN })}</summary><div class="resources">${prep.slice(PREP_SHOWN).map((r) => resource(r)).join('')}</div></details>`
          : ''
      }</section>`
    : '';
  const sourcesHtml = `<section class="sect"><h2>${t('cert.sources')}</h2>
      <p class="hint">${esc(t('cert.checked', { d: day(c.checked_on, { weekday: false, year: true }) }))}</p>
      ${c.badge && c.badge.source ? `<p class="hint">${ext(c.badge.source, esc(t('cert.badgeFrom')))}</p>` : ''}
      <details class="more"><summary>${t('cert.nSources', { n: sources.length })}</summary>${sources
        .map((s) => ext(s.url, `${esc(s.title)}${s.note ? `<small>${esc(s.note)}</small>` : ''}`, 'src'))
        .join('')}</details>
      ${reports.length ? `<details class="more"><summary>${t('cert.nReports', { n: reports.length })}</summary>
        <p class="hint">${t('cert.reportsHint')}</p>
        ${reports.map((r) => `<div class="report">${ext(r.url, esc(r.title))} <span class="muted">· ${esc(r.platform)}</span><p>${esc(r.summary)}</p></div>`).join('')}</details>` : ''}
    </section>`;

  $('#cert-body').innerHTML = `
    <a class="back" href="#">${icon('arrow-left')}${t('cert.back')}</a>
    <header class="cert-hero">
      <div class="ch-text">
        <p class="who"><span>${esc(c.provider)} · ${esc(c.code)}</span>${flag(c)}</p>
        <h1>${esc(c.name)}</h1>
        <p class="scope">${esc(c.scope)}</p>
        <div class="cert-actions">
          <a class="btn primary" href="#plan?cert=${esc(c.id)}">${t('cert.plan')}${icon('arrow-right')}</a>
          ${c.practice_questions ? `<a class="btn" href="#practice?cert=${esc(c.id)}">${t('practice.btn')}</a>` : ''}
          <button type="button" class="btn" data-act="compare" data-id="${esc(c.id)}" aria-pressed="${inCompare}" ${full ? `disabled title="${t('compare.full')}"` : ''}>${icon(inCompare ? 'check' : 'plus')}${inCompare ? t('compare.in') : t('compare.btn')}</button>
          <button type="button" class="btn ghost" data-act="share" data-id="${esc(c.id)}">${icon('share-2')}${t('cert.share')}</button>
          ${official ? ext(official.url, `${t('cert.issuer')}${icon('arrow-up-right')}`, 'btn ghost') : ''}
        </div>
      </div>
      <div class="hero-badge">${badge(c, 112)}</div>
    </header>
    <dl class="facts">
      ${fact(t('stat.price'), esc(fee(c)), c.fee.basis)}
      ${fact(t('stat.length'), esc(duration(c)))}
      ${fact(t('stat.questions'), esc(c.exam.questions || ''))}
      ${fact(t('stat.passing'), esc(c.exam.passing || ''))}
      ${fact(t('stat.valid'), esc(c.exam.validity || ''))}
      ${fact(t('stat.level'), lvl(c.level))}
      ${fact(t('stat.format'), esc(LABELS[c.exam.style] || ''))}
      ${fact(t('stat.registration'), esc(LABELS[c.status] || ''))}
    </dl>
    <div class="cert-cols"><div class="col-main">${main}</div><div class="col-side">${prepHtml}${sourcesHtml}</div></div>`;
}

// ---------- compare page ----------
function renderCompare() {
  const certs = compare.map((id) => BY_ID.get(id)).filter(Boolean);
  const body = $('#compare-body');
  if (!certs.length) {
    body.innerHTML = `<p class="empty">${t('compare.empty')}</p>`;
    return;
  }
  const link = `${location.origin}${location.pathname}#compare?ids=${certs.map((c) => c.id).join(',')}`;
  const row = (label, cell) => `<tr><th scope="row">${label}</th>${certs.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`;
  const domains = (c) => (c.domains.length ? `<ul class="cmp-domains">${c.domains.map((d) => `<li><span>${esc(d.name)}</span><b>${d.weight}%</b></li>`).join('')}</ul>` : '—');
  body.innerHTML = `
    <div class="compare-tools">
      <button type="button" class="btn" id="copy-compare">${icon('link')}${t('copyLink')}</button>
      <button type="button" class="btn ghost" id="clear-compare">${t('clear')}</button>
    </div>
    <div class="cmp-wrap">
      <table class="cmp" style="--n:${certs.length}">
        <thead><tr><td></td>${certs
          .map(
            (c) => `<th scope="col"><div class="cmp-head">${badge(c, 40, { label: false })}<a href="#cert?id=${esc(c.id)}">${esc(c.name)}</a><span class="who">${esc(c.provider)} · ${esc(c.code)}</span><button type="button" class="link" data-act="compare" data-id="${esc(c.id)}">${t('compare.removeOne')}</button></div></th>`,
          )
          .join('')}</tr></thead>
        <tbody>
          ${row(t('stat.price'), (c) => `<span class="num">${esc(fee(c))}</span>`)}
          ${row(t('stat.length'), (c) => `<span class="num">${esc(duration(c))}</span>`)}
          ${row(t('stat.questions'), (c) => esc(c.exam.questions || '—'))}
          ${row(t('stat.passing'), (c) => esc(c.exam.passing || '—'))}
          ${row(t('stat.valid'), (c) => esc(c.exam.validity || '—'))}
          ${row(t('stat.level'), (c) => lvl(c.level))}
          ${row(t('stat.format'), (c) => esc(LABELS[c.exam.style]))}
          ${row(t('stat.registration'), (c) => esc(LABELS[c.status]))}
          ${row(t('stat.domains'), domains)}
          ${row(t('stat.ai'), (c) => esc(c.ai_policy || '—'))}
        </tbody>
      </table>
    </div>`;
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

function statusHtml(p) {
  const d = p.deadline;
  if (!d) return `<div class="status info">${icon('info')}${esc(t('plan.statusInfo', { d: day(p.examDate) }))}</div>`;
  if (d.fits) {
    return `<div class="status good">${icon('circle-check')}${esc(t('plan.fits', { d: day(d.targetDate), spare: d.spare }))}</div>`;
  }
  const fixes = [];
  if (d.suggestedMinutes) fixes.push(t('plan.fixLen', { x: len(d.suggestedMinutes) }));
  fixes.push(t('plan.fixDays'));
  fixes.push(t('plan.fixExam', { d: day(p.examDate) }));
  return `<div class="status warn">${icon('triangle-alert')}${esc(t('plan.noFit', { d: day(d.targetDate), needed: d.needed, available: d.available, fixes }))}</div>`;
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
        // Sessions are ink dots, mocks the one accent; the kind is in the tooltip and the list below.
        const state = done.has(s.n) ? ' done' : date < today ? ' missed' : '';
        cells.push(`<span class="d s${s.kind === 'mock' ? ' mock' : ''}${state}${isToday}" data-n="${s.n}" title="${esc(`${day(date)} · ${kindLabel(s.kind)}: ${cap(sname(s))}`)}">${d}</span>`);
      } else if (date === examDay) {
        cells.push(`<span class="d exam${isToday}" title="${esc(`${day(date)} · ${t('plan.examDay')}`)}">${d}</span>`);
      } else {
        cells.push(`<span class="d${isToday}">${d}</span>`);
      }
    }
    out.push(`<div class="month"><h3>${dates().monthNames[m]} <span>${y}</span></h3><div class="mgrid">${cells.join('')}</div></div>`);
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
  const progressKey = `${KEYS.progress}${p.cert.id}:${p.sessions[0].date}`;
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
  const stopClass = (s) => `stop${s.kind === 'mock' ? ' mock' : ''}${stopState(s)}`;
  const stopTag = (s) => (done.has(s.n) ? '' : s.date < today ? `<span class="tag warn">${t('progress.legendMissed')}</span>` : s.date === today ? `<span class="tag">${t('progress.today')}</span>` : '');
  const PRACTICE_KINDS = ['baseline', 'practice', 'mock', 'remediate'];
  const stop = (s) => `<li class="${stopClass(s)}" data-kind="${s.kind}">
      <div class="body">
        <small>${day(s.date)} · ${kindLabel(s.kind)}${stopTag(s)}</small>
        <b>${esc(cap(sname(s)))}</b>
        <span class="len">${len(s.minutes)}</span>
        ${cert.practice_questions && PRACTICE_KINDS.includes(s.kind) ? `<a class="pa-link" href="#practice?cert=${esc(cert.id)}">${t('practice.planLink')}${icon('arrow-right')}</a>` : ''}
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
  const topicRows = p.topics.map((tp) => ({ label: lib(tp), value: Math.round(((byTopic.get(tp) || 0) / 60) * 10) / 10 })).filter((r) => r.value > 0);
  const weekRows = [...weeks].map(([w, items], i) => ({
    label: t('plan.wk', { n: i + 1 }),
    value: Math.round((items.reduce((sum, s) => sum + s.minutes, 0) / 60) * 10) / 10,
    title: t('plan.weekTitle', { n: i + 1, r: weekRange(w), h: Math.round((items.reduce((sum, s) => sum + s.minutes, 0) / 60) * 10) / 10 }),
    mark: items.some((s) => s.kind === 'mock'),
  }));
  const sum = (term, value) => `<div><dt>${term}</dt><dd>${value}</dd></div>`;
  const progressMeter = () => meter(pct(), 'pct', t('plan.pctDone', { p: pct() }));

  out.innerHTML = `
    <dl class="summary plan-summary">
      ${sum(t('plan.sessions'), p.sessions.length)}
      ${sum(t('plan.studyTime'), `${p.hours} h`)}
      ${sum(t('plan.fromTo'), `${day(p.sessions[0].date, { weekday: false })} – ${day(p.sessions.at(-1).date, { weekday: false })}`)}
      ${sum(p.deadline ? t('plan.examDay') : t('plan.earliest'), day(examDay))}
      <div id="progress"><dt>${cap(t('plan.done'))}</dt><dd><span id="progress-n">${t('plan.of', { a: done.size, b: p.sessions.length })}</span>${progressMeter()}</dd></div>
    </dl>
    ${statusHtml(p)}
    <div class="plan-actions">
      <button type="button" class="btn primary" id="dl-ics">${icon('calendar-plus')}${t('plan.calendar')}</button>
      <button type="button" class="btn" id="track-plan" aria-pressed="${tracked}">${icon('check')}<span>${tracked ? t('plan.tracking') : t('plan.track')}</span></button>
      <button type="button" class="btn ghost" id="dl-md">${icon('download')}Markdown</button>
      <button type="button" class="btn ghost" id="copy-plan">${icon('link')}${t('copyLink')}</button>
      <button type="button" class="btn ghost" id="print-plan">${icon('printer')}${t('plan.print')}</button>
    </div>
    ${p.inferredTopics ? `<p class="note">${esc(t('plan.inferred'))}</p>` : ''}
    <section class="plan-cal">
      <div class="months">${monthsHtml(p, done)}</div>
      <ul class="kinds"><li><span class="k"></span>${t('plan.sessions')}</li>${mockSession ? `<li><span class="k mock"></span>${kindLabel('mock')}</li>` : ''}<li><span class="k exam"></span>${t('plan.examDay')}</li></ul>
    </section>
    <div class="plan-charts">
      <section class="sect"><h2>${t('plan.byTopic')}</h2>${hbars(topicRows)}</section>
      <section class="sect"><h2>${t('plan.perWeek')}</h2>${columns(weekRows, 'h', t('plan.perWeekAria'))}${mockSession ? `<p class="hint">${t('plan.mockWeeks')}</p>` : ''}</section>
    </div>
    ${[...weeks]
      .map(([w, items], i) => `<section class="week-block"><h3 class="week">${t('plan.week', { n: i + 1 })} <small>${weekRange(w)}</small></h3><ol class="trail">${items.map(stop).join('')}</ol></section>`)
      .join('')}
    <div class="plan-extra">
      <section class="sect"><h2>${t('plan.what')}</h2>
        <dl class="keydl">${kinds.map((k) => `<div><dt>${kindLabel(k)}</dt><dd>${esc(k === 'mock' ? kindDetail('mock', mockSession.detail, mockSession.minutes) : kindDetail(k, KIND_DETAIL[k]))}</dd></div>`).join('')}</dl>
      </section>
      ${cert.prep && cert.prep.length ? `<section class="sect"><h2>${t('plan.resources')}</h2><div class="resources">${cert.prep.map((r) => resource(r, false)).join('')}</div></section>` : ''}
    </div>`;

  $$('#plan-output .check input').forEach((box) =>
    box.addEventListener('change', () => {
      const n = Number(box.dataset.n);
      if (box.checked) done.add(n);
      else done.delete(n);
      store.set(progressKey, [...done]);
      const session = p.sessions.find((x) => x.n === n);
      const li = box.closest('.stop');
      li.className = stopClass(session);
      $('.tag', li)?.remove();
      $('small', li).insertAdjacentHTML('beforeend', stopTag(session));
      const cell = $(`#plan-output .mgrid [data-n="${n}"]`);
      if (cell) {
        cell.classList.toggle('done', box.checked);
        cell.classList.toggle('missed', !box.checked && session.date < today);
      }
      $('#progress .meter').outerHTML = progressMeter();
      $('#progress-n').textContent = t('plan.of', { a: done.size, b: p.sessions.length });
      if (box.checked && !isTracked(progressKey)) setTracked(progressKey, trackParams(), true);
      const kind = p.sessions.find((s) => s.n === n)?.kind;
      if (box.checked && (done.size === p.sessions.length || kind === 'final' || kind === 'mock')) celebrate(done.size === p.sessions.length ? 220 : 90);
    }),
  );
  $('#dl-ics').addEventListener('click', () => download(`${p.cert.id}-plan.ics`, toICS(localPlan(p)), 'text/calendar'));
  $('#dl-md').addEventListener('click', () => download(`${p.cert.id}-plan.md`, toMarkdown(localPlan(p), { resources: cert.prep || [], text: markdownText() }), 'text/markdown'));
  $('#track-plan').addEventListener('click', () => setTracked(progressKey, trackParams(), !isTracked(progressKey)));
  $('#print-plan').addEventListener('click', () => window.print());
  $('#copy-plan').addEventListener('click', (e) => copy(`${location.origin}${location.pathname}#plan?${new URLSearchParams(planParams())}`, e.currentTarget));
}

function celebrate(count) {
  if (reducedMotion()) return;
  // Paper confetti: the accent and the inks of the current theme.
  const css = getComputedStyle(document.documentElement);
  const colors = ['--accent', '--text', '--muted', '--line-strong'].map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
  confetti({ particleCount: count, spread: 75, startVelocity: 38, origin: { y: 0.75 }, colors, disableForReducedMotion: true });
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
    if (btn.dataset.act === 'share') share(btn.dataset.id);
    if (btn.dataset.act === 'untrack') {
      setTracked(btn.dataset.key, null, false);
      renderProgress();
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
  $('#q').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    showResults();
  });
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

  window.addEventListener('hashchange', route);
}

// ---------- practice ----------
const PRACTICE = new Map();
let practiceTimer = null;
let practiceState = null;
const practiceKeys = (id) => ({ run: `${KEYS.practice}run:${id}`, history: `${KEYS.practice}${id}`, review: `${KEYS.practice}review:${id}` });
const REVIEW_SIZE = 20;
const stopPracticeTimer = () => {
  clearInterval(practiceTimer);
  practiceTimer = null;
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
const examSize = (c) => parseInt(c.exam.questions, 10);
const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const domainBars = (per) =>
  `<ul class="pa-domains">${per
    .map(
      (d) => `<li><span>${esc(d.name)} <small>${d.weight}%</small></span><span class="hb-track" aria-hidden="true"><i style="width:${d.pct ?? 0}%"></i></span><b>${d.pct === null ? '—' : `${d.pct}%`}</b><small>${d.ok}/${d.n}</small></li>`,
    )
    .join('')}</ul>`;

async function renderPractice(id, params) {
  stopPracticeTimer();
  const body = $('#practice-body');
  const c = BY_ID.get(id);
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
  const ctx = { id, c, set, keys, history, review, tab: params.get('tab') || 'start', attempt: params.get('attempt') };
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
    <div class="page-head"><h1>${t('practice.title')} <span class="h1-code">${esc(ctx.c.code)}</span></h1></div>
    <p class="hint pa-intro">${esc(t('practice.intro', { n: ctx.set.questions.length }))}</p>
    <div class="pa-tabs">${tab('start', t('practice.tabStart'))}${tab('review', `${t('practice.tabReview')}${due ? ` <b class="pa-n">${due}</b>` : ''}`)}${tab('bank', t('practice.tabBank'))}${tab('mistakes', t('practice.tabMistakes'))}</div>`;
}

function practiceHome(ctx, run) {
  if (ctx.tab === 'bank') return practiceBank(ctx);
  if (ctx.tab === 'mistakes') return practiceMistakes(ctx);
  if (ctx.tab === 'review') return practiceReviewTab(ctx);
  const { c, set, id } = ctx;
  const pool = set.questions.length;
  const full = examSize(c);
  const sizes = pool >= full ? [[10, '10'], [full, t('practice.sizeFull', { n: full })]] : [[10, '10'], [pool, t('practice.sizeAll', { n: pool })]];
  const hist = ctx.history();
  const when = (ms) => new Date(ms).toLocaleDateString(getLang());
  const past = [...hist.attempts].reverse().slice(0, 10);
  const due = dueCount(ctx);
  $('#practice-body').innerHTML = `${practiceHead(ctx, 'start')}
    ${run ? `<div class="status pa-resume">${icon('info')}<span>${esc(t('practice.resume', { a: Object.keys(run.answers).length, b: run.ids.length }))}</span>
      <a class="btn primary" href="#practice?cert=${esc(id)}&run=1">${t('practice.continue')}</a><button type="button" class="btn" id="pa-discard">${t('practice.discard')}</button></div>` : ''}
    ${due ? `<div class="status pa-resume">${icon('refresh-cw')}<span>${esc(t('practice.reviewDue', { n: due }))}</span><a class="btn primary" href="#practice?cert=${esc(id)}&review=due">${t('practice.reviewStart')}</a></div>` : ''}
    <section class="sect pa-start">
      <h2>${t('practice.tabStart')}</h2>
      <div class="pa-setup">
        <div class="segmented" role="radiogroup" aria-label="${esc(t('practice.size'))}">${sizes.map(([n, label], i) => `<label><input type="radio" name="pa-size" value="${n}" ${i === sizes.length - 1 ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div>
        <label class="pa-check"><input type="checkbox" id="pa-timed" checked> <span id="pa-timed-label"></span></label>
        <button type="button" class="btn primary" id="pa-start" ${run ? 'disabled' : ''}>${t('practice.start')}${icon('arrow-right')}</button>
      </div>
      ${pool < full ? `<p class="hint">${esc(t('practice.shortBank', { need: full, n: pool }))}</p>` : ''}
    </section>
    ${hist.attempts.length
      ? `<div class="progress-cols">
          <section class="sect"><h2>${t('practice.overall')}</h2>${domainBars(totals(hist, c.domains))}<p class="hint">${esc(t('practice.notScore'))}</p></section>
          <section class="sect"><h2>${t('practice.history')}</h2><ul class="pa-history">${past
            .map((a) => `<li><span>${esc(when(a.when))}</span><b>${a.pct === null ? '—' : `${a.pct}%`}</b><small>${a.ok}/${a.n}</small><a href="#practice?cert=${esc(id)}&attempt=${esc(a.id)}">${t('practice.open')}</a></li>`)
            .join('')}</ul></section>
        </div>`
      : `<p class="hint">${esc(t('practice.noHistory'))}</p>`}`;
  const size = () => Number($('input[name="pa-size"]:checked').value);
  const label = () => ($('#pa-timed-label').textContent = t('practice.timed', { min: minutesFor({ minutes: c.exam.minutes, questions: full }, Math.min(size(), pool)) }));
  label();
  $$('input[name="pa-size"]').forEach((r) => r.addEventListener('change', label));
  $('#pa-discard')?.addEventListener('click', () => {
    store.set(ctx.keys.run, null);
    practiceHome(ctx, null);
  });
  $('#pa-start').addEventListener('click', () => {
    const count = Math.min(size(), pool);
    const timed = $('#pa-timed').checked;
    const minutes = minutesFor({ minutes: c.exam.minutes, questions: full }, count);
    const ids = buildRun({ questions: set.questions, domains: c.domains, size: count, seen: new Set(Object.keys(hist.questions)) });
    const now = Date.now();
    store.set(ctx.keys.run, { ids, answers: {}, marked: [], cur: 0, timed, minutes, end: now + minutes * 60000, paused: null });
    location.hash = `#practice?cert=${id}&run=1`;
  });
}

function practiceExam(ctx, run) {
  const byId = new Map(ctx.set.questions.map((q) => [q.id, q]));
  const save = () => store.set(ctx.keys.run, run);
  const left = () => run.ids.length - run.ids.filter((x) => run.answers[x]?.length).length;
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
  const paint = () => {
    const q = byId.get(run.ids[run.cur]);
    const picked = run.answers[q.id] || [];
    const multi = q.correct.length > 1;
    const grid = run.ids
      .map((x, i) => `<button type="button" data-go="${i}" class="${run.answers[x]?.length ? 'ans' : ''}${run.marked.includes(x) ? ' mk' : ''}" ${i === run.cur ? 'aria-current="true"' : ''}>${i + 1}</button>`)
      .join('');
    $('#practice-body').innerHTML = `
      <div class="pa-bar">
        ${run.timed ? `<b id="pa-clock" class="pa-clock" role="timer">${run.paused ? clock(run.end - run.paused) : clock(run.end - Date.now())}</b><button type="button" class="btn" id="pa-pause">${icon(run.paused ? 'play' : 'pause')}${t(run.paused ? 'practice.play' : 'practice.pause')}</button>` : ''}
        <span class="pa-spacer"></span>
        <button type="button" class="btn" id="pa-finish">${icon('flag')}${t('practice.finish')}</button>
      </div>
      ${asking ? `<div class="status warn pa-resume">${icon('triangle-alert')}<span>${esc(t('practice.finishSure'))}${left() ? ` ${esc(t('practice.finishLeft', { n: left() }))}` : ''}</span><button type="button" class="btn primary" id="pa-yes">${t('practice.finishYes')}</button><button type="button" class="btn" id="pa-no">${t('practice.finishNo')}</button></div>` : ''}
      ${run.paused
        ? `<div class="pa-paused"><p>${esc(t('practice.paused'))}</p></div>`
        : `<section class="pa-q">
            <small class="pa-meta">${esc(t('practice.q', { a: run.cur + 1, b: run.ids.length }))} · ${esc(q.domain)}</small>
            <h2 class="pa-prompt">${esc(pText(q.prompt))}</h2>
            ${multi ? `<p class="pa-pick">${esc(t('practice.selectN', { n: q.correct.length }))}</p>` : ''}
            <div class="pa-options">${q.options
              .map((o) => `<button type="button" class="pa-opt${multi ? ' multi' : ''}" data-key="${esc(o.key)}" aria-pressed="${picked.includes(o.key)}"><span class="k">${esc(o.key)}</span><span>${esc(pText(o.text))}</span></button>`)
              .join('')}</div>
            <div class="pa-nav">
              <button type="button" class="btn" id="pa-prev" ${run.cur === 0 ? 'disabled' : ''}>${icon('arrow-left')}${t('practice.prev')}</button>
              <button type="button" class="btn" id="pa-mark" aria-pressed="${run.marked.includes(q.id)}">${icon('flag')}${t(run.marked.includes(q.id) ? 'practice.marked' : 'practice.mark')}</button>
              <button type="button" class="btn primary" id="pa-next" ${run.cur === run.ids.length - 1 ? 'disabled' : ''}>${t('practice.next')}${icon('arrow-right')}</button>
            </div>
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
    on('#pa-yes', () => {
      if (run.paused) {
        run.end += Date.now() - run.paused;
        run.paused = null;
      }
      stopPracticeTimer();
      finishPractice(ctx, run);
    });
    const go = (i) => {
      run.cur = i;
      save();
      paint();
      window.scrollTo(0, 0);
    };
    on('#pa-prev', () => go(run.cur - 1));
    on('#pa-next', () => go(run.cur + 1));
    on('#pa-mark', () => {
      run.marked = run.marked.includes(q.id) ? run.marked.filter((x) => x !== q.id) : [...run.marked, q.id];
      save();
      paint();
    });
    $$('#practice-body [data-go]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));
    $$('#practice-body .pa-opt').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.key;
        const now = run.answers[q.id] || [];
        if (multi) run.answers[q.id] = now.includes(k) ? now.filter((x) => x !== k) : [...now, k];
        else run.answers[q.id] = now[0] === k ? [] : [k];
        save();
        paint();
      }),
    );
  };
  paint();
  // The interval exists before the first tick, so an expired run cannot leave one running.
  if (run.timed) {
    stopPracticeTimer();
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
  // Read the schedule before the history changes: with no schedule saved yet, it starts from the old history.
  const review = ctx.review();
  store.set(keys.history, record(ctx.history(), result, answers, when));
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
  `<details class="pa-review"><summary><small class="pa-meta">${esc(q.domain)}${state ? ` · ${state}` : ''}</small><b>${esc(pText(q.prompt))}</b></summary><div class="pa-options">${shownOptions(q, answer || [])}</div><p class="pa-why">${esc(pText(q.explanation))}</p></details>`;

function practiceResult(ctx) {
  const { id, set } = ctx;
  const a = ctx.history().attempts.find((x) => x.id === ctx.attempt);
  if (!a) {
    location.hash = `#practice?cert=${id}`;
    return;
  }
  const missed = new Set(a.wrong);
  const answered = set.questions.filter((q) => a.answers[q.id]);
  const due = dueCount(ctx);
  const paint = (onlyWrong) => {
    const list = onlyWrong ? answered.filter((q) => missed.has(q.id)) : answered;
    $('#practice-body').innerHTML = `<a class="back" href="#practice?cert=${esc(id)}">${icon('arrow-left')}${t('practice.back')}</a>
      <div class="page-head"><h1>${t('practice.result')}</h1></div>
      <section class="pa-score">
        <b class="pa-big">${a.pct}<small>%</small></b>
        <div><p>${esc(t('practice.resultOf', { ok: a.ok, n: a.n }))}</p>
        ${a.total > a.n ? `<p class="hint">${esc(t('practice.resultLeft', { n: a.total - a.n }))}</p>` : ''}
        <p class="hint">${esc(t('practice.weighted', { p: a.weighted }))}</p><p class="hint">${esc(t('practice.notScore'))}</p></div>
        <a class="btn primary" href="#practice?cert=${esc(id)}">${t('practice.again')}${icon('arrow-right')}</a>
        ${due ? `<a class="btn" href="#practice?cert=${esc(id)}&review=due">${icon('refresh-cw')}${t('practice.tabReview')} · ${due}</a>` : ''}
      </section>
      <section class="sect"><h2>${t('practice.byDomain')}</h2>${domainBars(a.per)}</section>
      <div class="pa-reviewhead"><h2>${t('practice.review')}</h2><div class="segmented"><label><input type="radio" name="pa-rev" value="all" ${onlyWrong ? '' : 'checked'}><span>${t('practice.reviewAll')}</span></label><label><input type="radio" name="pa-rev" value="wrong" ${onlyWrong ? 'checked' : ''}><span>${t('practice.reviewWrong')} (${missed.size})</span></label></div></div>
      ${list.map((q) => reviewCard(q, a.answers[q.id], missed.has(q.id) ? `<span class="tag warn">${t('practice.filterWrong')}</span>` : '')).join('')}`;
    $$('input[name="pa-rev"]').forEach((r) => r.addEventListener('change', () => paint(r.value === 'wrong' && r.checked)));
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
    <section class="sect">
      <h2>${t('practice.tabReview')}</h2>
      <p>${esc(status)}</p>
      ${due.length ? `<div class="pa-setup">${go('due', 'primary', t('practice.reviewStart'))}</div>` : later.length ? `<div class="pa-setup">${go('early', '', t('practice.reviewEarly'))}</div>` : ''}
      <p class="hint pa-how">${esc(t('practice.reviewHow', { days: INTERVALS.join(', ') }))}</p>
    </section>
    ${due.length || later.length ? `<section class="sect"><h2>${t('practice.reviewList')}</h2><ul class="pa-history">${[...due, ...later].map(row).join('')}</ul></section>` : ''}`;
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
    <div class="page-head"><h1>${t('practice.tabReview')} <span class="h1-code">${esc(ctx.c.code)}</span></h1></div>`;
  const paint = () => {
    if (cur >= ids.length) {
      const left = dueCount(ctx);
      $('#practice-body').innerHTML = `${head}
        <section class="pa-score">
          <b class="pa-big">${ok}<small>/${ids.length}</small></b>
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
      <section class="pa-q">
        <small class="pa-meta">${esc(t('practice.q', { a: cur + 1, b: ids.length }))} · ${esc(q.domain)}</small>
        <h2 class="pa-prompt">${esc(pText(q.prompt))}</h2>
        ${multi && !verdict ? `<p class="pa-pick">${esc(t('practice.selectN', { n: q.correct.length }))}</p>` : ''}
        <div class="pa-options">${options}</div>
        ${verdict ? `<div class="status ${verdict.right ? 'good' : 'warn'} pa-verdict" role="status">${icon(verdict.right ? 'circle-check' : 'triangle-alert')}<span>${esc(verdict.text)}</span></div><p class="pa-why">${esc(pText(q.explanation))}</p>` : ''}
        <div class="pa-nav pa-nav-end">${
          verdict
            ? `<button type="button" class="btn primary" id="pa-next">${cur === ids.length - 1 ? t('practice.finish') : t('practice.next')}${icon('arrow-right')}</button>`
            : `<button type="button" class="btn primary" id="pa-check" ${picked.length ? '' : 'disabled'}>${icon('check')}${t('practice.check')}</button>`
        }</div>
      </section>`;
    $$('#practice-body .pa-opt[data-key]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.key;
        if (multi) picked = picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k];
        else picked = picked[0] === k ? [] : [k];
        paint();
      }),
    );
    $('#pa-check')?.addEventListener('click', () => {
      const now = Date.now();
      const right = isCorrect(q, picked);
      const before = ctx.review();
      const after = answerReview(before, q.id, right, now);
      store.set(keys.review, after);
      if (right) ok += 1;
      verdict = {
        right,
        text: !right ? t('practice.reviewMissed') : after === before ? t('practice.reviewRightEarly') : t('practice.reviewRight', { n: daysUntil(after.cards[q.id].due, now) }),
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
    .map((c) => ({ c, attempts: store.get(practiceKeys(c.id).history, emptyHistory()).attempts }))
    .filter((x) => x.attempts.length);
  if (!rows.length) return '';
  return `<section class="sect"><h2>${t('practice.progress')}</h2><ul class="pa-history">${rows
    .map(({ c, attempts }) => `<li><span>${esc(c.code)}</span><small>${esc(t('practice.progressRow', { a: attempts.length, p: attempts.at(-1).pct }))}</small><a href="#practice?cert=${esc(c.id)}">${t('practice.open')}</a></li>`)
    .join('')}</ul></section>`;
}

// ---------- tracked plans and progress ----------
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

function planFrom(params) {
  const cert = BY_ID.get(params.cert);
  if (!cert) return null;
  try {
    return buildPlan({
      cert,
      hours: Number(params.hours),
      start: params.start,
      days: params.days.split(',').filter(Boolean).map(Number),
      sessionMinutes: Number(params.len) || 90,
      startTime: params.time || '19:00',
      confidence: store.get(confidenceKey(cert.id), {}),
      targetDate: params.exam || null,
    });
  } catch {
    return null;
  }
}

/** Sessions in date order: done, missed (past and not ticked) or planned. */
function progressData() {
  const today = todayLocal();
  const plans = Object.entries(trackedPlans())
    .map(([key, params]) => ({ key, params, plan: planFrom(params) }))
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
    body.innerHTML = `<div class="empty-card"><p>${esc(t('progress.empty'))}</p><a class="btn primary" href="#plan">${t('progress.start')}${icon('arrow-right')}</a></div>${practiceProgress()}`;
    return;
  }
  const done = sessions.filter((s) => s.done);
  const hours = Math.round((done.reduce((m, s) => m + s.minutes, 0) / 60) * 10) / 10;
  const missed = sessions.filter((s) => s.past && !s.done).length;
  const upcoming = sessions.filter((s) => !s.done && !s.past).slice(0, 6);
  const sum = (term, value, sub = '') => `<div><dt>${term}</dt><dd>${value}${sub ? `<small>${esc(sub)}</small>` : ''}</dd></div>`;

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

  const next = (s) => `<li class="up${s.today ? ' today' : ''}">
      ${badge(BY_ID.get(s.plan.params.cert), 28, { label: false })}
      <div><small>${day(s.date)}${s.today ? ` · <span class="tag">${t('progress.today')}</span>` : ''} · ${len(s.minutes)} · ${esc(s.plan.plan.cert.code)}</small><b>${esc(kindLabel(s.kind))}: ${esc(cap(sname(s)))}</b></div>
      <a class="btn ghost icon-btn" href="#plan?${esc(new URLSearchParams(s.plan.params).toString())}" aria-label="${esc(t('progress.open'))}">${icon('arrow-right')}</a>
    </li>`;

  const planCard = (x) => {
    const c = BY_ID.get(x.params.cert);
    const total = x.plan.sessions.length;
    const pct = Math.round((x.done.size / total) * 100);
    const nextOne = x.plan.sessions.find((s) => !x.done.has(s.n) && s.date >= today) || x.plan.sessions.find((s) => !x.done.has(s.n));
    const examDay = x.plan.deadline ? x.plan.deadline.targetDate : x.plan.examDate;
    return `<article class="plan-card">
      ${badge(c, 40, { label: false })}
      <div class="pc-main">
        <h3><a href="#cert?id=${esc(c.id)}">${esc(c.name)}</a></h3>
        <p class="who">${esc(c.provider)} · ${esc(c.code)} · ${esc(t('progress.examOn', { d: day(examDay) }))}</p>
        ${nextOne ? `<p class="meta">${esc(t('progress.nextOne', { x: `${day(nextOne.date)} · ${kindLabel(nextOne.kind)}: ${cap(sname(nextOne))}` }))}</p>` : ''}
      </div>
      <div class="pc-progress"><span>${t('plan.of', { a: x.done.size, b: total })} ${t('plan.done')}</span>${meter(pct, 'pct', t('plan.pctDone', { p: pct }))}</div>
      <div class="plan-card-actions"><a class="btn" href="#plan?${esc(new URLSearchParams(x.params).toString())}">${t('progress.open')}</a><button type="button" class="link" data-act="untrack" data-key="${esc(x.key)}">${t('progress.stop')}</button></div>
    </article>`;
  };

  body.innerHTML = `
    <dl class="summary progress-summary">
      ${sum(t('progress.streak'), streak, t('progress.streakUnit', { n: streak }))}
      ${sum(t('progress.hours'), `${hours} h`)}
      ${sum(t('progress.sessions'), t('plan.of', { a: done.length, b: sessions.length }))}
      ${sum(t('progress.plans'), plans.length)}
    </dl>
    ${missed ? `<div class="status warn">${icon('triangle-alert')}${esc(t('progress.behind', { n: missed }))}</div>` : ''}
    <div class="progress-cols">
      <section class="sect"><h2>${t('progress.next')}</h2>${upcoming.length ? `<ol class="up-list">${upcoming.map(next).join('')}</ol>` : `<p class="hint">${t('progress.nothingNext')}</p>`}</section>
      <section class="sect"><h2>${t('progress.weeks')}</h2><div class="mgrid strip">${cells.join('')}</div>
        <ul class="strip-key"><li><span class="d done"></span>${t('progress.legendDone')}</li><li><span class="d missed"></span>${t('progress.legendMissed')}</li><li><span class="d planned"></span>${t('progress.legendPlanned')}</li><li><span class="d today"></span>${t('progress.today')}</li></ul>
      </section>
    </div>
    <section class="sect"><h2>${t('progress.plans')}</h2><div class="plan-cards">${plans.map(planCard).join('')}</div></section>
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
/** Every certification as a badge, split over two rows that drift slowly in opposite directions.
 *  The badges rest in grey and take their colour on hover. Each row holds its set twice so the
 *  -50% shift loops without a seam. */
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
    const set = row.map((c) => `<a href="#cert?id=${esc(c.id)}" title="${esc(c.name)}" tabindex="-1">${badge(c, 56, { label: false })}</a>`).join('');
    $(`#mq-${r + 1}`).innerHTML = `<div class="mq-track" style="--dur:${(row.length * (r ? 8.3 : 7.2)).toFixed(1)}s"><div class="mq-set">${set}</div><div class="mq-set mq-copy">${set}</div></div>`;
  });
}

function setMotionPaused(paused) {
  $('#marquee').classList.toggle('paused', paused);
  const button = $('#mq-toggle');
  button.setAttribute('aria-pressed', String(paused));
  $('use', button).setAttribute('href', paused ? '#i-play' : '#i-pause');
}

// "Describe what you want" (describe.js) hands what it understood to the "For me" form, where every
// choice can be changed. The budget becomes the price filter; the experience only if the text gave one.
function refineFromIntent(intent) {
  const p = intent.profile;
  profile = { ...profile, roles: p.roles, known: p.known, want: p.want, experience: intent.levelStated ? p.experience : profile.experience };
  store.set(KEYS.profile, profile);
  fillProfile();
  if (p.roles.length || p.known.length) $('#profile-more').open = true;
  const price = $('#filters').price;
  if (p.budget != null) {
    if (![...price.options].some((o) => o.value === String(p.budget))) {
      const after = [...price.options].find((o) => o.value !== '' && Number(o.value) > p.budget);
      price.insertBefore(new Option(t('price.upto', { n: p.budget }), String(p.budget)), after || null);
    }
    price.value = String(p.budget);
  }
  setProfileOpen(true);
  renderList();
  $('#for-me').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

function showResults() {
  const head = $('#list-head');
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  head.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}

// ---------- language ----------
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
  $('#hero-stats').innerHTML = [heroStat(all.length, t('hero.certs')), heroStat(providers, t('hero.providers')), heroStat(withPrep, t('hero.prep')), free ? heroStat(free, t('hero.free')) : ''].join('');
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
  renderSiteText();
  fillProfile();
  fillFilters();
  renderCats();
  labelDays();
  setRatedLabel(Object.keys(readConfidence()).length);
  setThemeButton();
  describe?.localize();
}

async function init() {
  applyStatic();
  try {
    const res = await fetch('catalog.json', { cache: 'no-cache' });
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

  fuse = new Fuse(
    all.map((c) => ({ id: c.id, name: c.name, code: c.code, provider: c.provider, category: `${c.category} ${t(`cat.${c.category}`)}`, skills: DATA.taxonomy.skills.filter((s) => c.skills.includes(s.id)).map((s) => `${s.label} ${label('skills', s)}`).join(' '), scope: c.scope })),
    {
      keys: [{ name: 'name', weight: 3 }, { name: 'code', weight: 3 }, { name: 'provider', weight: 2 }, { name: 'skills', weight: 1.5 }, 'category', 'scope'],
      threshold: 0.25,
      ignoreLocation: true,
    },
  );
  renderMarquee();
  setMotionPaused(store.get(KEYS.motion, false) === 'paused');

  renderSiteText();
  fillProfile();
  fillFilters();
  renderCats();
  setThemeButton();
  fillPlanForm();
  bind();
  describe = mountDescribe({ data: DATA, helpers: { icon, meter, lvl, fee, flag }, onRefine: refineFromIntent });
  $('#loading').remove();
  route();
  registerWorker();
}

function registerWorker() {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!('serviceWorker' in navigator) || (location.protocol !== 'https:' && !local)) return;
  navigator.serviceWorker.register('sw.js').catch(() => {
    /* offline support is optional */
  });
}

init();
