import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeFilters, emptyFilters, examInSpanish, filterCerts, filtersFromParams, filtersToParams, sortCerts } from '../site/lib/listing.js';
import { nextSteps, pathsFor, similar } from '../site/lib/related.js';
import { bundle, loadCatalog } from '../scripts/catalog.mjs';

const catalog = bundle(await loadCatalog(new URL('..', import.meta.url).pathname), '2026-11-17');
const all = catalog.certifications;
const f = (over) => ({ ...emptyFilters(), ...over });
const cert = (id, over = {}) => ({ id, name: id, level: 'associate', category: 'Cybersecurity', provider: 'X', fee: { usd: 100 }, exam: {}, skills: [], ...over });

test('a price ceiling keeps the certifications priced by country', () => {
  const varies = all.filter((c) => c.fee.usd == null);
  assert.ok(varies.length > 0);
  const upTo200 = filterCerts(all, f({ max: 200 }));
  for (const c of varies) assert.ok(upTo200.includes(c), c.id);
  assert.ok(upTo200.every((c) => c.fee.usd == null || c.fee.usd <= 200));
  // Cybersecurity up to US$200 used to show two certifications.
  const cyber = filterCerts(all, f({ cat: 'Cybersecurity', max: 200 }));
  assert.ok(cyber.some((c) => c.id === 'microsoft-sc-900'));
  assert.ok(cyber.some((c) => c.id === 'ine-ejpt'));
  // "Free" means a list price of zero.
  assert.ok(filterCerts(all, f({ max: 0 })).every((c) => c.fee.usd === 0));
});

test('Spanish and online filters keep only what the catalog confirms', () => {
  const list = [
    cert('a', { exam: { languages: ['en', 'es'], delivery: ['online', 'test-center'] } }),
    cert('b', { exam: { languages: ['en', 'es-419'], delivery: ['test-center'] } }),
    cert('c', { exam: { languages: ['en', 'ja'] } }),
    cert('d'),
  ];
  assert.deepEqual(filterCerts(list, f({ es: true })).map((c) => c.id), ['a', 'b']);
  assert.deepEqual(filterCerts(list, f({ online: true })).map((c) => c.id), ['a']);
  assert.equal(examInSpanish(list[2]), false);
  assert.equal(examInSpanish(list[3]), null);
  assert.equal(examInSpanish(cert('e', { exam: { languages: ['es-ES'] } })), true);
  assert.equal(examInSpanish(cert('f', { exam: { languages: ['est'] } })), false);
});

test('the recommended order runs entry to expert, by name within a level', () => {
  const sorted = sortCerts(all);
  const rank = (c) => ['entry', 'associate', 'professional', 'expert'].indexOf(c.level);
  for (let i = 1; i < sorted.length; i++) {
    const [a, b] = [sorted[i - 1], sorted[i]];
    assert.ok(rank(a) < rank(b) || (rank(a) === rank(b) && a.name.localeCompare(b.name) <= 0), `${a.id} before ${b.id}`);
  }
  assert.equal(sorted[0].level, 'entry');
  assert.notEqual(sorted[0].provider, 'NVIDIA');
});

test('price order puts prices that vary by country last; search keeps relevance', () => {
  const list = [cert('a', { fee: { usd: null } }), cert('b', { fee: { usd: 300 } }), cert('c', { fee: { usd: 0 } }), cert('d', { fee: { usd: 100 } })];
  assert.deepEqual(sortCerts(list, 'price').map((c) => c.id), ['c', 'd', 'b', 'a']);
  assert.deepEqual(sortCerts(list, 'name').map((c) => c.id), ['a', 'b', 'c', 'd']);
  const hits = new Map([['d', 0], ['a', 1], ['c', 2], ['b', 3]]);
  assert.deepEqual(sortCerts(list, 'recommended', { hits }).map((c) => c.id), ['d', 'a', 'c', 'b']);
  assert.deepEqual(sortCerts(list, 'price', { hits }).map((c) => c.id), ['c', 'd', 'b', 'a']);
  const scores = new Map([['a', { score: 10 }], ['b', { score: 90 }], ['c', { score: 50 }], ['d', { score: 50 }]]);
  assert.deepEqual(sortCerts(list, 'recommended', { scores }).map((c) => c.id), ['b', 'c', 'd', 'a']);
});

