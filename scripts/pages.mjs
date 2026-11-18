// Static pages for search engines and link previews: one per certification and language, a
// certification index, comparisons of curated pairs (data/comparisons.json), the study paths
// (data/paths.json), sitemap.xml and robots.txt. Everything on them comes from the catalog bundle;
// the app at the site root stays the place to practise and compare.
import { t, label, dates } from '../site/i18n.js';
import { badge, donut, domainColor, providerColor } from '../site/visuals.js';

export const LANGS = ['en', 'es'];
const prefix = (lang) => (lang === 'en' ? '' : `${lang}/`);
/** Path of a page under the site root. English has no prefix, so the existing share links keep working. */
export const certPath = (id, lang = 'en') => `${prefix(lang)}c/${id}/`;
export const indexPath = (lang = 'en') => `${prefix(lang)}c/`;
export const vsPath = (a, b, lang = 'en') => `${prefix(lang)}c/vs/${a}-vs-${b}/`;
export const pathPath = (id, lang = 'en') => `${prefix(lang)}p/${id}/`;
export const pathIndexPath = (lang = 'en') => `${prefix(lang)}p/`;
/** Search results cut titles past about 60 characters; every page title stays within this. */
export const TITLE_MAX = 65;
// The Spanish pages open the app in Spanish.
const appQuery = (lang) => (lang === 'en' ? '' : `?lang=${lang}`);
// Relative way back to the site root from a page, so the same files work under /pathfinder/ or at a domain root.
const upFrom = (path) => '../'.repeat(path.split('/').filter(Boolean).length);

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
const ext = (url, html, cls = '') => `<a class="${cls}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${html}</a>`;
// Inline JSON inside <script> must not be able to close the tag.
const jsonScript = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

// Same marks as app.js, so the static pages look like the app.
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
/** A category's name; TEXT covers categories site/i18n.js doesn't know yet. */
const catName = (cat, lang) => {
  const name = t(`cat.${cat}`, {}, lang);
  return name !== `cat.${cat}` ? name : TEXT[lang][`cat.${cat}`] || cat;
};
const tile = (name, color, size = '') => `<span class="tile ${size}" style="--c:var(${color})">${icon(name)}</span>`;
const SIGN = {
  entry: '<svg viewBox="0 0 14 14" aria-hidden="true"><circle class="entry" cx="7" cy="7" r="6"/></svg>',
  associate: '<svg viewBox="0 0 14 14" aria-hidden="true"><rect class="associate" x="1.5" y="1.5" width="11" height="11" rx="1.5"/></svg>',
  professional: '<svg viewBox="0 0 14 14" aria-hidden="true"><path class="professional" d="M7 .5 13.5 7 7 13.5.5 7z"/></svg>',
  expert: '<svg class="two" viewBox="0 0 26 14" aria-hidden="true"><path class="expert" d="M7 .5 13.5 7 7 13.5.5 7zM19 .5 25.5 7 19 13.5 12.5 7z"/></svg>',
};
const PREP_ICON = { 'official-guide': 'book-open', course: 'graduation-cap', docs: 'file-text', practice: 'dumbbell' };
const FLAG = { restricted: 'lock', upcoming: 'clock' };

