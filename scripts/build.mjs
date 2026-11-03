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
await writeFile(join(dist, 'catalog.json'), JSON.stringify(bundle(data, today)));
await writeFile(join(dist, '.nojekyll'), '');

// GitHub Pages caches files for 10 minutes. Version the script, module and
// stylesheet URLs so a returning visitor never mixes old and new files.
const assets = ['app.js', 'styles.css', 'visuals.js'];
for (const dir of ['lib', 'vendor']) for (const f of await readdir(join(dist, dir))) if (f.endsWith('.js')) assets.push(`${dir}/${f}`);
const hash = createHash('sha256');
for (const f of assets.sort()) hash.update(await readFile(join(dist, f)));
const v = hash.digest('hex').slice(0, 10);
await rewrite('index.html', [[/(src|href)="(app\.js|styles\.css)"/g, `$1="$2?v=${v}"`]]);
await rewrite('app.js', [[/from '(\.\/[\w./-]+\.js)'/g, `from '$1?v=${v}'`]]);

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
