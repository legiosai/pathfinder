import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { bundle, loadCatalog, validate } from '../scripts/catalog.mjs';
import { LANGS, TEXT_KEYS, TITLE_MAX, certPage, certPath, differences, fullName, indexPage, pathIndexPage, pathPage, pathPath, related, robots, shortName, sitemap, symbolsFrom, vsPage, vsPath } from '../scripts/pages.mjs';
import { STR } from '../site/i18n.js';

const root = new URL('..', import.meta.url).pathname;
const site = 'https://example.test/sub/';
const data = await loadCatalog(root);
const catalog = bundle(data, '2026-11-17');
const symbols = symbolsFrom(await readFile(new URL('../site/index.html', import.meta.url), 'utf8'));
const ogImages = new Set(['aws-aif-c01.jpg']);
const { comparisons } = data;
const byId = new Map(catalog.certifications.map((c) => [c.id, c]));
const common = { catalog, site, v: 'test', symbols, comparisons };
const page = (id, lang, cert = catalog.certifications.find((c) => c.id === id)) => certPage({ ...common, cert, lang, ogImages });
const jsonLd = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
const ENTITY = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const titleOf = (html) => html.match(/<title>(.*?)<\/title>/s)[1].replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITY[m]);

test('a certification page carries its facts as plain HTML', () => {
  // Without a practice set, whatever data/practice holds: the title and links change with one.
  const { practice_questions, ...bare } = catalog.certifications.find((c) => c.id === 'aws-aif-c01');
  const html = page('aws-aif-c01', 'en', bare);
  assert.match(html, /<title>AWS Certified AI Practitioner \(AIF-C01\): price and study plan<\/title>/);
  assert.match(html, /<meta name="description" content="AWS Certified AI Practitioner \(AIF-C01\): US\$100 exam, 90 minutes, 65 questions\./);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.test\/sub\/c\/aws-aif-c01\/">/);
  assert.match(html, /hreflang="es" href="https:\/\/example\.test\/sub\/es\/c\/aws-aif-c01\/"/);
  assert.match(html, /hreflang="x-default" href="https:\/\/example\.test\/sub\/c\/aws-aif-c01\/"/);
  assert.match(html, /og:image" content="https:\/\/example\.test\/sub\/og\/aws-aif-c01\.jpg"/);
  for (const text of ['US$100', '65 (50 scored)', '700 scaled (100–1,000)', '3 years', 'Applications of foundation models', '28%', 'AIF-C01 exam guide', 'Checked 17 Nov 2026 against the issuer.']) assert.ok(html.includes(text), text);
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
  assert.match(html, /<title>AWS Certified Cloud Practitioner \(CLF-C02\) · pathfinder<\/title>/);
  assert.match(html, /<meta property="og:locale" content="es_AR">/);
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
  const index = indexPage({ ...common, lang: 'en' });
  for (const c of catalog.certifications) assert.ok(index.includes(`href="${c.id}/"`), c.id);
  for (const [a, b] of comparisons) assert.ok(index.includes(`href="vs/${a}-vs-${b}/"`), `${a} vs ${b}`);
  for (const p of catalog.paths) assert.ok(index.includes(`href="../p/${p.id}/"`), p.id);
  const xml = sitemap({ catalog, site, comparisons });
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.length, LANGS.length * (2 + catalog.certifications.length + comparisons.length + 1 + catalog.paths.length));
  for (const c of catalog.certifications) for (const lang of LANGS) assert.ok(locs.includes(site + certPath(c.id, lang)), `${c.id} ${lang}`);
  for (const [a, b] of comparisons) for (const lang of LANGS) assert.ok(locs.includes(site + vsPath(a, b, lang)), `${a} vs ${b} ${lang}`);
  for (const p of catalog.paths) for (const lang of LANGS) assert.ok(locs.includes(site + pathPath(p.id, lang)), `${p.id} ${lang}`);
  assert.ok(locs.includes(`${site}?lang=es`), 'the app in Spanish');
  // Each comparison is as fresh as the newer of its two certifications.
  const [a, b] = comparisons[0];
  const newest = [byId.get(a).checked_on, byId.get(b).checked_on].sort().at(-1);
  assert.match(xml, new RegExp(`<loc>${(site + vsPath(a, b)).replace(/[.?]/g, '\\$&')}</loc>\\s*<lastmod>${newest}</lastmod>`));
  assert.equal(new Set(locs).size, locs.length);
  assert.ok(locs.every((u) => u.startsWith(site)));
  assert.match(robots({ site }), /^Sitemap: https:\/\/example\.test\/sub\/sitemap\.xml$/m);
});

test('every interface string exists in English and Spanish', () => {
  assert.deepEqual(Object.keys(STR.es).sort(), Object.keys(STR.en).sort());
  assert.deepEqual(TEXT_KEYS.es.sort(), TEXT_KEYS.en.sort());
});

/** Every static page the build writes, rendered in memory: [label, html]. */
function allPages() {
  const out = [];
  for (const lang of LANGS) {
    out.push([`index ${lang}`, indexPage({ ...common, lang })]);
    for (const cert of catalog.certifications) out.push([`${cert.id} ${lang}`, certPage({ ...common, cert, lang, ogImages })]);
    for (const [a, b] of comparisons) out.push([`${a} vs ${b} ${lang}`, vsPage({ ...common, lang, pair: [byId.get(a), byId.get(b)] })]);
    out.push([`paths ${lang}`, pathIndexPage({ ...common, lang })]);
    for (const path of catalog.paths) out.push([`path ${path.id} ${lang}`, pathPage({ ...common, lang, path })]);
  }
  return out;
}