// Words only these pages use. They live here rather than in site/i18n.js, which every visitor of
// the app downloads.
const TEXT = {
  en: {
    'title.cert': 'exam domains and price',
    'title.certShort': 'exam and price',
    'title.practice': 'exam and practice questions',
    'title.practiceShort': 'practice questions',
    'vs.suffix': 'price, exam and domains',
    'vs.desc': ({ a, b }) => `${a} and ${b} side by side: level, price, exam length, questions, passing score, validity and exam domains, as their issuers publish them.`,
    'vs.lede': 'Both exams side by side, with the facts their issuers publish.',
    'vs.table': 'Side by side',
    'vs.diff': 'How they differ',
    'vs.app': 'Compare in the app',
    'vs.list': 'Compared with',
    'vs.all': 'Comparisons',
    'row.issuer': 'Issuer',
    'row.code': 'Exam code',
    'row.languages': 'Exam languages',
    'row.delivery': 'Where',
    'delivery.online': 'Online',
    'delivery.test-center': 'Test center',
    'diff.issuerSame': 'Both come from {p}.',
    'diff.issuer': '{a} comes from {pa} and {b} from {pb}.',
    'diff.levelSame': 'Both are {l} level.',
    'diff.level': '{a} is {la} level and {b} is {lb} level.',
    'diff.priceSame': 'Both list at {x}.',
    'diff.price': '{a} lists at {xa} and {b} at {xb}, a difference of {d}.',
    'diff.priceFree': '{a} is free and {b} lists at {xb}.',
    'diff.priceOne': '{a} lists at {xa}; {b} is priced by country.',
    'diff.priceNone': 'Both are priced by country.',
    'diff.basis': 'The prices cover different things: “{ba}” for {a}, “{bb}” for {b}.',
    'diff.timeSame': 'Both exams last {t}.',
    'diff.time': '{a} lasts {ta} and {b} {tb}.',
    'diff.questionsSame': 'Both have up to {n} questions.',
    'diff.questions': '{a} has up to {na} questions and {b} up to {nb}.',
    'diff.styleSame': 'Same format for both: {s}.',
    'diff.style': 'Format: {sa} for {a}, {sb} for {b}.',
    'diff.validSame': 'Validity is the same for both: {x}.',
    'diff.valid': 'Validity: {xa} for {a}, {xb} for {b}.',
    'diff.restricted': '{a} has eligibility requirements; its page lists them.',
    'diff.upcoming': '{a} is announced but registration is not open yet.',
    'diff.skillsBoth': 'Both cover: {list}.',
    'diff.skillsOnly': 'Only {a} covers: {list}.',
    'diff.spanishBoth': 'Both can be taken in Spanish.',
    'diff.spanishOne': 'Only {a} can be taken in Spanish.',
    'diff.spanishNone': 'Neither can be taken in Spanish.',
    'diff.deliverySame': 'Both can be taken: {d}.',
    'diff.delivery': 'Where: {da} for {a}; {db} for {b}.',
    'diff.pathSame': 'In the suggested “{p}” path they are alternatives for step {n}.',
    'diff.path': 'In the suggested “{p}” path, {a} is step {i} and {b} step {j}.',
    and: 'and',
    'path.suffix': 'certification path, step by step',
    'path.suffixShort': 'certification path',
    'path.desc': ({ summary, order }) => `${summary} Suggested order: ${order}.`,
    'path.note': 'An order suggested by pathfinder, not an official path from any issuer. Each step lists alternatives, the best known first.',
    'path.step': 'Step {n}',
    'path.compare': 'Compare this step',
    'path.list': 'In study paths',
    'path.indexTitle': 'IT certification paths by goal',
    'path.indexDesc': ({ n }) => `${n} suggested orders of IT certifications by goal, from a first exam to senior roles, with the facts of each certification.`,
    'path.all': 'Study paths',
    'index.titleShort': 'IT certifications: prices and exam domains',
    'error.title': 'Page not found',
    'error.text': 'Check the address or browse the catalog to find a certification.',
    'cat.Networking': 'Networking',
  },
  es: {
    'title.cert': 'dominios del examen y precio',
    'title.certShort': 'examen y precio',
    'title.practice': 'examen y preguntas de práctica',
    'title.practiceShort': 'preguntas de práctica',
    'vs.suffix': 'precio, examen y dominios',
    'vs.desc': ({ a, b }) => `${a} y ${b} lado a lado: nivel, precio, duración, preguntas, puntaje para aprobar, vigencia y dominios del examen, según lo que publica cada emisor.`,
    'vs.lede': 'Los dos exámenes lado a lado, con los datos que publica cada emisor.',
    'vs.table': 'Lado a lado',
    'vs.diff': 'En qué se diferencian',
    'vs.app': 'Comparar en la app',
    'vs.list': 'Comparada con',
    'vs.all': 'Comparaciones',
    'row.issuer': 'Emisor',
    'row.code': 'Código del examen',
    'row.languages': 'Idiomas del examen',
    'row.delivery': 'Dónde',
    'delivery.online': 'Online',
    'delivery.test-center': 'Centro de examen',
    'diff.issuerSame': 'Las dos son de {p}.',
    'diff.issuer': '{a} es de {pa} y {b}, de {pb}.',
    'diff.levelSame': 'Las dos son de nivel {l}.',
    'diff.level': '{a} es de nivel {la} y {b}, de nivel {lb}.',
    'diff.priceSame': 'Las dos cuestan {x} de lista.',
    'diff.price': '{a} cuesta {xa} de lista y {b}, {xb}: {d} de diferencia.',
    'diff.priceFree': '{a} es gratis y {b} cuesta {xb} de lista.',
    'diff.priceOne': '{a} cuesta {xa} de lista; {b} tiene precio según el país.',
    'diff.priceNone': 'Las dos tienen precio según el país.',
    'diff.basis': 'Los precios no incluyen lo mismo: “{ba}” en {a}, “{bb}” en {b}.',
    'diff.timeSame': 'Los dos exámenes duran {t}.',
    'diff.time': '{a} dura {ta} y {b}, {tb}.',
    'diff.questionsSame': 'Las dos tienen hasta {n} preguntas.',
    'diff.questions': '{a} tiene hasta {na} preguntas y {b}, hasta {nb}.',
    'diff.styleSame': 'Las dos tienen el mismo formato: {s}.',
    'diff.style': 'Formato: {sa} en {a}; {sb} en {b}.',
    'diff.validSame': 'La vigencia es la misma: {x}.',
    'diff.valid': 'Vigencia: {xa} en {a}; {xb} en {b}.',
    'diff.restricted': '{a} tiene requisitos de elegibilidad; están en su página.',
    'diff.upcoming': '{a} está anunciada, pero la inscripción todavía no abre.',
    'diff.skillsBoth': 'Las dos cubren: {list}.',
    'diff.skillsOnly': 'Solo {a} cubre: {list}.',
    'diff.spanishBoth': 'Las dos se pueden rendir en español.',
    'diff.spanishOne': 'Solo {a} se puede rendir en español.',
    'diff.spanishNone': 'Ninguna se puede rendir en español.',
    'diff.deliverySame': 'Las dos se pueden rendir: {d}.',
    'diff.delivery': 'Dónde: {da} en {a}; {db} en {b}.',
    'diff.pathSame': 'En la ruta sugerida “{p}” son alternativas del paso {n}.',
    'diff.path': 'En la ruta sugerida “{p}”, {a} es el paso {i} y {b}, el {j}.',
    and: 'y',
    'path.suffix': 'ruta de certificaciones paso a paso',
    'path.suffixShort': 'ruta de certificaciones',
    'path.desc': ({ summary, order }) => `${summary} Orden sugerido: ${order}.`,
    'path.note': 'Un orden sugerido por pathfinder, no una ruta oficial de ningún emisor. Cada paso lista alternativas, la más conocida primero.',
    'path.step': 'Paso {n}',
    'path.compare': 'Comparar este paso',
    'path.list': 'En rutas de estudio',
    'path.indexTitle': 'Rutas de certificaciones de IT por objetivo',
    'path.indexDesc': ({ n }) => `${n} órdenes sugeridos de certificaciones de IT por objetivo, desde un primer examen hasta roles senior, con los datos de cada certificación.`,
    'path.all': 'Rutas de estudio',
    'index.titleShort': 'Certificaciones de IT: precios y dominios del examen',
    'error.title': 'Página no encontrada',
    'error.text': 'Revisá la dirección o buscá una certificación en el catálogo.',
    'cat.Networking': 'Redes',
  },
};
/** A string from TEXT; {name} placeholders are filled from `vars`. */
export function say(key, vars = {}, lang = 'en') {
  const s = TEXT[lang][key] ?? TEXT.en[key];
  if (s === undefined) throw new Error(`pages: no text for ${key}`);
  if (typeof s === 'function') return s(vars);
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
export const TEXT_KEYS = { en: Object.keys(TEXT.en), es: Object.keys(TEXT.es) };
/** The first candidate that fits in a search result's title, else the last one cut short. */
function fit(candidates, max = TITLE_MAX) {
  return candidates.find((x) => x.length <= max) || cut(candidates.at(-1), max);
}
const OG_LOCALE = { en: 'en_US', es: 'es_AR' };

const len = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`);
function fee(c, lang) {
  const usd = c.fee.usd;
  if (usd == null) return t('fee.varies', {}, lang);
  if (usd === 0) return t('fee.free', {}, lang);
  return `US$${usd % 1 ? usd.toFixed(2) : usd}`;
}
const duration = (c, lang) => (c.exam.minutes ? len(c.exam.minutes) : c.exam.style === 'practical' ? t('dur.practical', {}, lang) : '');
function day(s, lang) {
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${dates(lang).months[m - 1]} ${y}`;
}
/** The issuer's name in front unless the certification name already carries it ("AI Practitioner" → "AWS AI Practitioner"). */
export const fullName = (c) => (c.name.toLowerCase().includes(c.provider.toLowerCase()) ? c.name : `${c.provider} ${c.name}`);
/** A name short enough for "A vs B": the full name up to 32 characters, else the issuer with the
 *  abbreviation in brackets in the name or code ("CompTIA CySA+", "EC-Council CEH v13") or with the
 *  exam code ("ISC2 CISSP"). */
