// Static pages for search engines and link previews: one per certification and language, a
// certification index, sitemap.xml and robots.txt. Everything on them comes from the catalog
// bundle; the app at the site root stays the place to plan, practise and compare.
import { t, label, dates } from '../site/i18n.js';
import { badge, donut, domainColor, providerColor } from '../site/visuals.js';

export const LANGS = ['en', 'es'];
const prefix = (lang) => (lang === 'en' ? '' : `${lang}/`);
/** Path of a page under the site root. English has no prefix, so the existing share links keep working. */
export const certPath = (id, lang = 'en') => `${prefix(lang)}c/${id}/`;
export const indexPath = (lang = 'en') => `${prefix(lang)}c/`;
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
};
const catOf = (c) => CATS[c.category] || { icon: 'layers', c: '--accent' };
const tile = (name, color, size = '') => `<span class="tile ${size}" style="--c:var(${color})">${icon(name)}</span>`;
const SIGN = {
  entry: '<svg viewBox="0 0 14 14" aria-hidden="true"><circle class="entry" cx="7" cy="7" r="6"/></svg>',
  associate: '<svg viewBox="0 0 14 14" aria-hidden="true"><rect class="associate" x="1.5" y="1.5" width="11" height="11" rx="1.5"/></svg>',
  professional: '<svg viewBox="0 0 14 14" aria-hidden="true"><path class="professional" d="M7 .5 13.5 7 7 13.5.5 7z"/></svg>',
  expert: '<svg class="two" viewBox="0 0 26 14" aria-hidden="true"><path class="expert" d="M7 .5 13.5 7 7 13.5.5 7zM19 .5 25.5 7 19 13.5 12.5 7z"/></svg>',
};
const PREP_ICON = { 'official-guide': 'book-open', course: 'graduation-cap', docs: 'file-text', practice: 'dumbbell' };
const FLAG = { restricted: 'lock', upcoming: 'clock' };

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

function layout({ lang, path, title, description, alternates, image, jsonld, body, site, v, symbols }) {
  const up = upFrom(path);
  const url = site + path;
  const other = LANGS.find((l) => l !== lang);
  const nav = [
    [`${up}${indexPath(lang)}`, 'layout-grid', `<span class="long">${t('nav.certs', {}, lang)}</span><span class="short">${t('nav.certsShort', {}, lang)}</span>`, true],
    [`${up}${appQuery(lang)}#plan`, 'route', t('nav.plan', {}, lang)],
    [`${up}${appQuery(lang)}#progress`, 'activity', t('nav.progress', {}, lang)],
    [`${up}${appQuery(lang)}#about`, 'info', t('nav.about', {}, lang)],
  ];
  const content = `<a class="skip" href="#main">${t('skip', {}, lang)}</a>

<header class="top">
  <div class="top-inner">
    <a class="brand" href="${up}${appQuery(lang)}">
      <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M7 25 13 12l5 7 7-12"/><circle cx="25" cy="7" r="2.4"/></svg></span>
      pathfinder
    </a>
    <nav aria-label="${esc(t('nav.aria', {}, lang))}">
      ${nav.map(([href, ic, text, current]) => `<a href="${esc(href)}"${current ? ' aria-current="page"' : ''}>${icon(ic)}${current ? text : `<span>${esc(text)}</span>`}</a>`).join('\n      ')}
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
<script>try { const t = JSON.parse(localStorage.getItem("pathfinder:theme")); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch {}</script>
<script type="application/ld+json">${jsonScript(jsonld)}</script>
</head>
<body>
${sprite(content, symbols)}
${content}
</body>
</html>
`;
}

