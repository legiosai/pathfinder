// Visual building blocks: certification badges and small monochrome charts.
// Logos come from Simple Icons (CC0) and are inlined in index.html as #b-* symbols.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Issuer colours. They only appear inside a generated badge, where they identify the issuer the way
// an official badge would. `logo` is a Simple Icons symbol; `mono` is used when there is none.
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
  Cisco: { mono: 'CSCO', color: '#0b6fa4' },
  Snowflake: { mono: 'SNOW', color: '#1f8fc8' },
  CompTIA: { mono: 'CT', color: '#c8202f' },
  ISC2: { mono: 'ISC2', color: '#11804a' },
  ISACA: { mono: 'ISACA', color: '#0b5c80' },
  'EC-Council': { mono: 'EC', color: '#8f1d24' },
  INE: { mono: 'INE', color: '#d4561a' },
  'Hack The Box': { mono: 'HTB', color: '#141d2b', fg: '#9fef00' },
};

// An issuer without an entry still gets a deliberate mark: its initials on a colour picked from
// this set by its name, so the same issuer always looks the same and never falls back to grey.
const FALLBACK_COLORS = ['#3b5bdb', '#0b7285', '#5f3dc4', '#c2255c', '#2b8a3e', '#d9480f', '#1864ab', '#862e9c', '#495057', '#a61e4d'];
function initials(name) {
  const words = name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
}
function fallback(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return { mono: initials(name), color: FALLBACK_COLORS[h % FALLBACK_COLORS.length] };
}
const providerOf = (name) => PROVIDERS[name] || fallback(String(name || ''));

function markContent(p, { x, y, size, fill }) {
  if (p.logo) return `<use href="#b-${p.logo}" x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}"/>`;
  const fs = size * (p.mono.length <= 1 ? 0.8 : p.mono.length <= 2 ? 0.62 : p.mono.length === 3 ? 0.5 : p.mono.length === 4 ? 0.4 : 0.33);
  return `<text x="${x + size / 2}" y="${y + size / 2}" dy="0.35em" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="${fs.toFixed(1)}" letter-spacing="-0.02em" fill="${fill}">${esc(p.mono)}</text>`;
}

const LEVEL_PIPS = { entry: 1, associate: 2, professional: 3, expert: 4 };

/** The issuer's official badge when the catalog has one, otherwise a flat hexagon: issuer colour, logo, code and level pips. */
export function badge(cert, size = 64, { label = true } = {}) {
  if (cert.badge && cert.badge.src) {
    const alt = label ? `${esc(cert.provider)} ${esc(cert.code)} badge` : '';
    return `<img class="badge official" src="${esc(cert.badge.src)}" width="${size}" height="${(size * 112) / 100}" alt="${alt}" decoding="async" draggable="false">`;
  }
  const p = providerOf(cert.provider);
  const code = cert.code.length > 14 ? `${cert.code.slice(0, 13)}…` : cert.code;
  const fit = code.length > 8 ? ` textLength="${Math.min(70, code.length * 6.2).toFixed(0)}" lengthAdjust="spacingAndGlyphs"` : '';
  const pips = LEVEL_PIPS[cert.level] || 0;
  const pipsSvg = Array.from({ length: pips }, (_, i) => `<circle cx="${50 + (i - (pips - 1) / 2) * 9}" cy="93" r="2.4" fill="#fff" opacity="0.85"/>`).join('');
  return `<svg class="badge" width="${size}" height="${(size * 112) / 100}" viewBox="0 0 100 112" ${label ? `role="img" aria-label="${esc(cert.provider)} ${esc(cert.code)} badge"` : 'aria-hidden="true"'}>
    <path d="M50 4 93 29v54L50 108 7 83V29z" fill="${p.color}" stroke="${p.color}" stroke-width="6" stroke-linejoin="round"/>
    ${markContent(p, { x: 32, y: 24, size: 36, fill: p.fg || '#fff' })}
    <text x="50" y="78" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="600" font-size="9.5" letter-spacing="0.3" fill="#fff" fill-opacity="0.92"${fit}>${esc(code)}</text>
    ${pipsSvg}
  </svg>`;
}

/** Exam domain weights as aligned rows: name, a hairline bar scaled to the heaviest domain, and the
 *  percentage as text. A single heaviest domain is the one highlight; everything else is ink. */
export function weights(domains) {
  const max = Math.max(...domains.map((d) => d.weight), 1);
  const top = domains.filter((d) => d.weight === max).length === 1 ? domains.findIndex((d) => d.weight === max) : -1;
  return `<ol class="weights">${domains
    .map((d, i) => `<li${i === top ? ' class="top"' : ''}><span class="w-name">${esc(d.name)}</span><span class="w-bar" aria-hidden="true"><i style="width:${((d.weight / max) * 100).toFixed(1)}%"></i></span><b>${d.weight}%</b></li>`)
    .join('')}</ol>`;
}

/** Horizontal bars: rows of {label, value, title}. Values are shown as text; the bars are ink. */
export function hbars(rows, unit = 'h') {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `<ul class="hbars">${rows
    .map(
      (r) => `<li title="${esc(r.title || `${r.label}: ${r.value} ${unit}`)}"><span class="hb-label">${esc(r.label)}</span><span class="hb-track" aria-hidden="true"><i style="width:${(r.value / max) * 100}%"></i></span><b>${r.value} ${unit}</b></li>`,
    )
    .join('')}</ul>`;
}

/** Vertical columns for one series: [{label, value, title, mark}]. A marked column is the highlight. */
export function columns(rows, unit = 'h', aria = 'Study hours per week') {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `<div class="cols-chart" role="img" aria-label="${esc(aria)}">${rows
    .map(
      (r) => `<div class="col${r.mark ? ' mark' : ''}" title="${esc(r.title || `${r.label}: ${r.value} ${unit}`)}"><b>${r.value}</b><span class="col-bar"><i style="height:${(r.value / max) * 100}%"></i></span><small>${esc(r.label)}</small></div>`,
    )
    .join('')}</div>`;
}
