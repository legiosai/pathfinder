// Validate the catalog and write the static site to dist/.
// Usage: node scripts/build.mjs [--check]   (--check validates without writing)
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
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
console.log('Site written to dist/.');
