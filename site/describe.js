// "Describe what you want": one text box on the home view. lib/intent.js reads the text, lib/match.js
// scores the catalog the way "For me" does, and this module shows what was understood (chips that can
// be removed) and a few picks with the reasons behind them. It all runs here: the text never leaves.
//
// app.js mounts it with the catalog, a few of its rendering helpers (so picks look like the rest of the
// app) and a callback that opens the "For me" form prefilled.

import { parseIntent, recommend, signalKey, withoutSignal } from './lib/intent.js';
import { rank } from './lib/match.js';
import { estimateHours } from './lib/planner.js';
import { t, label, lib } from './i18n.js';
import { badge, providerColor } from './visuals.js';

const KEY = 'pathfinder:describe';
const VERSION = 1;
const LIMIT = 4;
const WAIT = 350; // ms after the last keystroke
const EXAMPLES = ['describe.ex1', 'describe.ex2', 'describe.ex3'];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Saved text is a convenience: storage can be missing or blocked and the box still works.
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && saved.v === VERSION && typeof saved.text === 'string') return { text: saved.text, removed: Array.isArray(saved.removed) ? saved.removed : [] };
  } catch {
    /* nothing saved */
  }
  return { text: '', removed: [] };
}

function save(text, removed) {
  try {
    if (text.trim()) localStorage.setItem(KEY, JSON.stringify({ v: VERSION, text, removed: [...removed] }));
    else localStorage.removeItem(KEY);
  } catch {
    /* not saved this visit */
  }
}