export function shortName(c) {
  const full = fullName(c);
  if (full.length <= 32) return full;
  const inBrackets = (s) => s.match(/\(([^)]+)\)\s*$/)?.[1];
  return `${c.provider} ${inBrackets(c.name) || inBrackets(c.code) || c.code}`;
}
const taxonomyLabel = (taxonomy, group, id, lang) => {
  const entry = taxonomy[group].find((x) => x.id === id);
  return entry ? label(group, entry, lang) : id;
};
// "3 years" → P3Y, "12 months" → P12M. Anything less plain is left out of the structured data.
function isoDuration(text) {
  const m = /^(\d+) (year|month)s?$/i.exec(String(text || '').trim());
  return m ? `P${m[1]}${m[2].toLowerCase() === 'year' ? 'Y' : 'M'}` : null;
}
function cut(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[,;:.]$/, '')}…`;
}

/** Other certifications worth a look: same category first, then the most shared skills, then the same issuer. */
export function related(cert, all, n = 6) {
  return all
    .filter((c) => c.id !== cert.id)
    .map((c) => ({ c, score: (c.category === cert.category ? 10 : 0) + c.skills.filter((s) => cert.skills.includes(s)).length + (c.provider === cert.provider ? 0.5 : 0) }))
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
    .slice(0, n)
    .map((x) => x.c);
}

/** Lucide and Simple Icons symbols from index.html, by id, so each page inlines only what it uses. */
export function symbolsFrom(html) {
  const notice = html.match(/<!-- UI icons:[\s\S]*?-->/)?.[0] || '';
  return { notice, map: new Map([...html.matchAll(/<symbol id="([\w-]+)"[\s\S]*?<\/symbol>/g)].map((m) => [m[1], m[0]])) };
}
function sprite(body, symbols) {
  const used = [...new Set([...body.matchAll(/href="#([\w-]+)"/g)].map((m) => m[1]))].filter((id) => symbols.map.has(id));
  if (!used.length) return '';
  return `${symbols.notice}\n<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n${used.map((id) => symbols.map.get(id)).join('\n')}\n</svg>`;
}

const themeScript = `<script>try { const t = JSON.parse(localStorage.getItem("pathfinder:theme")); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch {}</script>`;

function layout({ lang, path, title, description, alternates, image, jsonld, body, site, v, symbols, inIndex = true }) {
  const up = upFrom(path);
  const url = site + path;
  const other = LANGS.find((l) => l !== lang);
  const nav = [
    [`${up}${indexPath(lang)}`, 'layout-grid', `<span class="long">${t('nav.certs', {}, lang)}</span><span class="short">${t('nav.certsShort', {}, lang)}</span>`, inIndex],
    [`${up}${appQuery(lang)}#about`, 'info', `<span>${esc(t('nav.about', {}, lang))}</span>`],
  ];
  const content = `<a class="skip" href="#main">${t('skip', {}, lang)}</a>

<header class="top">
  <div class="top-inner">
    <a class="brand" href="${up}${appQuery(lang)}">
      <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M7 25 13 12l5 7 7-12"/><circle cx="25" cy="7" r="2.4"/></svg></span>
      pathfinder
    </a>
    <nav aria-label="${esc(t('nav.aria', {}, lang))}">
      ${nav.map(([href, ic, html, current]) => `<a href="${esc(href)}"${current ? ' aria-current="page"' : ''}>${icon(ic)}${html}</a>`).join('\n      ')}
    </nav>
    <a class="btn lang" href="${esc(up + alternates[other])}" hreflang="${other}" lang="${other}" aria-label="${esc(t('lang.aria', {}, lang))}">${icon('languages')}<span>${t('lang.switch', {}, lang)}</span></a>
  </div>
</header>

<main id="main">
${body}
</main>

<footer class="foot">
  <span>${t('foot', {}, lang)}</span>
  <a href="${esc(up + indexPath(lang))}">${t('foot.index', {}, lang)}</a>
</footer>`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
${LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${esc(site + alternates[l])}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${esc(site + alternates.en)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="pathfinder">
<meta property="og:locale" content="${OG_LOCALE[lang]}">
<meta property="og:locale:alternate" content="${OG_LOCALE[other]}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(site + image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f6f4ef" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e0f13" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${up}icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${up}icons/apple-touch-icon.png">
<link rel="preload" href="${up}fonts/bricolage-grotesque.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${up}styles.css?v=${v}">
${themeScript}
<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); }; if (/(^|\\.)pathfinder\\.legios\\.com\\.ar$|\\.vercel\\.app$/.test(location.hostname)) { const s = document.createElement("script"); s.defer = true; s.src = "/_vercel/insights/script.js"; document.head.append(s); }</script>
<script type="application/ld+json">${jsonScript(jsonld)}</script>
</head>
<body>
${sprite(content, symbols)}
${content}
</body>
</html>
`;
}

/** Hosts serve this file at the missing URL, so asset and recovery links include the site's base path. */
export function notFoundPage({ catalog, site, v }) {
  const base = new URL(site).pathname;
  const href = (path) => esc(base + path);
  const cards = LANGS.map((lang) => `<section class="card not-found" lang="${lang}">
  <a class="brand" href="${href(appQuery(lang))}"><img src="${href('icon.svg')}" width="32" height="32" alt="">pathfinder</a>
  <h1>${esc(say('error.title', {}, lang))}</h1>
  <p class="hint">${esc(say('error.text', {}, lang))}</p>
  <a class="btn primary" href="${href(indexPath(lang))}">${esc(t('notFound.catalog', {}, lang))}</a>
  ${catalog.paths.length ? `<a class="link" href="${href(pathIndexPath(lang))}">${esc(say('path.all', {}, lang))}</a>` : ''}
</section>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>${esc(say('error.title'))} · pathfinder</title>
<link rel="icon" href="${href('icon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${href(`styles.css?v=${v}`)}">
${themeScript}
</head>
<body>
<main>
${cards}
</main>
<script>
  // A single error file serves both languages. Both recovery links work without JavaScript.
  (() => {
    const path = location.pathname.slice(${base.length});
    const requested = new URLSearchParams(location.search).get('lang');
    let saved;
    try { saved = JSON.parse(localStorage.getItem('pathfinder:lang')); } catch {}
    const isLanguage = (value) => value === 'en' || value === 'es';
    let lang;
    if (isLanguage(requested)) lang = requested;
    else if (/^es(?:\\/|$)/.test(path)) lang = 'es';
    else if (isLanguage(saved)) lang = saved;
    else lang = navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
    document.documentElement.lang = lang;
    document.querySelector('main > section:not([lang="' + lang + '"])').remove();
    document.title = document.querySelector('h1').textContent + ' · pathfinder';
  })();
