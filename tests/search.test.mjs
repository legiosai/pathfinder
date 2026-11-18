import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compact, createSearch, keys, readQuery } from '../site/lib/search.js';
import { bundle, loadCatalog } from '../scripts/catalog.mjs';
import Fuse from '../site/vendor/fuse.js';

const { certifications } = bundle(await loadCatalog(new URL('..', import.meta.url).pathname), '2026-11-17');
const search = createSearch(certifications, Fuse);
const has = (id) => certifications.some((c) => c.id === id);

test('compact forms ignore case, spaces, hyphens and accents, and read + as plus', () => {
  assert.equal(compact('Security+'), 'securityplus');
  assert.equal(compact('AZ-900'), 'az900');
  assert.equal(compact(' az 900 '), 'az900');
  assert.equal(compact('Ciberseguridad Básica'), 'ciberseguridadbasica');
});

test('codes, nicknames and spellings of a code find the one certification', () => {
  const cases = {
    'security plus': 'comptia-security-plus',
    'Security+': 'comptia-security-plus',
    'sec+': 'comptia-security-plus',
    secplus: 'comptia-security-plus',
    'pentest+': 'comptia-pentest-plus',
    cysa: 'comptia-cysa-plus',
    az900: 'microsoft-az-900',
    'az 900': 'microsoft-az-900',
    'AZ-900': 'microsoft-az-900',
    saa: 'aws-saa',
    'saa-c03': 'aws-saa',
    clf: 'aws-clf-c02',
    'CLF-C02': 'aws-clf-c02',
    cka: 'lf-cka',
    ckad: 'lf-ckad',
    ccna: 'cisco-ccna',
    oscp: 'offsec-oscp',
    'pen-200': 'offsec-oscp',
    ceh: 'ec-council-ceh',
    ejpt: 'ine-ejpt',
    cc: 'isc2-cc',
  };
  for (const [q, id] of Object.entries(cases)) {
    const r = search(q);
    assert.deepEqual(r.exact, [id], q);
    assert.deepEqual(r.ids, [id], q);
  }
});

test('nicknames of certifications added later work once they are in the catalog', () => {
  for (const [q, id] of [['net+', 'comptia-network-plus'], ['a+', 'comptia-a-plus']]) {
    if (has(id)) assert.deepEqual(search(q).exact, [id], q);
  }
});

test('"ccna" does not list the Claude certifications', () => {
  assert.ok(!search('ccna').ids.some((id) => id.startsWith('claude-')));
});

test('"free" and "gratis" list the free certifications instead of matching words', () => {
  const free = certifications.filter((c) => c.fee.usd === 0).map((c) => c.id);
  assert.ok(free.length > 0);
  for (const q of ['free', 'gratis', 'Gratuitas', 'sin costo']) {
    const r = search(q);
    assert.equal(r.free, true, q);
    assert.deepEqual([...r.ids].sort(), [...free].sort(), q);
  }
  assert.ok(!search('gratis').ids.includes('giac-gaips'));
  // With other words, it narrows them.
  const awsFree = search('free aws').ids;
  assert.ok(awsFree.length > 0);
  for (const id of awsFree) assert.equal(certifications.find((c) => c.id === id).fee.usd, 0, id);
  assert.deepEqual(readQuery('cursos gratis de aws'), { text: 'cursos de aws', free: true });
});

test('a name leads, and words still search names, providers and topics', () => {
  const agentic = search('agentic ai');
  assert.equal(agentic.exact.length, 0, 'a generic name is not a code');
  assert.equal(agentic.ids[0], 'nvidia-ncp-aai');
  assert.ok(agentic.ids.length > 3);
  assert.ok(search('aws').ids.every((id, i, ids) => i >= 10 || certifications.find((c) => c.id === id).provider === 'AWS'));
  assert.equal(search('pentest').ids[0], 'comptia-pentest-plus');
  assert.ok(search('kubernetes').ids.includes('lf-cka'));
  // A code used as a name ("Data Engineer Associate") is not a code: the AWS one shows too.
  assert.ok(search('data engineer associate').ids.includes('aws-dea-c01'));
  assert.deepEqual(search('').ids, []);
});

test('extra text per certification, such as a translated category, is searched too', () => {
  const es = createSearch(certifications, Fuse, { doc: (c) => ({ category: c.category === 'Cybersecurity' ? 'Cybersecurity Ciberseguridad' : c.category }) });
  assert.ok(es('ciberseguridad').ids.includes('isc2-cc'));
});

test('every certification answers to its own code', () => {
  for (const c of certifications) {
    const { codes, names } = keys(c);
    assert.ok(codes.has(compact(c.code)) || names.has(compact(c.code)), c.id);
    assert.ok(search(c.code).ids.includes(c.id), c.code);
  }
});