test('every static page has a title search results show whole, and structured data that parses', () => {
  for (const [label, html] of allPages()) {
    const title = titleOf(html);
    assert.ok(title.length > 10 && title.length <= TITLE_MAX, `${label}: "${title}" is ${title.length} characters`);
    assert.doesNotMatch(html, /undefined|NaN|\[object Object\]|>null</, label);
    const data = jsonLd(html);
    assert.equal(data['@context'], 'https://schema.org', label);
    for (const lang of [...LANGS, 'x-default']) assert.match(html, new RegExp(`hreflang="${lang}"`), `${label} ${lang}`);
    for (const [, id] of html.matchAll(/<use href="#([\w-]+)"/g)) assert.ok(html.includes(`<symbol id="${id}"`), `${label}: icon ${id}`);
  }
});

test('comparison pairs are validated and their pages state facts from both certifications', () => {
  assert.ok(comparisons.length >= 10);
  for (const [a, b] of comparisons) assert.ok(byId.has(a) && byId.has(b), `${a} vs ${b}`);
  const errors = (pairs) => validate({ ...data, comparisons: pairs });
  assert.ok(errors([['aws-saa', 'nope']]).some((e) => e.includes('unknown certification nope')));
  assert.ok(errors([['aws-saa', 'aws-saa']]).some((e) => e.includes('two different')));
  assert.ok(errors([['aws-saa', 'microsoft-az-104'], ['microsoft-az-104', 'aws-saa']]).some((e) => e.includes('duplicate pair')));

  const [a, b] = [byId.get('isc2-cc'), byId.get('comptia-security-plus')];
  const html = vsPage({ ...common, lang: 'en', pair: [a, b] });
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.test\/sub\/c\/vs\/isc2-cc-vs-comptia-security-plus\/">/);
  assert.match(html, /<table class="vs-table">/);
  for (const text of ['US$199', 'US$439', '100–125 (CAT)', 'Maximum of 90', 'Security Principles', '24%', 'a difference of US$240']) assert.ok(html.includes(text), text);
  assert.match(html, /href="\.\.\/\.\.\/\.\.\/#compare\?ids=isc2-cc,comptia-security-plus"/);
  assert.match(html, /href="\.\.\/\.\.\/\.\.\/#plan\?cert=isc2-cc"/);
  assert.match(html, /href="\.\.\/\.\.\/\.\.\/c\/isc2-cc\/"/);
  const [webPage] = jsonLd(html)['@graph'];
  assert.deepEqual(webPage.about.map((x) => x['@id']), [`${site}c/isc2-cc/#credential`, `${site}c/comptia-security-plus/#credential`]);
  // Facts only: no verdicts about which one to take.
  for (const lang of LANGS) {
    for (const [x, y] of comparisons) {
      const text = differences(byId.get(x), byId.get(y), catalog, lang).join(' ');
      assert.doesNotMatch(text, /\b(better|best|easier|harder|worth|recommend|mejor|más fácil|más difícil|conviene|recomend)/i, `${x} vs ${y} ${lang}`);
    }
  }
  const es = vsPage({ ...common, lang: 'es', pair: [a, b] });
  assert.ok(es.includes('En qué se diferencian') && es.includes('US$240 de diferencia'));
  assert.match(es, /href="\.\.\/\.\.\/\.\.\/\.\.\/\?lang=es#compare\?ids=isc2-cc,comptia-security-plus"/);
  // A certification page links to the comparisons and study paths it is part of.
  const cert = page('comptia-security-plus', 'en');
  assert.ok(cert.includes('href="../../c/vs/isc2-cc-vs-comptia-security-plus/"'));
  assert.ok(cert.includes('href="../../p/security-analyst/"'));
  assert.equal(shortName(byId.get('comptia-cysa-plus')), 'CompTIA CySA+');
});

test('study path pages list every step with links to the certifications and the app', () => {
  const path = catalog.paths.find((p) => p.id === 'security-analyst');
  const html = pathPage({ ...common, lang: 'en', path });
  assert.match(html, /<h1>Security analyst \(SOC\)<\/h1>/);
  path.steps.forEach((step, i) => {
    assert.ok(html.includes(`Step ${i + 1}`));
    for (const id of step.certs) assert.ok(html.includes(`href="../../c/${id}/"`), id);
  });
  const first = path.steps[0].certs;
  assert.ok(html.includes(`href="../../#plan?cert=${first[0]}"`));
  assert.ok(html.includes(`href="../../#compare?ids=${first.slice(0, 4).join(',')}"`));
  assert.ok(html.includes('href="../../c/vs/isc2-cissp-vs-isaca-cism/"'), 'links the comparison of a step with one');
  const es = pathPage({ ...common, lang: 'es', path });
  assert.ok(es.includes('Analista de seguridad (SOC)') && es.includes('Paso 1'));
  const index = pathIndexPage({ ...common, lang: 'en' });
  for (const p of catalog.paths) assert.ok(index.includes(`href="${p.id}/"`), p.id);
});

test('every certification has its share image', async () => {
  const missing = [];
  for (const c of catalog.certifications) {
    try {
      await access(new URL(`../site/og/${c.id}.jpg`, import.meta.url));
    } catch {
      missing.push(c.id);
    }
  }
  assert.deepEqual(missing, [], `no share image for ${missing.join(', ')}: run npm run og -- ${missing.join(' ')}`);
});