</script>
</body>
</html>
`;
}

/** One certification's page, with the exam facts and links to practice and compare. */
export function certPage({ cert: c, catalog, lang, site, v, symbols, ogImages, comparisons = [] }) {
  const path = certPath(c.id, lang);
  const up = upFrom(path);
  const app = `${up}${appQuery(lang)}`;
  const color = catOf(c).c;
  const tx = catalog.taxonomy;
  const sources = c.sources.map((id) => catalog.sources[id]).filter(Boolean);
  const reportsById = new Map(catalog.reports.map((r) => [r.id, r]));
  const reports = (c.reports || []).map((id) => reportsById.get(id)).filter(Boolean);
  const official = sources[0];
  const practice = c.practice_questions || 0;
  const similar = related(c, catalog.certifications);
  const compareIds = [c.id, ...similar.slice(0, 3).map((x) => x.id)].join(',');
  const local = { ...c, badge: c.badge && { ...c.badge, src: up + c.badge.src } };
  const questions = c.exam.question_count ?? (parseInt(c.exam.questions, 10) || null);
  const name = fullName(c);

  const kind = practice ? 'title.practice' : 'title.cert';
  const nameCode = `${name} (${c.code})`;
  const title = fit([`${nameCode}: ${say(kind, {}, lang)}`, `${nameCode}: ${say(`${kind}Short`, {}, lang)}`, `${nameCode} · pathfinder`, nameCode, `${c.name} (${c.code})`, c.name]);
  const description = cut(t('page.desc', { name, code: c.code, usd: c.fee.usd, fee: fee(c, lang), minutes: c.exam.minutes, questions, practice }, lang), 200);

  const stat = (ic, lbl, value, sub) =>
    value ? `<div class="card stat">${tile(ic, color, 'sm')}<div><small>${esc(lbl)}</small><b>${esc(value)}</b>${sub ? `<small class="sub">${esc(sub)}</small>` : ''}</div></div>` : '';
  const notes = [
    c.requirements && c.status === 'restricted' ? ['lock', c.requirements] : null,
    c.exam.format ? ['pen-line', c.exam.format] : null,
    c.fee.note ? ['badge-dollar-sign', c.fee.note] : null,
    c.ai_policy ? ['bot', t('cert.ai', { x: c.ai_policy }, lang)] : null,
    ...c.caveats.map((x) => ['info', x]),
  ].filter(Boolean);
  const legend = `<ul class="legend">${c.domains.map((d, i) => `<li><span class="sw" style="background:${domainColor(i)}"></span><span>${esc(d.name)}</span><b>${d.weight}%</b></li>`).join('')}</ul>`;
  const resource = (r) =>
    ext(
      r.url,
      `${tile(PREP_ICON[r.kind] || 'file-text', color, 'sm')}<span><b>${esc(r.title)}</b>${r.note ? `<small>${esc(r.note)}</small>` : ''}<span class="res-kind">${esc(PREP_ICON[r.kind] ? t(`prep.${r.kind}`, {}, lang) : r.kind)} · ${t(r.cost === 'paid' ? 'paid' : 'free', {}, lang)}</span></span>`,
      'res',
    );
  const left = [
    c.domains.length
      ? `<section class="card panel"><h2>${icon('layers')}${t('cert.domains', {}, lang)}</h2><div class="donut-wrap">${donut(c.domains, 168, { label: t('donut.label', {}, lang), aria: t('donut.aria', {}, lang) })}${legend}</div>${c.domains_note ? `<p class="hint domains-note">${esc(c.domains_note)}</p>` : ''}</section>`
      : '',
    notes.length ? `<section class="card panel"><h2>${icon('info')}${t('cert.good', {}, lang)}</h2><ul class="notes">${notes.map(([ic, x]) => `<li>${icon(ic)}<span>${esc(x)}</span></li>`).join('')}</ul></section>` : '',
  ].join('');
  const prepHtml = c.prep && c.prep.length ? `<section class="card panel"><h2>${icon('graduation-cap')}${t('cert.prep', {}, lang)}</h2><div class="resources">${c.prep.map(resource).join('')}</div></section>` : '';
  const sourcesHtml = `<section class="card panel"><h2>${icon('file-text')}${t('cert.sources', {}, lang)}</h2>
      <p class="hint">${esc(t('cert.checked', { d: day(c.checked_on, lang) }, lang))} ${esc(t('about.price', {}, lang))}</p>
      ${c.badge && c.badge.source ? `<p class="hint">${ext(c.badge.source, esc(t('cert.badgeFrom', {}, lang)))}</p>` : ''}
      <div class="sources">${sources.map((s) => ext(s.url, `${esc(s.title)}${s.note ? `<small>${esc(s.note)}</small>` : ''}`, 'src')).join('')}</div>
      ${reports.length ? `<details class="more"><summary>${t('cert.nReports', { n: reports.length }, lang)}</summary>
        <p class="hint">${t('cert.reportsHint', {}, lang)}</p>
        ${reports.map((r) => `<div class="report">${ext(r.url, esc(r.title))} <span class="muted">· ${esc(r.platform)}</span><p>${esc(r.summary)}</p></div>`).join('')}</details>` : ''}
    </section>`;
  const right = prepHtml || sourcesHtml;
  const tail = prepHtml ? `<div class="col-tail">${sourcesHtml}</div>` : '';
  const flag = FLAG[c.status] ? `<span class="pill warn">${icon(FLAG[c.status])}${t(`flag.${c.status}`, {}, lang)}</span>` : '';
  const byId = new Map(catalog.certifications.map((x) => [x.id, x]));
  const pairs = comparisons.filter((pair) => pair.includes(c.id) && pair.every((id) => byId.has(id)));
  const pairsHtml = pairs.length
    ? `<section class="card panel"><h2>${icon('columns-3')}${say('vs.list', {}, lang)}</h2><ul class="idx">${pairs
        .map(([a, b]) => {
          const other = byId.get(a === c.id ? b : a);
          return `<li><a href="${esc(`${up}${vsPath(a, b, lang)}`)}">${esc(`${shortName(byId.get(a))} vs ${shortName(byId.get(b))}`)}</a><small>${esc(fullName(other))}</small></li>`;
        })
        .join('')}</ul></section>`
    : '';
  const inPaths = (catalog.paths || []).flatMap((p) => {
    const i = p.steps.findIndex((s) => s.certs.includes(c.id));
    return i < 0 ? [] : [{ p, n: i + 1 }];
  });

  const body = `  <a class="back" href="../">${icon('arrow-left')}${t('cert.back', {}, lang)}</a>
  <div class="card cert-hero" style="--pc:${providerColor(c.provider)}">
    <div class="hero-badge">${badge(local, 128, { eager: true })}</div>
    <div>
      <p class="who"><span>${esc(c.provider)} · ${esc(c.code)}</span><span class="lvl">${SIGN[c.level] || ''}${esc(taxonomyLabel(tx, 'levels', c.level, lang))}</span><span class="pill catp" style="--c:var(${color})">${icon(catOf(c).icon)}${esc(catName(c.category, lang))}</span>${flag}</p>
      <h1>${esc(c.name)}</h1>
      <p class="scope">${esc(c.scope)}</p>
      <div class="cert-actions">
        ${practice ? `<a class="btn primary" href="${esc(`${app}#practice?cert=${c.id}`)}">${icon('dumbbell')}${t('practice.btn', {}, lang)}</a>` : ''}
        <a class="btn" href="${esc(`${app}#compare?ids=${compareIds}`)}">${icon('columns-3')}${t('page.compare', {}, lang)}</a>
        <a class="btn" href="${esc(`${app}#cert?id=${c.id}`)}">${icon('layout-grid')}${t('page.app', {}, lang)}</a>
        ${official ? ext(official.url, `${icon('external-link')}${t('cert.issuer', {}, lang)}`, practice ? 'btn' : 'btn primary') : ''}
      </div>
      ${practice ? `<p class="hint page-note">${esc(t('practice.intro', { n: practice }, lang))}</p>` : ''}
      ${lang === 'en' ? '' : `<p class="hint page-note">${esc(t('about.langNote', {}, lang))}</p>`}
    </div>
  </div>
  <h2 class="sr">${t('page.facts', {}, lang)}</h2>
  <div class="stat-grid">
    ${stat('badge-dollar-sign', t('stat.price', {}, lang), fee(c, lang), c.fee.basis)}
    ${stat('clock', t('stat.length', {}, lang), duration(c, lang))}
    ${stat('list-checks', t('stat.questions', {}, lang), c.exam.questions)}
    ${stat('target', t('stat.passing', {}, lang), c.exam.passing)}
    ${stat('calendar-check', t('stat.valid', {}, lang), c.exam.validity)}
    ${stat('pen-line', t('stat.format', {}, lang), taxonomyLabel(tx, 'styles', c.exam.style, lang))}
    ${stat(c.status === 'restricted' ? 'lock' : 'clipboard-list', t('stat.registration', {}, lang), taxonomyLabel(tx, 'statuses', c.status, lang))}
  </div>
  <div class="cols cert-cols"><div>${left}</div><div class="col-side">${right}</div>${tail}</div>
  ${similar.length ? `<section class="card panel"><h2>${icon('columns-3')}${t('page.related', {}, lang)}</h2><ul class="idx">${similar.map((x) => indexRow(x, lang, `../${x.id}/`)).join('')}</ul></section>` : ''}
  ${pairsHtml}
  ${inPaths.length ? `<section class="card panel"><h2>${icon('route')}${say('path.list', {}, lang)}</h2><ul class="idx">${inPaths.map(({ p, n }) => `<li><a href="${esc(`${up}${pathPath(p.id, lang)}`)}">${esc(p.title[lang])}</a><small>${esc(say('path.step', { n }, lang))}</small></li>`).join('')}</ul></section>` : ''}`;

  const credential = {
    '@type': 'EducationalOccupationalCredential',
    '@id': `${site}${certPath(c.id)}#credential`,
    name: c.name,
    alternateName: c.code,
    description: c.scope,
    url: site + path,
    credentialCategory: c.type,
    educationalLevel: taxonomyLabel(tx, 'levels', c.level, 'en'),
    recognizedBy: { '@type': 'Organization', name: c.provider },
  };
  if (c.domains.length) credential.competencyRequired = c.domains.map((d) => d.name);
  const validFor = isoDuration(c.exam.validity);
  if (validFor) credential.validFor = validFor;
  if (typeof c.fee.usd === 'number') credential.offers = { '@type': 'Offer', price: String(c.fee.usd), priceCurrency: 'USD', ...(c.fee.basis ? { category: c.fee.basis } : {}) };
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      credential,
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'pathfinder', item: site },
          { '@type': 'ListItem', position: 2, name: t('nav.certs', {}, lang), item: site + indexPath(lang) },
          { '@type': 'ListItem', position: 3, name: c.name, item: site + path },
        ],
      },
    ],
  };
  return layout({
    lang,
    path,
    title,
    description,
    alternates: Object.fromEntries(LANGS.map((l) => [l, certPath(c.id, l)])),
    image: ogImages.has(`${c.id}.jpg`) ? `og/${c.id}.jpg` : 'og/home.jpg',
    jsonld,
    body,
    site,
    v,
    symbols,
  });
}