export function mountDescribe({ data, helpers, onRefine }) {
  const { icon, ring, lvl, fee, flag } = helpers;
  const $ = (sel) => document.querySelector(sel);
  const form = $('#describe-form');
  const box = $('#describe-text');
  const out = $('#describe-out');
  const examples = $('#describe-examples');
  const status = $('#describe-status');
  if (!form || !box || !out) return { localize() {} };

  const certs = data.certifications;
  const tx = data.taxonomy;
  const saved = load();
  let removed = new Set(saved.removed);
  let current = null;
  let timer = null;
  box.value = saved.text;

  const labels = () => {
    const map = {};
    for (const group of ['levels', 'statuses', 'styles', 'roles', 'skills']) for (const x of tx[group]) map[x.id] = label(group, x);
    for (const c of certs) map[c.category] = area(c.category);
    return map;
  };
  const area = (cat) => {
    const key = `cat.${cat}`;
    const name = t(key);
    return name === key ? cat : name;
  };
  const byId = (group, id) => tx[group].find((x) => x.id === id);
  const named = (group, id) => (byId(group, id) ? label(group, byId(group, id)) : id);

  function chipValue(s) {
    switch (s.type) {
      case 'want':
      case 'known':
      case 'avoid-skill':
        return named('skills', s.value);
      case 'role':
        return named('roles', s.value);
      case 'area':
      case 'avoid-area':
        return area(s.value);
      case 'cert':
      case 'has':
      case 'avoid-cert':
        return s.label || s.value;
      case 'level':
        return t(`exp.${s.value}`);
      case 'budget':
        if (s.value == null) return t('price.any');
        if (s.value === 0) return t('price.free');
        return s.soft ? t('describe.cheap', { n: s.value }) : t('price.upto', { n: s.value });
      case 'hours':
        return t('describe.hoursValue', { n: s.value });
      case 'weeks':
        return t('describe.weeksValue', { n: s.value });
      case 'style':
        return named('styles', s.value);
      case 'practice':
        return t('describe.practiceValue');
      default:
        return String(s.value);
    }
  }

  // One chip per phrase where the pieces belong together: "AWS" is a skill and an issuer, "cloud
  // security" a skill and two areas. A chip removes every signal it stands for.
  function chips(signals) {
    const host = signals.map((s, i) => {
      const avoid = s.type.startsWith('avoid-');
      const same = (pred) => signals.findIndex((x) => x.words === s.words && x.type.startsWith('avoid-') === avoid && pred(x));
      let h = -1;
      if (s.type === 'area' || s.type === 'avoid-area') h = same((x) => x.type !== 'area' && x.type !== 'avoid-area');
      if (s.type === 'want') h = same((x) => x.type === 'provider');
      if (s.type === 'avoid-provider') h = same((x) => x.type === 'avoid-skill');
      return h >= 0 ? h : i;
    });
    const root = (i) => (host[i] === i ? i : root(host[i]));
    return signals
      .map((s, i) => {
        if (root(i) !== i) return '';
        const parts = signals.filter((x, j) => root(j) === i);
        const kind = t(`describe.kind.${s.type.startsWith('avoid-') ? 'avoid' : s.type}`);
        const value = chipValue(s);
        const also = parts.slice(1).map(chipValue).filter((v) => v !== value);
        const title = t('describe.from', { x: s.words }) + (also.length ? `: ${also.join(', ')}` : '');
        return `<li class="d-chip" data-type="${esc(s.type)}" title="${esc(title)}"><span><small>${esc(kind)}</small> <b>${esc(value)}</b></span><button type="button" class="d-x" data-key="${esc(parts.map(signalKey).join('|'))}" aria-label="${esc(t('describe.remove', { x: `${kind} ${value}` }))}">${icon('x')}</button></li>`;
      })
      .join('');
  }

  function pick(p) {
    const c = p.cert;
    const why = [
      ...p.reasons.slice(0, 3).map((r) => `<li>${icon('circle-check')}<span>${esc(lib(r))}</span></li>`),
      ...p.notes.slice(0, 1).map((n) => `<li class="note">${icon('clock')}<span>${esc(lib(n))}</span></li>`),
      ...p.warnings
        .filter((w) => w.length <= 120)
        .slice(0, 1)
        .map((w) => `<li class="warn">${icon('triangle-alert')}<span>${esc(lib(w))}</span></li>`),
    ].join('');
    const id = esc(c.id);
    return `<li class="d-pick" style="--pc:${providerColor(c.provider)}">
      <a class="d-badge" href="#cert?id=${id}" tabindex="-1" aria-hidden="true">${badge(c, 52, { label: false })}</a>
      <div class="d-main">
        <h3><a href="#cert?id=${id}">${esc(c.name)}</a></h3>
        <p class="d-who"><span>${esc(c.provider)} · ${esc(c.code)}</span><span>${esc(fee(c))}</span>${lvl(c.level)}${flag(c)}</p>
        <ul class="why d-why">${why}</ul>
        <p class="d-links">
          <a href="#cert?id=${id}">${icon('info')}${t('describe.details')}</a>
          <a href="#plan?cert=${id}">${icon('route')}${t('describe.plan')}</a>
          ${c.practice_questions ? `<a href="#practice?cert=${id}">${icon('dumbbell')}${t('practice.btn')}</a>` : ''}
        </p>
      </div>
      ${ring(p.score, 44, '', t('match.aria', { n: p.score }))}
    </li>`;
  }

  function read() {
    let intent = parseIntent(box.value, { certs });
    const keys = new Set(intent.signals.map(signalKey));
    removed = new Set([...removed].filter((k) => keys.has(k))); // forget removals the text no longer produces
    for (const k of removed) intent = withoutSignal(intent, k);
    return intent;
  }

  function render() {
    const text = box.value;
    examples.innerHTML = `<span>${t('describe.try')}</span>${EXAMPLES.map((k) => `<button type="button" class="d-example" data-example="${k}">${esc(t(k))}</button>`).join('')}`;
    form.closest('.describe').classList.toggle('has-out', Boolean(text.trim()));
    if (!text.trim()) {
      current = null;
      out.innerHTML = '';
      status.textContent = '';
      return;
    }
    const intent = read();
    current = intent;
    const tools = `<span class="d-tools">${
      intent.topical ? `<button type="button" class="link" data-act="d-refine">${icon('sliders-horizontal')}${t('describe.refine')}</button>` : ''
    }<button type="button" class="link" data-act="d-clear">${t('clear')}</button></span>`;
    if (!intent.signals.length) {
      out.innerHTML = `<div class="d-more">${icon('info')}<p>${t('describe.more')}</p>${tools}</div>`;
      status.textContent = t('describe.more');
      return;
    }
    const names = labels();
    const ranked = rank(certs, intent.profile, names);
    const levelHours = Object.fromEntries(tx.levels.map((l) => [l.id, l.hours]));
    const { picks, left } = recommend(certs, ranked, intent, { limit: LIMIT, labels: names, estimate: (c) => estimateHours(c, intent.profile, levelHours).hours });
    const understood = `<div class="d-understood"><div class="d-row"><span class="label">${t('describe.understood')}</span>${tools}</div><ul class="d-chips">${chips(intent.signals)}</ul></div>`;
    const vague = intent.topical ? '' : `<p class="hint d-hint">${icon('info')}${t('describe.vague')}</p>`;
    const list = picks.length
      ? `<h3 class="d-head">${t('describe.picks')}</h3><ol class="d-picks">${picks.map(pick).join('')}</ol>${left ? `<p class="hint d-left">${t('describe.left', { n: left })}</p>` : ''}`
      : `<p class="d-none">${t('describe.none')}</p>`;
    out.innerHTML = understood + vague + list;
    status.textContent = picks.length ? t('describe.status', { n: picks.length }) : t('describe.none');
  }

  function run() {
    clearTimeout(timer);
    save(box.value, removed);
    render();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run();
  });
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    run();
  });
  box.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, WAIT);
  });
  examples.addEventListener('click', (e) => {
    const b = e.target.closest('[data-example]');
    if (!b) return;
    box.value = t(b.dataset.example);
    removed = new Set();
    run();
  });
  out.addEventListener('click', (e) => {
    const x = e.target.closest('.d-x');
    if (x) {
      for (const k of x.dataset.key.split('|')) removed.add(k);
      run();
      box.focus({ preventScroll: true });
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'd-clear') {
      box.value = '';
      removed = new Set();
      run();
      box.focus();
    }
    if (act === 'd-refine' && current) onRefine(current);
  });

  render();
  return {
    /** Re-render in the current language (app.js calls this after switching). */
    localize: render,
  };
}
