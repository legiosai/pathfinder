import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyProfile, rank, scoreCert } from '../site/lib/match.js';

const cert = (over = {}) => ({
  id: 'x',
  level: 'associate',
  status: 'available',
  skills: ['agents', 'mcp'],
  roles: ['developer'],
  fee: { usd: 100 },
  exam: { style: 'knowledge' },
  requirements: '',
  ...over,
});

test('wanted skills and role raise the score', () => {
  const base = scoreCert(cert(), emptyProfile()).score;
  const keen = scoreCert(cert(), { ...emptyProfile(), want: ['agents', 'mcp'], roles: ['developer'] }).score;
  assert.ok(keen > base, `${keen} > ${base}`);
});

test('every point comes with a reason', () => {
  const r = scoreCert(cert(), { ...emptyProfile(), want: ['mcp'], known: ['agents'], roles: ['developer'] });
  assert.equal(r.reasons.length, 4);
  assert.match(r.reasons.join(' '), /mcp/);
});

test('budget and eligibility exclude, unknown price only warns', () => {
  const p = { ...emptyProfile(), budget: 50 };
  assert.match(scoreCert(cert(), p).excluded, /budget/);
  assert.equal(scoreCert(cert({ fee: { usd: null } }), p).excluded, null);
  assert.match(scoreCert(cert({ status: 'restricted', requirements: 'Partners only' }), emptyProfile()).excluded, /Restricted/);
  assert.equal(scoreCert(cert({ status: 'restricted', requirements: 'Partners only' }), { ...emptyProfile(), includeRestricted: true }).excluded, null);
});

test('level far above experience scores lower and warns', () => {
  const p = { ...emptyProfile(), experience: 'new' };
  const entry = scoreCert(cert({ level: 'entry' }), p);
  const expert = scoreCert(cert({ level: 'expert' }), p);
  assert.ok(entry.score > expert.score);
  assert.ok(expert.warnings.some((w) => /above/.test(w)));
});

test('rank puts excluded results last', () => {
  const list = [cert({ id: 'a', fee: { usd: 999 } }), cert({ id: 'b' })];
  const out = rank(list, { ...emptyProfile(), budget: 200 });
  assert.deepEqual(out.map((r) => r.id), ['b', 'a']);
});