const LEVEL_ORDER = ['entry', 'associate', 'professional', 'expert'];
const usd = (n) => `US$${n % 1 ? n.toFixed(2) : n}`;
function languageName(code, lang) {
  try {
    return new Intl.DisplayNames([lang], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
}
/** A validity from the catalog ("3 years", "Does not expire") to sit inside a sentence; the common forms in Spanish. */
function validityText(text, lang) {
  if (lang !== 'es') return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
  return text
    .replace(/^Does not expire$/i, 'no vence')
    .replace(/\b(\d+) years?\b/g, (m, n) => `${n} ${n === '1' ? 'año' : 'años'}`)
    .replace(/\b(\d+) months?\b/g, (m, n) => `${n} ${n === '1' ? 'mes' : 'meses'}`)
    .replace('renewable free online', 'se renueva gratis online');
}
function listOf(items, lang) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${say('and', {}, lang)} ${items.at(-1)}`;
}

/** What sets two certifications apart, as plain sentences built only from their catalog facts. */
export function differences(a, b, catalog, lang) {
  const tx = catalog.taxonomy;
  const out = [];
  const add = (key, vars = {}) => out.push(say(key, vars, lang));
  const [na, nb] = [shortName(a), shortName(b)];
  const ab = { a: na, b: nb };
  if (a.provider === b.provider) add('diff.issuerSame', { p: a.provider });
  else add('diff.issuer', { ...ab, pa: a.provider, pb: b.provider });
  const level = (c) => taxonomyLabel(tx, 'levels', c.level, lang).toLowerCase();
  if (a.level === b.level) add('diff.levelSame', { l: level(a) });
  else {
    // Lower level first, so the sentence reads in the order people usually take them.
    const [x, y] = LEVEL_ORDER.indexOf(a.level) <= LEVEL_ORDER.indexOf(b.level) ? [a, b] : [b, a];
    add('diff.level', { a: shortName(x), la: level(x), b: shortName(y), lb: level(y) });
  }
  const [pa, pb] = [a.fee.usd, b.fee.usd];
  if (typeof pa === 'number' && typeof pb === 'number') {
    if (pa === pb) add('diff.priceSame', { x: fee(a, lang) });
    else if (pa === 0 || pb === 0) add('diff.priceFree', pa === 0 ? { a: na, b: nb, xb: usd(pb) } : { a: nb, b: na, xb: usd(pa) });
    else add('diff.price', { ...ab, xa: usd(pa), xb: usd(pb), d: usd(Math.abs(pa - pb)) });
  } else if (typeof pa === 'number') add('diff.priceOne', { a: na, xa: fee(a, lang), b: nb });
  else if (typeof pb === 'number') add('diff.priceOne', { a: nb, xa: fee(b, lang), b: na });
  else add('diff.priceNone');
  if (typeof pa === 'number' && typeof pb === 'number' && a.fee.basis && b.fee.basis && a.fee.basis !== b.fee.basis) add('diff.basis', { ...ab, ba: a.fee.basis, bb: b.fee.basis });
  if (a.exam.minutes && b.exam.minutes) {
    if (a.exam.minutes === b.exam.minutes) add('diff.timeSame', { t: len(a.exam.minutes) });
    else add('diff.time', { ...ab, ta: len(a.exam.minutes), tb: len(b.exam.minutes) });
  }
  const [qa, qb] = [a.exam.question_count, b.exam.question_count];
  if (qa && qb) {
    if (qa === qb) add('diff.questionsSame', { n: qa });
    else add('diff.questions', { ...ab, na: qa, nb: qb });
  }
  const style = (c) => taxonomyLabel(tx, 'styles', c.exam.style, lang).toLowerCase();
  if (a.exam.style === b.exam.style) add('diff.styleSame', { s: style(a) });
  else add('diff.style', { ...ab, sa: style(a), sb: style(b) });
  if (a.exam.validity && b.exam.validity) {
    if (a.exam.validity === b.exam.validity) add('diff.validSame', { x: validityText(a.exam.validity, lang) });
    else add('diff.valid', { ...ab, xa: validityText(a.exam.validity, lang), xb: validityText(b.exam.validity, lang) });
  }
  for (const c of [a, b]) if (c.status === 'restricted' || c.status === 'upcoming') add(`diff.${c.status}`, { a: shortName(c) });
  const skill = (id) => taxonomyLabel(tx, 'skills', id, lang);
  const shared = a.skills.filter((s) => b.skills.includes(s));
  // Skill labels can hold "and" themselves ("Identity & access", "Identidad y acceso"): plain commas.
  if (shared.length) add('diff.skillsBoth', { list: shared.slice(0, 5).map(skill).join(', ') });
  for (const [x, y] of [
    [a, b],
    [b, a],
  ]) {
    const own = x.skills.filter((s) => !y.skills.includes(s));
    if (own.length) add('diff.skillsOnly', { a: shortName(x), list: own.slice(0, 5).map(skill).join(', ') });
  }
  // Exam languages and delivery only when the catalog has them for both.
  if (a.exam.languages?.length && b.exam.languages?.length) {
    const es = (c) => c.exam.languages.some((l) => l === 'es' || l.startsWith('es-'));
    if (es(a) && es(b)) add('diff.spanishBoth');
    else if (es(a) || es(b)) add('diff.spanishOne', { a: es(a) ? na : nb });
    else add('diff.spanishNone');
  }
  if (a.exam.delivery?.length && b.exam.delivery?.length) {
    const where = (c) => listOf(c.exam.delivery.map((d) => say(`delivery.${d}`, {}, lang).toLowerCase()), lang);
    if (where(a) === where(b)) add('diff.deliverySame', { d: where(a) });
    else add('diff.delivery', { ...ab, da: where(a), db: where(b) });
  }
  for (const p of catalog.paths || []) {
    const i = p.steps.findIndex((s) => s.certs.includes(a.id));
    const j = p.steps.findIndex((s) => s.certs.includes(b.id));
    if (i < 0 || j < 0) continue;
    if (i === j) add('diff.pathSame', { p: p.title[lang], n: i + 1 });
    else add('diff.path', { ...ab, p: p.title[lang], i: i + 1, j: j + 1 });
  }
  return out;
}

/** Two certifications side by side: their facts in one table, the differences in plain sentences, and links into the app. */
export function vsPage({ pair: [a, b], catalog, lang, site, v, symbols }) {
  const path = vsPath(a.id, b.id, lang);
  const up = upFrom(path);
  const app = `${up}${appQuery(lang)}`;
  const tx = catalog.taxonomy;
  const [sa, sb] = [shortName(a), shortName(b)];
  const [fa, fb] = [fullName(a), fullName(b)];
  const suffix = say('vs.suffix', {}, lang);
  const title = fit([`${fa} vs ${fb}: ${suffix}`, `${fa} vs ${fb}`, `${sa} vs ${sb}: ${suffix}`, `${sa} vs ${sb}`, `${a.code} vs ${b.code}`]);
  const description = cut(say('vs.desc', { a: sa, b: sb }, lang), 200);
  const both = [a, b];
  const small = (x) => (x ? `<small>${esc(x)}</small>` : '');
  const row = (label, fn) => `<tr><th scope="row">${esc(label)}</th>${both.map((c) => `<td>${fn(c) || '—'}</td>`).join('')}</tr>`;
  const anyLang = both.some((c) => c.exam.languages?.length);
  const anyDelivery = both.some((c) => c.exam.delivery?.length);
  const head = (c) => {
    const local = { ...c, badge: c.badge && { ...c.badge, src: up + c.badge.src } };
    return `<th scope="col"><a href="${esc(`${up}${certPath(c.id, lang)}`)}">${badge(local, 40, { label: false, eager: true })}<span>${esc(fullName(c))}</span></a></th>`;
  };
  const table = `<table class="vs-table">
      <thead><tr><td></td>${both.map(head).join('')}</tr></thead>
      <tbody>
        ${row(say('row.issuer', {}, lang), (c) => esc(c.provider))}
        ${row(say('row.code', {}, lang), (c) => esc(c.code))}
        ${row(t('stat.level', {}, lang), (c) => `<span class="lvl">${SIGN[c.level] || ''}${esc(taxonomyLabel(tx, 'levels', c.level, lang))}</span>`)}
        ${row(t('stat.price', {}, lang), (c) => `${esc(fee(c, lang))}${small(c.fee.basis)}`)}
        ${row(t('stat.length', {}, lang), (c) => esc(duration(c, lang)))}
        ${row(t('stat.questions', {}, lang), (c) => esc(c.exam.questions))}
        ${row(t('stat.passing', {}, lang), (c) => esc(c.exam.passing))}
        ${row(t('stat.valid', {}, lang), (c) => esc(c.exam.validity))}
        ${row(t('stat.format', {}, lang), (c) => `${esc(taxonomyLabel(tx, 'styles', c.exam.style, lang))}${small(c.exam.format)}`)}
        ${anyLang ? row(say('row.languages', {}, lang), (c) => esc((c.exam.languages || []).map((l) => languageName(l, lang)).join(', '))) : ''}
        ${anyDelivery ? row(say('row.delivery', {}, lang), (c) => esc((c.exam.delivery || []).map((d) => say(`delivery.${d}`, {}, lang)).join(', '))) : ''}
        ${row(t('stat.registration', {}, lang), (c) => esc(taxonomyLabel(tx, 'statuses', c.status, lang)))}
        ${row(t('stat.domains', {}, lang), (c) => (c.domains.length ? `<ol>${c.domains.map((d) => `<li>${esc(d.name)} <b>${d.weight}%</b></li>`).join('')}</ol>` : ''))}
      </tbody>
    </table>`;
  const sources = both.map((c) => {
    const s = catalog.sources[c.sources[0]];
    return `<p class="hint">${s ? ext(s.url, esc(s.title)) : esc(fullName(c))} · ${esc(t('cert.checked', { d: day(c.checked_on, lang) }, lang))}</p>`;
  });
  const body = `  <a class="back" href="${esc(up + indexPath(lang))}">${icon('arrow-left')}${t('cert.back', {}, lang)}</a>
  <div class="page-head"><span class="head-icon">${icon('columns-3')}</span><h1>${esc(fa)} vs ${esc(fb)}</h1></div>
  <p class="page-lede">${esc(say('vs.lede', {}, lang))} ${esc(t('about.price', {}, lang))}</p>
  <div class="cert-actions vs-actions">
    <a class="btn primary" href="${esc(`${app}#compare?ids=${a.id},${b.id}`)}">${icon('columns-3')}${esc(say('vs.app', {}, lang))}</a>
  </div>
  <section class="card panel"><h2>${icon('list-checks')}${esc(say('vs.table', {}, lang))}</h2><div class="vs-scroll">${table}</div></section>
  <section class="card panel"><h2>${icon('info')}${esc(say('vs.diff', {}, lang))}</h2><ul class="notes">${differences(a, b, catalog, lang).map((x) => `<li>${icon('arrow-right')}<span>${esc(x)}</span></li>`).join('')}</ul></section>
  <section class="card panel"><h2>${icon('file-text')}${t('cert.sources', {}, lang)}</h2>${sources.join('')}${lang === 'en' ? '' : `<p class="hint">${esc(t('about.langNote', {}, lang))}</p>`}</section>`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: title,
        url: site + path,
        inLanguage: lang,
        about: both.map((c) => ({ '@type': 'EducationalOccupationalCredential', '@id': `${site}${certPath(c.id)}#credential`, name: c.name, url: site + certPath(c.id, lang) })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'pathfinder', item: site },
          { '@type': 'ListItem', position: 2, name: t('nav.certs', {}, lang), item: site + indexPath(lang) },
          { '@type': 'ListItem', position: 3, name: `${sa} vs ${sb}`, item: site + path },
        ],
      },
    ],
  };
  return layout({ lang, path, title, description, alternates: Object.fromEntries(LANGS.map((l) => [l, vsPath(a.id, b.id, l)])), image: 'og/home.jpg', jsonld, body, site, v, symbols });
}

