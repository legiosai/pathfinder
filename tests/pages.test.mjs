import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bundle, loadCatalog } from '../scripts/catalog.mjs';
import { LANGS, certPage, certPath, fullName, indexPage, related, robots, sitemap, symbolsFrom } from '../scripts/pages.mjs';
import { STR } from '../site/i18n.js';

const root = new URL('..', import.meta.url).pathname;
const site = 'https://example.test/sub/';
const data = await loadCatalog(root);
const catalog = bundle(data, '2026-11-17');
const symbols = symbolsFrom(await readFile(new URL('../site/index.html', import.meta.url), 'utf8'));
const ogImages = new Set(['aws-aif-c01.jpg']);
const page = (id, lang, cert = catalog.certifications.find((c) => c.id === id)) => certPage({ cert, catalog, lang, site, v: 'test', symbols, ogImages });
const jsonLd = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);

test('a certification page carries its facts as plain HTML', () => {
  // Without a practice set, whatever data/practice holds: the title and links change with one.
  const { practice_questions, ...bare } = catalog.certifications.find((c) => c.id === 'aws-aif-c01');
  const html = page('aws-aif-c01', 'en', bare);
  assert.match(html, /<title>AWS Certified AI Practitioner \(AIF-C01\): exam domains, price and study plan · pathfinder<\/title>/);
  assert.match(html, /<meta name="description" content="AWS Certified AI Practitioner \(AIF-C01\): US\$100 exam, 90 minutes, 65 questions\./);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.test\/sub\/c\/aws-aif-c01\/">/);
  assert.match(html, /hreflang="es" href="https:\/\/example\.test\/sub\/es\/c\/aws-aif-c01\/"/);
  assert.match(html, /hreflang="x-default" href="https:\/\/example\.test\/sub\/c\/aws-aif-c01\/"/);
  assert.match(html, /og:image" content="https:\/\/example\.test\/sub\/og\/aws-aif-c01\.jpg"/);
  for (const text of ['US$100', '65 (50 scored)', '700 scaled (100–1,000)', '3 years', 'Applications of foundation models', '28%', 'AIF-C01 exam guide', 'Checked 27 Oct 2026 against the issuer.']) assert.ok(html.includes(text), text);
  // Links into the app and assets are relative, so the page works under a subpath or at a domain root.
  assert.match(html, /href="\.\.\/\.\.\/#plan\?cert=aws-aif-c01"/);
  assert.match(html, /href="\.\.\/\.\.\/#compare\?ids=aws-aif-c01,[\w-]+/);
  assert.match(html, /href="\.\.\/\.\.\/styles\.css\?v=test"/);
  assert.doesNotMatch(html, /#practice\?cert=aws-aif-c01/, 'no practice link without a practice set');
  // Only the icons the page uses are inlined, and every one it uses is there.
  for (const [, id] of html.matchAll(/<use href="#([\w-]+)"/g)) assert.ok(html.includes(`<symbol id="${id}"`), id);
});

test('structured data states only catalog facts', () => {
  const [credential, crumbs] = jsonLd(page('aws-aif-c01', 'en'))['@graph'];
  assert.equal(credential['@type'], 'EducationalOccupationalCredential');
  assert.equal(credential.alternateName, 'AIF-C01');
  assert.deepEqual(credential.recognizedBy, { '@type': 'Organization', name: 'AWS' });
  assert.equal(credential.validFor, 'P3Y');
  assert.deepEqual(credential.offers, { '@type': 'Offer', price: '100', priceCurrency: 'USD', category: 'Exam only' });
  assert.equal(credential.competencyRequired.length, 5);
  assert.equal(crumbs.itemListElement.at(-1).item, `${site}c/aws-aif-c01/`);
  // No fee, no validity: nothing made up.
  const varies = jsonLd(page(catalog.certifications.find((c) => c.fee.usd === null).id, 'en'))['@graph'][0];
  assert.equal(varies.offers, undefined);
  assert.equal(varies.validFor, undefined);
});

test('the Spanish page is in Spanish and opens the app in Spanish', () => {
  const html = page('aws-clf-c02', 'es');
  assert.match(html, /<html lang="es">/);
  assert.match(html, /preguntas de práctica, dominios del examen y plan de estudio · pathfinder<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.test\/sub\/es\/c\/aws-clf-c02\/">/);
  assert.match(html, /href="\.\.\/\.\.\/\.\.\/\?lang=es#practice\?cert=aws-clf-c02"/);
  assert.match(html, /href="\.\.\/\.\.\/\.\.\/styles\.css\?v=test"/);
  assert.ok(html.includes('Dominios del examen'));
  assert.ok(html.includes('Verificado el '));
});

test('every certification renders in both languages without gaps', () => {
  for (const cert of catalog.certifications) {
    for (const lang of LANGS) {
      const html = page(cert.id, lang, cert);
      assert.doesNotMatch(html, /undefined|NaN|\[object Object\]|>null</, `${cert.id} ${lang}`);
      assert.ok(html.includes(`<h1>`), cert.id);
      assert.equal(html.includes(`#practice?cert=${cert.id}`), Boolean(cert.practice_questions), `${cert.id} practice link`);
      jsonLd(html);
    }
  }
});

test('catalog text is escaped, in HTML and in structured data', () => {
  const base = catalog.certifications.find((c) => c.id === 'aws-aif-c01');
  const html = page('x', 'en', { ...base, id: 'x', name: 'Bad <b>name</b>', scope: '</script><script>alert(1)</script>' });
  assert.ok(!html.includes('<b>name</b>'));
  assert.ok(!html.includes('<script>alert(1)'));
  assert.equal(jsonLd(html)['@graph'][0].description, '</script><script>alert(1)</script>');
});

test('similar certifications exclude the page itself and favour the same category', () => {
  const cert = catalog.certifications.find((c) => c.id === 'aws-aif-c01');
  const list = related(cert, catalog.certifications);
  assert.ok(list.length > 0 && list.length <= 6);
  assert.ok(!list.includes(cert));
  assert.equal(list[0].category, cert.category);
  assert.equal(fullName({ name: 'AWS Certified Cloud Practitioner', provider: 'AWS' }), 'AWS Certified Cloud Practitioner');
});

test('the index, sitemap and robots.txt list every page', () => {
  const index = indexPage({ catalog, lang: 'en', site, v: 'test', symbols });
  for (const c of catalog.certifications) assert.ok(index.includes(`href="${c.id}/"`), c.id);
  const xml = sitemap({ catalog, site });
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.length, 1 + LANGS.length * (1 + catalog.certifications.length));
  for (const c of catalog.certifications) for (const lang of LANGS) assert.ok(locs.includes(site + certPath(c.id, lang)), `${c.id} ${lang}`);
  assert.equal(new Set(locs).size, locs.length);
  assert.ok(locs.every((u) => u.startsWith(site)));
  assert.match(robots({ site }), /^Sitemap: https:\/\/example\.test\/sub\/sitemap\.xml$/m);
});

test('every interface string exists in English and Spanish', () => {
  assert.deepEqual(Object.keys(STR.es).sort(), Object.keys(STR.en).sort());
});
