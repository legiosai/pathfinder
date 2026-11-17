// Validate the catalog and write the static site to dist/.
// Usage: node scripts/build.mjs [--check]   (--check validates without writing)
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle, loadCatalog, validate } from './catalog.mjs';
import { LANGS, certPage, certPath, indexPage, indexPath, robots, sitemap, symbolsFrom } from './pages.mjs';
import { DEFAULT_SITE, SITE } from './site.mjs';

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
// The sources carry the default address; point them at SITE before the asset hash is taken.
if (SITE !== DEFAULT_SITE) {
  for (const f of ['index.html', 'i18n.js', 'lib/planner.js']) await writeFile(join(dist, f), (await readFile(join(dist, f), 'utf8')).replaceAll(DEFAULT_SITE, SITE));
}
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
// describe.js imports the same modules as app.js; with the same URLs they load once and share state (the language).
for (const f of ['app.js', 'describe.js']) await rewrite(f, [[/from '(\.\/[\w./-]+\.js)'/g, `from '$1?v=${v}'`]]);

// Offline cache: the worker precaches the shell and every versioned asset of this build.
const precache = ['./', 'catalog.json', 'manifest.webmanifest', 'icon.svg', 'icons/icon-192.png', 'fonts/bricolage-grotesque.woff2', 'fonts/inter-latin.woff2', ...data.practice.map((set) => `practice/${set._file}`), ...assets.map((f) => `${f}?v=${v}`)];
await rewrite('sw.js', [
  [/const VERSION = 'dev';/, `const VERSION = '${v}';`],
  [/const PRECACHE = \[[^\]]*\];/, `const PRECACHE = ${JSON.stringify(precache)};`],
]);

// Search engines get no content from the app's single page, so every certification also gets a
// plain HTML page per language (c/<id>/ and es/c/<id>/) with its facts and links into the app.
// c/<id>/ is also the share link, so link previews keep their per-certification image.
await rewrite('index.html', [[/(<meta name="description"[^>]*>)/, `$1\n<link rel="canonical" href="${SITE}">`]]);
const symbols = symbolsFrom(await readFile(join(dist, 'index.html'), 'utf8'));
const ogImages = new Set(await readdir(join(dist, 'og')).catch(() => []));
const pages = [];
for (const lang of LANGS) {
  pages.push([indexPath(lang), indexPage({ catalog, lang, site: SITE, v, symbols })]);
  for (const cert of catalog.certifications) pages.push([certPath(cert.id, lang), certPage({ cert, catalog, lang, site: SITE, v, symbols, ogImages })]);
}
for (const [path, html] of pages) {
  await mkdir(join(dist, path), { recursive: true });
  await writeFile(join(dist, path, 'index.html'), html);
}
await writeFile(join(dist, 'sitemap.xml'), sitemap({ catalog, site: SITE }));
await writeFile(join(dist, 'robots.txt'), robots({ site: SITE }));
console.log(`${pages.length} static pages for ${SITE}`);

async function rewrite(file, rules) {
  let text = await readFile(join(dist, file), 'utf8');
  for (const [re, to] of rules) {
    if (!re.test(text)) throw new Error(`build: expected text not found in ${file}`);
    re.lastIndex = 0;
    text = text.replace(re, to);
  }
  await writeFile(join(dist, file), text);
}
console.log('Site written to dist/.');