/** One study path: its steps in order, each with the certifications to pick from and links into the app. */
export function pathPage({ path: p, catalog, lang, site, v, symbols, comparisons = [] }) {
  const path = pathPath(p.id, lang);
  const up = upFrom(path);
  const app = `${up}${appQuery(lang)}`;
  const byId = new Map(catalog.certifications.map((c) => [c.id, c]));
  const steps = p.steps.map((s) => ({ ...s, list: s.certs.map((id) => byId.get(id)).filter(Boolean) }));
  const name = p.title[lang];
  const title = fit([`${name}: ${say('path.suffix', {}, lang)}`, `${name}: ${say('path.suffixShort', {}, lang)}`, name]);
  const or = lang === 'es' ? ' o ' : ' or ';
  const order = steps.map((s) => s.list.map(shortName).join(or)).join(' → ');
  const description = cut(say('path.desc', { summary: p.summary[lang], order }, lang), 200);
  const pairKey = (x, y) => comparisons.find(([m, n]) => (m === x && n === y) || (m === y && n === x));
  const stepHtml = (s, i) => {
    const pairs = s.list.flatMap((x, k) => s.list.slice(k + 1).map((y) => pairKey(x.id, y.id))).filter(Boolean);
    const actions = [
      s.list.length > 1 ? `<a class="btn" href="${esc(`${app}#compare?ids=${s.list.slice(0, 4).map((c) => c.id).join(',')}`)}">${icon('columns-3')}${esc(say('path.compare', {}, lang))}</a>` : '',
      ...pairs.map(([m, n]) => `<a class="btn" href="${esc(`${up}${vsPath(m, n, lang)}`)}">${icon('columns-3')}${esc(`${shortName(byId.get(m))} vs ${shortName(byId.get(n))}`)}</a>`),
    ].filter(Boolean);
    return `<section class="card panel path-step"><h2>${icon('flag')}${esc(say('path.step', { n: i + 1 }, lang))}</h2>
    <p class="hint">${esc(s.note[lang])}</p>
    <ul class="idx">${s.list.map((c) => indexRow(c, lang, `${up}${certPath(c.id, lang)}`)).join('')}</ul>
    ${actions.length ? `<div class="cert-actions">${actions.join('')}</div>` : ''}
  </section>`;
  };
  const body = `  <a class="back" href="${esc(up + pathIndexPath(lang))}">${icon('arrow-left')}${esc(say('path.all', {}, lang))}</a>
  <div class="page-head"><span class="head-icon">${icon('route')}</span><h1>${esc(name)}</h1></div>
  <p class="page-lede">${esc(p.summary[lang])}</p>
  <p class="hint path-note">${esc(say('path.note', {}, lang))} ${esc(t('about.price', {}, lang))}</p>
  ${steps.map(stepHtml).join('\n  ')}`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name,
        description: p.summary[lang],
        url: site + path,
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        numberOfItems: steps.length,
        itemListElement: steps.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.list.map((c) => c.name).join(or), url: site + certPath(s.list[0].id, lang) })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'pathfinder', item: site },
          { '@type': 'ListItem', position: 2, name: say('path.all', {}, lang), item: site + pathIndexPath(lang) },
          { '@type': 'ListItem', position: 3, name, item: site + path },
        ],
      },
    ],
  };
  return layout({ lang, path, title, description, alternates: Object.fromEntries(LANGS.map((l) => [l, pathPath(p.id, l)])), image: 'og/home.jpg', jsonld, body, site, v, symbols, inIndex: false });
}

