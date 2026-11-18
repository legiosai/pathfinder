// Validate the catalog and write the static site to dist/.
// Usage: node scripts/build.mjs [--check]   (--check validates without writing)
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle, loadCatalog, validate } from './catalog.mjs';
import { LANGS, certPage, certPath, indexPage, indexPath, robots, sitemap, symbolsFrom } from './pages.mjs';
import { CHAT_API, DEFAULT_CHAT_API, DEFAULT_SITE, SITE } from './site.mjs';

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
// The same for the chat endpoint (see scripts/site.mjs), which site/chat.js carries as a constant.
if (!/^https?:\/\/[\w.:[\]-]+(\/[\w./~-]*)?$/.test(CHAT_API)) throw new Error(`build: CHAT_API is not a plain http(s) address: ${CHAT_API}`);
await rewrite('chat.js', [[new RegExp(`'${DEFAULT_CHAT_API.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`), `'${CHAT_API}'`]]);
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

// GitHub Pages caches files for 10 minutes. Version the script, module, stylesheet and catalog
// URLs so a returning visitor never mixes old and new files.
const assets = ['styles.css'];
for (const f of await readdir(dist)) if (f.endsWith('.js') && f !== 'sw.js') assets.push(f);
for (const dir of ['lib', 'vendor']) for (const f of await readdir(join(dist, dir))) if (f.endsWith('.js')) assets.push(`${dir}/${f}`);
const hash = createHash('sha256');
for (const f of assets.sort()) hash.update(await readFile(join(dist, f)));
hash.update(await readFile(join(dist, 'catalog.json')));
for (const set of data.practice) hash.update(await readFile(join(dist, 'practice', set._file)));
// Badge images are cached by the worker without a version in the URL, so they feed the cache name.
for (const f of [...badgeFiles].sort()) if (f.endsWith('.webp')) hash.update(await readFile(join(dist, 'badges', f)));
const v = hash.digest('hex').slice(0, 10);
await rewrite('index.html', [[/(src|href)="(app\.js|styles\.css)"/g, `$1="$2?v=${v}"`]]);
// chat.js imports the same modules as app.js; with the same URLs they load once and share state (the language).
// Dynamic imports (modules only some visits need) get the same version.
for (const f of ['app.js', 'chat.js']) await rewrite(f, [[/(from |import\()'(\.\/[\w./-]+\.js)'/g, `$1'$2?v=${v}'`]]);
await rewrite('app.js', [[/fetch\('catalog\.json'\)/, `fetch('catalog.json?v=${v}')`]]);
// Without hints the browser finds the modules one level at a time (page, app.js, its imports, theirs)
// and asks for the catalog only once they have all run. Announce the whole static graph and the
// catalog up front so they download in parallel. The catalog preload matches the app's fetch()
// (CORS mode, same-origin credentials, default cache), or the browser would download it twice.
const graph = await moduleGraph(dist, 'app.js');
await rewrite('index.html', [
  [
    /(<script type="module" src="app\.js\?v=\w+"><\/script>)/,
    `$1\n${graph.map((f) => `<link rel="modulepreload" href="${f}?v=${v}">`).join('\n')}\n<link rel="preload" href="catalog.json?v=${v}" as="fetch" crossorigin>`,
  ],
]);

// Offline cache: the worker precaches the shell and every versioned asset of this build.
const precache = ['./', `catalog.json?v=${v}`, 'manifest.webmanifest', 'icon.svg', 'icons/icon-192.png', 'fonts/bricolage-grotesque.woff2', 'fonts/inter-latin.woff2', ...data.practice.map((set) => `practice/${set._file}`), ...assets.map((f) => `${f}?v=${v}`)];
await rewrite('sw.js', [
  [/const VERSION = 'dev';/, `const VERSION = '${v}';`],
  [/const PRECACHE = \[[^\]]*\];/, `const PRECACHE = ${JSON.stringify(precache)};`],
]);

// Search engines get no content from the app's single page, so every certification also gets a
// plain HTML page per language (c/<id>/ and es/c/<id>/) with its facts and links into the app.
// c/<id>/ is also the share link, so link previews keep their per-certification image.
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

/** Every module the entry point imports statically, directly or through others (not import() calls). */
async function moduleGraph(base, entry) {
  const seen = new Set();
  const visit = async (file) => {
    const text = await readFile(join(base, file), 'utf8');
    for (const [, spec] of text.matchAll(/^\s*(?:import|export)\b[^'";]*?from\s*'(\.{1,2}\/[^'?]+\.js)(?:\?[^']*)?'/gm)) {
      const dep = posix.normalize(posix.join(posix.dirname(file), spec));
      if (seen.has(dep)) continue;
      seen.add(dep);
      await visit(dep);
    }
  };
  await visit(entry);
  return [...seen];
}

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
