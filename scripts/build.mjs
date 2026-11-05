// Validate the catalog and write the static site to dist/.
// Usage: node scripts/build.mjs [--check]   (--check validates without writing)
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle, loadCatalog, validate } from './catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = await loadCatalog(root);
const errors = validate(data);
if (errors.length) {
  console.error(`Catalog has ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Catalog OK: ${data.certifications.length} certifications, ${data.sources.length} sources, ${data.reports.length} reports.`);
if (process.argv.includes('--check')) process.exit(0);

const dist = join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, 'site'), dist, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
// Official badge images (fetched by scripts/badges.mjs) replace the generated badge where present.
const badgeFiles = new Set(await readdir(join(root, 'site', 'badges')).catch(() => []));
const badgeSources = JSON.parse(await readFile(join(root, 'data', 'badges.json'), 'utf8').catch(() => '[]'));
const catalog = bundle(data, today);
for (const c of catalog.certifications) {
  const entry = badgeSources.find((b) => b.id === c.id);
  if (entry && badgeFiles.has(`${c.id}.webp`)) c.badge = { src: `badges/${c.id}.webp`, source: entry.page_url };
}
await writeFile(join(dist, 'catalog.json'), JSON.stringify(catalog));
await writeFile(join(dist, '.nojekyll'), '');
// One file per certification, loaded when someone opens its practice page.
await mkdir(join(dist, 'practice'), { recursive: true });
for (const { _file, ...set } of data.practice) await writeFile(join(dist, 'practice', _file), JSON.stringify(set));

// GitHub Pages caches files for 10 minutes. Version the script, module and
// stylesheet URLs so a returning visitor never mixes old and new files.
const assets = ['styles.css'];
for (const f of await readdir(dist)) if (f.endsWith('.js') && f !== 'sw.js') assets.push(f);
for (const dir of ['lib', 'vendor']) for (const f of await readdir(join(dist, dir))) if (f.endsWith('.js')) assets.push(`${dir}/${f}`);
const hash = createHash('sha256');
for (const f of assets.sort()) hash.update(await readFile(join(dist, f)));
for (const set of data.practice) hash.update(await readFile(join(dist, 'practice', set._file)));
// Badge images are cached by the worker without a version in the URL, so they feed the cache name.
for (const f of [...badgeFiles].sort()) if (f.endsWith('.webp')) hash.update(await readFile(join(dist, 'badges', f)));
const v = hash.digest('hex').slice(0, 10);
await rewrite('index.html', [[/(src|href)="(app\.js|styles\.css)"/g, `$1="$2?v=${v}"`]]);
await rewrite('app.js', [[/from '(\.\/[\w./-]+\.js)'/g, `from '$1?v=${v}'`]]);

// Offline cache: the worker precaches the shell and every versioned asset of this build.
const precache = ['./', 'catalog.json', 'manifest.webmanifest', 'icon.svg', 'icons/icon-192.png', 'fonts/bricolage-grotesque.woff2', 'fonts/inter-latin.woff2', ...data.practice.map((set) => `practice/${set._file}`), ...assets.map((f) => `${f}?v=${v}`)];
await rewrite('sw.js', [
  [/const VERSION = 'dev';/, `const VERSION = '${v}';`],
  [/const PRECACHE = \[[^\]]*\];/, `const PRECACHE = ${JSON.stringify(precache)};`],
]);

// Share pages: c/<id>/ carries Open Graph tags for link previews, then opens the app.
const SITE = (process.env.SITE_URL || 'https://legiosai.github.io/pathfinder/').replace(/\/?$/, '/');
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ogImages = new Set(await readdir(join(dist, 'og')).catch(() => []));
for (const c of data.certifications) {
  const image = ogImages.has(`${c.id}.jpg`) ? `og/${c.id}.jpg` : 'og/home.jpg';
  const target = `../../#cert?id=${encodeURIComponent(c.id)}`;
  const description = c.scope.length > 180 ? `${c.scope.slice(0, 177).trimEnd()}…` : c.scope;
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${attr(c.name)} · pathfinder</title>
<meta name="description" content="${attr(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="pathfinder">
<meta property="og:title" content="${attr(`${c.name} (${c.code})`)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:url" content="${attr(`${SITE}c/${c.id}/`)}">
<meta property="og:image" content="${attr(SITE + image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${attr(target)}">
<link rel="icon" href="../../icon.svg" type="image/svg+xml">
</head>
<body>
<p><a href="${attr(target)}">${attr(c.name)}</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body>
</html>
`;
  await mkdir(join(dist, 'c', c.id), { recursive: true });
  await writeFile(join(dist, 'c', c.id, 'index.html'), page);
}

async function rewrite(file, rules) {
  let text = await readFile(join(dist, file), 'utf8');
  for (const [re, to] of rules) {
    if (!re.test(text)) throw new Error(`build: no asset reference to version in ${file}`);
    re.lastIndex = 0;
    text = text.replace(re, to);
  }
  await writeFile(join(dist, file), text);
}
console.log('Site written to dist/.');