/** Every study path, linking to its page. */
export function pathIndexPage({ catalog, lang, site, v, symbols }) {
  const path = pathIndexPath(lang);
  const paths = catalog.paths || [];
  const title = fit([`${say('path.indexTitle', {}, lang)} · pathfinder`, say('path.indexTitle', {}, lang)]);
  const description = say('path.indexDesc', { n: paths.length }, lang);
  const body = `  <div class="page-head"><span class="head-icon">${icon('route')}</span><h1>${esc(say('path.all', {}, lang))}</h1></div>
  <p class="page-lede">${esc(description)}</p>
  <p class="hint path-note">${esc(say('path.note', {}, lang))}</p>
  <section class="card panel"><ul class="idx">${paths.map((p) => `<li><a href="${esc(`${p.id}/`)}">${esc(p.title[lang])}</a><small>${esc(p.summary[lang])}</small></li>`).join('')}</ul></section>`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: say('path.indexTitle', {}, lang),
    url: site + path,
    inLanguage: lang,
    mainEntity: { '@type': 'ItemList', numberOfItems: paths.length, itemListElement: paths.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: site + pathPath(p.id, lang), name: p.title[lang] })) },
  };
  return layout({ lang, path, title, description, alternates: Object.fromEntries(LANGS.map((l) => [l, pathIndexPath(l)])), image: 'og/home.jpg', jsonld, body, site, v, symbols, inIndex: false });
}

