import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCatalog, validate, bundle } from '../scripts/catalog.mjs';

const root = new URL('..', import.meta.url).pathname;

test('the shipped catalog is valid', async () => {
  const data = await loadCatalog(root);
  assert.deepEqual(validate(data), []);
  assert.ok(data.certifications.length >= 40);
});

test('validation catches broken references and weights', async () => {
  const data = await loadCatalog(root);
  const cert = structuredClone(data.certifications[0]);
  cert.sources = ['NOPE'];
  cert.skills = ['not-a-skill'];
  cert.domains = [{ name: 'A', weight: 60 }];
  cert.domains_note = 'test';
  const errors = validate({ ...data, certifications: [cert] });
  assert.ok(errors.some((e) => e.includes('unknown source NOPE')));
  assert.ok(errors.some((e) => e.includes('unknown skill')));
  assert.ok(errors.some((e) => e.includes('add up to 60')));
});

test('restricted certifications explain their requirements', async () => {
  const data = await loadCatalog(root);
  for (const c of data.certifications.filter((c) => c.status === 'restricted')) {
    assert.ok(c.requirements.length > 20, c.id);
  }
});

test('the public data carries no private or personal markers', async () => {
  const data = await loadCatalog(root);
  const text = JSON.stringify(bundle(data, '2026-01-01'));
  for (const marker of [/Teramot/i, /tech-certifications/i, /VT-Cert/i, /\bValen\b/, /Amey-Thakur/i]) {
    assert.doesNotMatch(text, marker);
  }
  const site = await readFile(new URL('../site/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(site, /https?:\/\/(?!legiosai\.github\.io|github\.com\/legiosai)[a-z]/i, 'no external calls from the app');
});

test('the Claude exams carry the official guide as a resource and official weights', async () => {
  const data = await loadCatalog(root);
  for (const id of ['claude-architect-foundations', 'claude-developer-foundations', 'claude-architect-professional', 'claude-associate-foundations']) {
    const c = data.certifications.find((x) => x.id === id);
    assert.equal(c.prep[0].kind, 'official-guide', id);
    assert.match(c.domains_note, /official exam guide/, id);
  }
});

test('study paths only name certifications from the catalog, with notes in both languages', async () => {
  const data = await loadCatalog(root);
  assert.ok(data.paths.length >= 5);
  const paths = structuredClone(data.paths);
  paths[0].steps[0].certs.push('not-a-cert');
  paths[0].steps[1].note = { en: 'only English' };
  const errors = validate({ ...data, paths });
  assert.ok(errors.some((e) => e.includes('unknown certification not-a-cert')));
  assert.ok(errors.some((e) => e.includes('note needs en and es')));
  assert.ok(bundle(data, '2026-11-17').paths.length === data.paths.length);
});

test('languages, delivery, access and timeline are checked when present', async () => {
  const data = await loadCatalog(root);
  const source = data.sources[0].id;
  const withCert = (cert) => ({ ...data, certifications: [cert, ...data.certifications.slice(1)] });
  const good = structuredClone(data.certifications[0]);
  good.exam.languages = ['en', 'es-419', 'pt-BR', 'zh-Hant'];
  good.exam.delivery = ['online', 'test-center'];
  good.access = {
    free_routes: [{ text: 'Free voucher program', url: 'https://example.com/free', until: '2026-12-31' }],
    discounts: [{ text: 'Student price', url: 'https://example.com/students' }],
    retake: 'Wait 14 days and pay again.',
    accommodations: 'Non-native English speakers can ask for 30 more minutes.',
  };
  good.timeline = [
    { date: '2026-12-01', kind: 'changes', text: 'New scoring', source },
    { date: '2027-03-23', kind: 'retires', text: 'Old version retires', source },
  ];
  good.prep = [{ title: 'Curso', url: 'https://example.com/es', kind: 'course', cost: 'free', lang: 'es' }];
  assert.deepEqual(validate(withCert(good)), []);

  const bad = structuredClone(good);
  bad.exam.languages = ['English', 'en', 'en'];
  bad.exam.delivery = ['online', 'home'];
  bad.access = { free_routes: [{ text: '', url: 'not a url', until: '31/12/2026' }], retake: '', perks: 'x' };
  bad.timeline = [
    { date: '2027-01-01', kind: 'ends', text: 'x', source: 'NOPE' },
    { date: '2026-02-30', kind: 'changes', text: 'x', source },
  ];
  bad.prep[0].lang = 'spanish';
  const errors = validate(withCert(bad));
  for (const expected of ['"English" is not a language code', 'languages has duplicates', 'delivery must only contain', 'access.free_routes entry needs a text', 'bad access.free_routes url', 'until must be YYYY-MM-DD', 'access.retake must be a sentence', 'unknown key perks', 'timeline kind must be one of', 'timeline: unknown source NOPE', 'needs a date', 'prep lang "spanish"']) {
    assert.ok(errors.some((e) => e.includes(expected)), expected);
  }
  bad.exam.languages = [];
  bad.timeline = [good.timeline[1], good.timeline[0]];
  const more = validate(withCert(bad));
  assert.ok(more.some((e) => e.includes('exam.languages must be a non-empty list')));
  assert.ok(more.some((e) => e.includes('timeline must be sorted by date')));
});

test('regions need text in both languages, known sources and a check date', async () => {
  const data = await loadCatalog(root);
  const source = data.sources[0].id;
  const regions = { AR: { en: 'Card payments add a tax.', es: 'Pagar con tarjeta suma un impuesto.', sources: [source], checked_on: '2026-11-17' } };
  assert.deepEqual(validate({ ...data, regions }), []);
  assert.deepEqual(bundle({ ...data, regions }, '2026-11-17').regions, regions);
  const errors = validate({ ...data, regions: { Argentina: { en: 'x', sources: ['NOPE'], checked_on: 'today' } } });
  for (const expected of ['two-letter region code', 'needs es text', 'unknown source NOPE', 'checked_on must be YYYY-MM-DD']) {
    assert.ok(errors.some((e) => e.includes(expected)), expected);
  }
  const sources = [...data.sources, { id: 'TMP', title: 't', url: 'https://example.com', checked_on: '2026-13-01' }];
  assert.ok(validate({ ...data, sources }).some((e) => e.includes('sources.json TMP: checked_on')));
});
