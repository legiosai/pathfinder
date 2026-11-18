// Builds the site into a temporary folder and checks what the build writes: the offline cache list,
// the hints in index.html, the error page and the indexable pages' titles and structured data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
import { access, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';
import { TITLE_MAX } from '../scripts/pages.mjs';

const root = new URL('..', import.meta.url).pathname;
const dist = await mkdtemp(join(tmpdir(), 'pathfinder-build-'));
await promisify(execFile)(process.execPath, [join(root, 'scripts', 'build.mjs')], { env: { ...process.env, DIST: dist, SITE_URL: 'https://example.test/' } });
process.on('exit', () => rmSync(dist, { recursive: true, force: true }));

const read = (path) => readFile(join(dist, path), 'utf8');
const exists = (path) =>
  access(join(dist, path)).then(
    () => true,
    () => false,
  );
async function htmlFiles(dir = '') {
  const out = [];
  for (const entry of await readdir(join(dist, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(path)));
    else if (entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}
const ENTITY = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

test('every file the offline cache asks for is in the build', async () => {
  const sw = await read('sw.js');
  const version = sw.match(/const VERSION = '(\w+)';/)[1];
  assert.notEqual(version, 'dev');
  const precache = JSON.parse(sw.match(/const PRECACHE = (\[.*?\]);/s)[1]);
  assert.ok(precache.length > 10);
  for (const url of precache) assert.ok(await exists(url === './' ? 'index.html' : url.split('?')[0]), url);
  // Every module and stylesheet the page can load is cached, with this build's version.
  for (const f of ['app.js', 'chat.js', 'styles.css', 'lib/intent.js', 'vendor/confetti.js']) assert.ok(precache.includes(`${f}?v=${version}`), f);
});

test('index.html announces the module graph and the catalog the way the app asks for them', async () => {
  const html = await read('index.html');
  const v = html.match(/src="app\.js\?v=(\w+)"/)[1];
  const preloads = [...html.matchAll(/<link rel="modulepreload" href="([^"?]+)\?v=(\w+)">/g)].map((m) => (assert.equal(m[2], v), m[1]));
  for (const f of ['i18n.js', 'visuals.js', 'chat.js', 'lib/match.js', 'lib/chat.js']) assert.ok(preloads.includes(f), f);
  // Only what the first view needs: the on-device matcher and confetti load later, by import().
  for (const f of ['lib/intent.js', 'vendor/confetti.js', 'app.js']) assert.ok(!preloads.includes(f), f);
  for (const f of preloads) assert.ok(await exists(f), f);
  assert.match(html, new RegExp(`<link rel="preload" href="catalog\\.json\\?v=${v}" as="fetch" crossorigin>`));
  // The preload is only used if the app's fetch() asks for the same URL with the default mode, credentials and cache.
  const app = await read('app.js');
  assert.match(app, new RegExp(`fetch\\('catalog\\.json\\?v=${v}'\\)`));
  assert.match(app, new RegExp(`import\\('\\./vendor/confetti\\.js\\?v=${v}'\\)`));
  assert.match(await read('chat.js'), new RegExp(`import\\('\\./lib/intent\\.js\\?v=${v}'\\)`));
  assert.ok(!html.includes('pathfinder.legios.com.ar'), 'SITE_URL replaces the default address');
  assert.match(html, /hreflang="es" href="https:\/\/example\.test\/\?lang=es"/);
});

test('every indexable page has a short title and structured data that parses', async () => {
  const files = (await htmlFiles()).filter((file) => file !== '404.html');
  assert.ok(files.length > 200);
  for (const file of files) {
    const html = await read(file);
    const title = html.match(/<title>(.*?)<\/title>/s)?.[1].replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITY[m]);
    assert.ok(title && title.length <= TITLE_MAX, `${file}: "${title}" (${title?.length})`);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
    assert.ok(blocks.length, `${file}: no structured data`);
    for (const [, json] of blocks) assert.equal(JSON.parse(json)['@context'], 'https://schema.org', file);
  }
  for (const page of ['c/vs/aws-saa-vs-microsoft-az-104/index.html', 'es/c/vs/aws-saa-vs-microsoft-az-104/index.html', 'p/index.html', 'p/cloud-aws/index.html', 'es/p/cloud-aws/index.html']) assert.ok(files.includes(page), page);
  const sitemap = await read('sitemap.xml');
  assert.ok(sitemap.includes('<loc>https://example.test/c/vs/aws-saa-vs-microsoft-az-104/</loc>'));
  assert.ok(sitemap.includes('<loc>https://example.test/es/p/cloud-aws/</loc>'));
});

test('the 404 page gives visitors working recovery links from a nested URL', async () => {
  const html = await read('404.html');
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<h1>Page not found<\/h1>/);
  assert.match(html, /<h1>Página no encontrada<\/h1>/);
  for (const path of ['/c/', '/es/c/', '/p/', '/es/p/']) {
    assert.ok(html.includes(`href="${path}"`), path);
    assert.ok(await exists(`${path.slice(1)}index.html`), path);
  }
  assert.match(html, /href="\/styles\.css\?v=\w+"/);
  assert.doesNotMatch(await read('sitemap.xml'), /404\.html/);
});

test('uncached study path links open the study path offline', async () => {
  const scope = 'https://example.test/sub/';
  let onFetch;
  runInNewContext(await read('sw.js'), {
    self: {
      location: new URL(scope),
      registration: { scope },
      addEventListener(name, handler) {
        if (name === 'fetch') onFetch = handler;
      },
    },
    URL,
    Response,
    caches: { open: async () => ({ match: async () => undefined }) },
    fetch: async () => { throw new Error('offline'); },
    setTimeout() {},
  });
  for (const [path, target] of [
    ['p/cloud-aws/', '#path?id=cloud-aws'],
    ['es/p/cloud-aws/', '?lang=es#path?id=cloud-aws'],
    ['c/aws-saa/', '#cert?id=aws-saa'],
    ['es/c/vs/aws-saa-vs-microsoft-az-104/', '?lang=es#compare?ids=aws-saa,microsoft-az-104'],
  ]) {
    let response;
    onFetch({
      request: { method: 'GET', mode: 'navigate', url: scope + path },
      waitUntil() {},
      respondWith(result) { response = result; },
    });
    const result = await response;
    assert.equal(result.status, 302, path);
    assert.equal(result.headers.get('location'), scope + target, path);
  }
});