function indexRow(c, lang, href) {
  const facts = [c.code, fee(c, lang), duration(c, lang)].filter(Boolean).join(' · ');
  return `<li><a href="${esc(href)}">${esc(fullName(c))}</a><small>${esc(facts)}</small></li>`;
}

/** Every certification by category, linking to its page. */
export function indexPage({ catalog, lang, site, v, symbols, comparisons = [] }) {
  const path = indexPath(lang);
  const all = catalog.certifications;
  const byId = new Map(all.map((c) => [c.id, c]));
  const providers = new Set(all.map((c) => c.provider)).size;
  const cats = [...Object.keys(CATS), ...new Set(all.map((c) => c.category).filter((x) => !CATS[x]))];
  const title = fit([`${t('page.indexTitle', {}, lang)} · pathfinder`, t('page.indexTitle', {}, lang), say('index.titleShort', {}, lang)]);
  const pairs = comparisons.filter((pair) => pair.every((id) => byId.has(id)));
  const paths = catalog.paths || [];
  const description = t('page.indexDesc', { n: all.length, p: providers }, lang);
  const body = `  <div class="page-head"><span class="head-icon">${icon('layout-grid')}</span><h1>${t('cert.back', {}, lang)}</h1></div>
  <p class="page-lede">${esc(description)} ${esc(t('about.price', {}, lang))}</p>
  ${cats
    .map((cat) => {
      const list = all.filter((c) => c.category === cat).sort((a, b) => fullName(a).localeCompare(fullName(b)));
      if (!list.length) return '';
      const m = CATS[cat] || { icon: 'layers', c: '--accent' };
      return `<section class="card panel"><h2>${icon(m.icon)}${esc(catName(cat, lang))}</h2><ul class="idx">${list.map((c) => indexRow(c, lang, `${c.id}/`)).join('')}</ul></section>`;
    })
    .join('\n  ')}
  ${paths.length ? `<section class="card panel"><h2>${icon('route')}${esc(say('path.all', {}, lang))}</h2><ul class="idx">${paths.map((p) => `<li><a href="${esc(`../${pathPath(p.id)}`)}">${esc(p.title[lang])}</a><small>${esc(p.summary[lang])}</small></li>`).join('')}</ul></section>` : ''}
  ${pairs.length ? `<section class="card panel"><h2>${icon('columns-3')}${esc(say('vs.all', {}, lang))}</h2><ul class="idx">${pairs.map(([a, b]) => `<li><a href="vs/${a}-vs-${b}/">${esc(`${shortName(byId.get(a))} vs ${shortName(byId.get(b))}`)}</a></li>`).join('')}</ul></section>` : ''}`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t('page.indexTitle', {}, lang),
    url: site + path,
    inLanguage: lang,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: all.length,
      itemListElement: all.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: site + certPath(c.id, lang), name: c.name })),
    },
  };
  return layout({ lang, path, title, description, alternates: Object.fromEntries(LANGS.map((l) => [l, indexPath(l)])), image: 'og/home.jpg', jsonld, body, site, v, symbols });
}

/** sitemap.xml: the app, the indexes, every certification page, the comparisons and the study paths, with their language alternates. */
export function sitemap({ catalog, site, comparisons = [] }) {
  const byId = new Map(catalog.certifications.map((c) => [c.id, c]));
  const newest = (ids) => ids.map((id) => byId.get(id)?.checked_on).filter(Boolean).sort().at(-1);
  const latest = catalog.certifications.map((c) => c.checked_on).sort().at(-1);
  const entry = (paths, lastmod) =>
    LANGS.map(
      (lang) => `  <url>
    <loc>${esc(site + paths[lang])}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
${LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${esc(site + paths[l])}"/>`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(site + paths.en)}"/>
  </url>`,
    ).join('\n');
  const pathsOf = (fn) => Object.fromEntries(LANGS.map((l) => [l, fn(l)]));
  const pairs = comparisons.filter((pair) => pair.every((id) => byId.has(id)));
  const paths = catalog.paths || [];
  // The app has one address; ?lang=es opens it in Spanish.
  const home = { en: '', es: '?lang=es' };
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entry(home, latest)}
${entry(pathsOf(indexPath), latest)}
${catalog.certifications.map((c) => entry(pathsOf((l) => certPath(c.id, l)), c.checked_on)).join('\n')}
${pairs.map(([a, b]) => entry(pathsOf((l) => vsPath(a, b, l)), newest([a, b]))).join('\n')}
${paths.length ? entry(pathsOf(pathIndexPath), latest) : ''}
${paths.map((p) => entry(pathsOf((l) => pathPath(p.id, l)), newest(p.steps.flatMap((s) => s.certs)))).join('\n')}
</urlset>
`;
}

/** robots.txt. Crawlers only read it at the root of a host, which the site's own domain gives it. */
export const robots = ({ site }) => `User-agent: *
Allow: /

Sitemap: ${site}sitemap.xml
`;