/** One certification's page: the facts as plain HTML, with links into the app's plan, practice and compare views. */
export function certPage({ cert: c, catalog, lang, site, v, symbols, ogImages }) {
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
  const questions = parseInt(c.exam.questions, 10) || null;
  const name = fullName(c);

  const title = `${t(practice ? 'page.titlePractice' : 'page.title', { name, code: c.code }, lang)} · pathfinder`;
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

  const body = `  <a class="back" href="../">${icon('arrow-left')}${t('cert.back', {}, lang)}</a>
  <div class="card cert-hero" style="--pc:${providerColor(c.provider)}">
    <div class="hero-badge">${badge(local, 128)}</div>
    <div>
      <p class="who"><span>${esc(c.provider)} · ${esc(c.code)}</span><span class="lvl">${SIGN[c.level] || ''}${esc(taxonomyLabel(tx, 'levels', c.level, lang))}</span><span class="pill catp" style="--c:var(${color})">${icon(catOf(c).icon)}${esc(t(`cat.${c.category}`, {}, lang))}</span>${flag}</p>
      <h1>${esc(c.name)}</h1>
      <p class="scope">${esc(c.scope)}</p>
      <div class="cert-actions">
        <a class="btn primary" href="${esc(`${app}#plan?cert=${c.id}`)}">${icon('route')}${t('cert.plan', {}, lang)}</a>
        ${practice ? `<a class="btn" href="${esc(`${app}#practice?cert=${c.id}`)}">${icon('dumbbell')}${t('practice.planLink', {}, lang)}</a>` : ''}
        <a class="btn" href="${esc(`${app}#compare?ids=${compareIds}`)}">${icon('columns-3')}${t('page.compare', {}, lang)}</a>
        <a class="btn" href="${esc(`${app}#cert?id=${c.id}`)}">${icon('layout-grid')}${t('page.app', {}, lang)}</a>
        ${official ? ext(official.url, `${icon('external-link')}${t('cert.issuer', {}, lang)}`, 'btn') : ''}
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
  ${similar.length ? `<section class="card panel"><h2>${icon('columns-3')}${t('page.related', {}, lang)}</h2><ul class="idx">${similar.map((x) => indexRow(x, lang, `../${x.id}/`)).join('')}</ul></section>` : ''}`;

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

function indexRow(c, lang, href) {
  const facts = [c.code, fee(c, lang), duration(c, lang)].filter(Boolean).join(' · ');
  return `<li><a href="${esc(href)}">${esc(fullName(c))}</a><small>${esc(facts)}</small></li>`;
}

/** Every certification by category, linking to its page. */
export function indexPage({ catalog, lang, site, v, symbols }) {
  const path = indexPath(lang);
  const all = catalog.certifications;
  const providers = new Set(all.map((c) => c.provider)).size;
  const cats = [...Object.keys(CATS), ...new Set(all.map((c) => c.category).filter((x) => !CATS[x]))];
  const title = `${t('page.indexTitle', {}, lang)} · pathfinder`;
  const description = t('page.indexDesc', { n: all.length, p: providers }, lang);
  const body = `  <div class="page-head"><span class="head-icon">${icon('layout-grid')}</span><h1>${t('cert.back', {}, lang)}</h1></div>
  <p class="page-lede">${esc(description)} ${esc(t('about.price', {}, lang))}</p>
  ${cats
    .map((cat) => {
      const list = all.filter((c) => c.category === cat).sort((a, b) => fullName(a).localeCompare(fullName(b)));
      if (!list.length) return '';
      const m = CATS[cat] || { icon: 'layers', c: '--accent' };
      return `<section class="card panel"><h2>${icon(m.icon)}${esc(t(`cat.${cat}`, {}, lang))}</h2><ul class="idx">${list.map((c) => indexRow(c, lang, `${c.id}/`)).join('')}</ul></section>`;
    })
    .join('\n  ')}`;
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

/** sitemap.xml: the app, the indexes and every certification page, with their language alternates. */
export function sitemap({ catalog, site }) {
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
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${esc(site)}</loc>
    <lastmod>${latest}</lastmod>
  </url>
${entry(pathsOf(indexPath), latest)}
${catalog.certifications.map((c) => entry(pathsOf((l) => certPath(c.id, l)), c.checked_on)).join('\n')}
</urlset>
`;
}

/** robots.txt. Crawlers only read it at the root of a host, so it starts to count once the site has its own domain. */
export const robots = ({ site }) => `User-agent: *
Allow: /

Sitemap: ${site}sitemap.xml
`;