test('filters go into the address and come back the same', () => {
  const filters = f({ q: 'cloud', cat: 'Cybersecurity', prov: 'AWS', level: 'entry', max: 200, sort: 'price', es: true, online: true });
  const params = filtersToParams(filters);
  assert.equal(params.toString(), 'cat=Cybersecurity&prov=AWS&level=entry&max=200&es=1&online=1&sort=price&q=cloud');
  assert.deepEqual(filtersFromParams(new URLSearchParams(params.toString())), filters);
  assert.equal(filtersToParams(emptyFilters()).toString(), '');
  assert.deepEqual(filtersFromParams(new URLSearchParams('max=0')).max, 0);
  // Unknown values fall back instead of hiding everything.
  const bad = filtersFromParams(new URLSearchParams('cat=Nope&level=wizard&max=lots&sort=random&es=yes'), { categories: ['Cybersecurity'] });
  assert.deepEqual(bad, emptyFilters());
  assert.deepEqual(activeFilters(filters), ['q', 'cat', 'prov', 'level', 'max', 'es', 'online']);
  assert.deepEqual(activeFilters(f({ sort: 'name', max: 0 })), ['max']);
});

test('paths by category, the next step after a certification and similar ones', () => {
  const { paths } = catalog;
  assert.ok(pathsFor(paths, 'Cybersecurity').every((p) => p.category === 'Cybersecurity'));
  assert.equal(pathsFor(paths, '').length, paths.length);
  const next = nextSteps('aws-clf-c02', paths).flatMap((s) => s.certs);
  assert.ok(next.includes('aws-saa'));
  assert.ok(!next.includes('aws-clf-c02'));
  assert.equal(new Set(next).size, next.length);
  assert.deepEqual(nextSteps('isc2-cissp', paths).flatMap((s) => s.certs), []);
  const cc = all.find((c) => c.id === 'isc2-cc');
  const near = similar(cc, all, { exclude: ['comptia-security-plus'] });
  assert.ok(near.length > 0 && near.length <= 4);
  for (const c of near) {
    assert.equal(c.category, 'Cybersecurity');
    assert.ok(['entry', 'associate'].includes(c.level), c.id);
    assert.notEqual(c.id, 'comptia-security-plus');
  }
});

test('short names for the badges of a path chain', async () => {
  const { shortName } = await import('../site/lib/related.js');
  const expect = {
    'isc2-cc': 'CC',
    'microsoft-sc-900': 'SC-900',
    'comptia-security-plus': 'Security+',
    'comptia-cysa-plus': 'CySA+',
    'comptia-pentest-plus': 'PenTest+',
    'cisco-ccna': 'CCNA',
    'offsec-oscp': 'OSCP+',
    'ec-council-ceh': 'CEH v13',
    'ine-ejpt': 'eJPT',
    'aws-saa': 'SAA',
    'aws-clf-c02': 'CLF-C02',
    'hashicorp-terraform-associate': 'Terraform Associate',
    'databricks-data-engineer-associate': 'Data Engineer Associate',
    'securiti-ai-governance': 'AI Security & Governance',
    'google-cloud-digital-leader': 'CDL',
    'nvidia-ncp-aai': 'Agentic AI',
  };
  for (const [id, short] of Object.entries(expect)) assert.equal(shortName(all.find((c) => c.id === id)), short, id);
  // Every certification in a path gets a short label.
  for (const p of catalog.paths) for (const step of p.steps) for (const id of step.certs) assert.ok(shortName(all.find((c) => c.id === id)).length <= 24, id);
});
