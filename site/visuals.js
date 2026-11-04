// Visual building blocks: provider marks, generated certification badges and small SVG charts.
// Logos come from Simple Icons (CC0) and are inlined in index.html as #b-* symbols.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Brand-ish colours for each issuer. `logo` is a Simple Icons symbol; `mono` is used when there is none.
export const PROVIDERS = {
  Anthropic: { logo: 'anthropic', color: '#d97757' },
  AWS: { mono: 'aws', color: '#232f3e', fg: '#ff9900' },
  NVIDIA: { logo: 'nvidia', color: '#5e9400' },
  Databricks: { logo: 'databricks', color: '#e8381e' },
  GitHub: { logo: 'github', color: '#6639ba' },
  'Google Cloud': { logo: 'googlecloud', color: '#2f6fe0' },
  HashiCorp: { logo: 'terraform', color: '#7b42bc' },
  'Linux Foundation': { logo: 'linuxfoundation', color: '#0b6bcb' },
  'Red Hat': { logo: 'redhat', color: '#cc0000' },
  LangChain: { logo: 'langchain', color: '#1f6f66' },
  Microsoft: { mono: 'MS', color: '#0067b8' },
  Oracle: { mono: 'ORA', color: '#c74634' },
  OffSec: { mono: 'OS', color: '#2b2d42' },
  GIAC: { mono: 'GIAC', color: '#9b1c1c' },
  IAPP: { mono: 'IAPP', color: '#00557f' },
  'Cloud Security Alliance': { mono: 'CSA', color: '#0f5aa6' },
  Securiti: { mono: 'S', color: '#2446c6' },
  'TCM Security': { mono: 'TCM', color: '#0b8a5f' },
};
const providerOf = (name) => PROVIDERS[name] || { mono: name.slice(0, 2).toUpperCase(), color: '#555555' };
export const providerColor = (name) => providerOf(name).color;

function shade(hex, amount) {
  // amount > 0 mixes toward white, < 0 toward black
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)),
  );
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function markContent(p, { x, y, size, fill }) {
  if (p.logo) return `<use href="#b-${p.logo}" x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}"/>`;
  const fs = size * (p.mono.length <= 1 ? 0.8 : p.mono.length <= 2 ? 0.62 : p.mono.length === 3 ? 0.5 : 0.4);
  return `<text x="${x + size / 2}" y="${y + size / 2}" dy="0.35em" text-anchor="middle" font-family="Bricolage, system-ui, sans-serif" font-weight="800" font-size="${fs.toFixed(1)}" fill="${fill}">${esc(p.mono)}</text>`;
}

/** Small round provider mark for chips and lists. */
export function providerMark(name, size = 26) {
  const p = providerOf(name);
  return `<svg class="pmark" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="7" fill="${p.color}"/>${markContent(p, { x: 5, y: 5, size: 14, fill: p.fg || '#fff' })}</svg>`;
}

const LEVEL_PIPS = { entry: 1, associate: 2, professional: 3, expert: 4 };
// Gradient ids must be unique per badge: a gradient defined inside a hidden view does not paint elsewhere.
let uid = 0;

