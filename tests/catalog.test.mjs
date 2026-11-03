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