/** The issuer's official badge when the catalog has one, otherwise a generated hexagon: issuer colour, logo, code ribbon and level pips. */
export function badge(cert, size = 64, { label = true } = {}) {
  if (cert.badge && cert.badge.src) {
    const alt = label ? `${esc(cert.provider)} ${esc(cert.code)} badge` : '';
    return `<img class="badge official" src="${esc(cert.badge.src)}" width="${size}" height="${(size * 112) / 100}" alt="${alt}" decoding="async" draggable="false">`;
  }
  const p = providerOf(cert.provider);
  const id = `pfg${++uid}`;
  const top = shade(p.color, 0.22);
  const bottom = shade(p.color, -0.28);
  const code = cert.code.length > 14 ? `${cert.code.slice(0, 13)}…` : cert.code;
  const fit = code.length > 8 ? ` textLength="${Math.min(74, code.length * 6.4).toFixed(0)}" lengthAdjust="spacingAndGlyphs"` : '';
  const pips = LEVEL_PIPS[cert.level] || 0;
  const pipsSvg = Array.from({ length: pips }, (_, i) => `<circle cx="${50 + (i - (pips - 1) / 2) * 9}" cy="94" r="2.6" fill="#fff" opacity="0.9"/>`).join('');
  return `<svg class="badge" width="${size}" height="${(size * 112) / 100}" viewBox="0 0 100 112" ${label ? `role="img" aria-label="${esc(cert.provider)} ${esc(cert.code)} badge"` : 'aria-hidden="true"'} style="--pc:${p.color}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
    <path d="M50 4 93 29v54L50 108 7 83V29z" fill="url(#${id})" stroke="url(#${id})" stroke-width="6" stroke-linejoin="round"/>
    <path d="M7 29 50 4l43 25v20H7z" fill="#fff" opacity="0.09"/>
    <path d="M50 14 84 34v44L50 98 16 78V34z" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="1.5"/>
    ${markContent(p, { x: 31, y: 22, size: 38, fill: p.fg || '#fff' })}
    <rect x="12" y="66" width="76" height="17" rx="4" fill="#000" opacity="0.32"/>
    <text x="50" y="78.5" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="700" font-size="10" letter-spacing="0.4" fill="#fff"${fit}>${esc(code)}</text>
    ${pipsSvg}
  </svg>`;
}

// Eight categorical hues in a fixed order. A ninth domain onward gets a neutral grey rather than a
// repeated hue, so no two domains look related; names and weights stay in the legend as text.
export const domainColor = (i) => (i < 8 ? `var(--d${i + 1})` : 'var(--d-rest)');

/** Donut of domain weights with a centre label. Colours follow the --dN categorical order. */
export function donut(domains, size = 168, { label = 'domains', aria = 'Exam domain weights' } = {}) {
  const r = 62;
  const c = 2 * Math.PI * r;
  const total = domains.reduce((s, d) => s + d.weight, 0) || 1;
  const gap = domains.length > 1 ? 3 : 0;
  let offset = 0;
  const segs = domains
    .map((d, i) => {
      const len = (d.weight / total) * c;
      const seg = `<circle class="seg" data-i="${i}" cx="80" cy="80" r="${r}" stroke="${domainColor(i)}" stroke-dasharray="${Math.max(0, len - gap)} ${c}" stroke-dashoffset="${-offset}"><title>${esc(d.name)}: ${d.weight}%</title></circle>`;
      offset += len;
      return seg;
    })
    .join('');
  return `<svg class="donut" width="${size}" height="${size}" viewBox="0 0 160 160" role="img" aria-label="${esc(aria)}">
    <g transform="rotate(-90 80 80)">${segs}</g>
    <text x="80" y="76" text-anchor="middle" class="donut-n">${domains.length}</text>
    <text x="80" y="98" text-anchor="middle" class="donut-l">${esc(label)}</text>
  </svg>`;
}

/** Horizontal bars: rows of {label, value, color, title}. Values are shown as text, so colour is never the only cue. */
export function hbars(rows, unit = 'h') {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `<ul class="hbars">${rows
    .map(
      (r) => `<li title="${esc(r.title || `${r.label}: ${r.value} ${unit}`)}"><span class="hb-label">${esc(r.label)}</span><span class="hb-track"><i style="width:${(r.value / max) * 100}%;background:${r.color}"></i></span><b>${r.value} ${unit}</b></li>`,
    )
    .join('')}</ul>`;
}

/** Vertical columns for one series: [{label, value, title, mark}] where mark highlights a column. */
export function columns(rows, unit = 'h', aria = 'Study hours per week') {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `<div class="cols-chart" role="img" aria-label="${esc(aria)}">${rows
    .map(
      (r) => `<div class="col${r.mark ? ' mark' : ''}" title="${esc(r.title || `${r.label}: ${r.value} ${unit}`)}"><b>${r.value}</b><span class="col-bar"><i style="height:${(r.value / max) * 100}%"></i></span><small>${esc(r.label)}</small></div>`,
    )
    .join('')}</div>`;
}
