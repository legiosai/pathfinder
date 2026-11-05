import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, validate, bundle } from '../scripts/catalog.mjs';
import { buildRun, domainCounts, emptyHistory, grade, isCorrect, minutesFor, mistakes, mistakesCsv, record, totals, validatePractice } from '../site/lib/practice.js';

const root = new URL('..', import.meta.url).pathname;
const domains = [
  { name: 'A', weight: 24 },
  { name: 'B', weight: 30 },
  { name: 'C', weight: 34 },
  { name: 'D', weight: 12 },
];
const make = (id, domain, correct = ['A']) => ({
  id,
  domain,
  correct,
  prompt: { en: `${id} en`, es: `${id} es` },
  explanation: { en: 'why', es: 'por qué' },
  options: ['A', 'B', 'C', 'D'].map((key) => ({ key, text: { en: key, es: key } })),
});
const questions = domains.flatMap((d) => Array.from({ length: 30 }, (_, i) => make(`${d.name}${i}`, d.name)));

test('counts follow the exam weights and add up', () => {
  assert.deepEqual(domainCounts(domains, 65), [16, 19, 22, 8]);
  assert.deepEqual(domainCounts(domains, 10), [2, 3, 4, 1]);
  assert.equal(domainCounts(domains, 7).reduce((t, c) => t + c, 0), 7);
});

test('a run has no repeats, prefers unseen questions and tops up short domains', () => {
  const seen = new Set(questions.filter((q) => q.domain === 'A').slice(0, 25).map((q) => q.id));
  const ids = buildRun({ questions, domains, size: 65, seen });
  assert.equal(ids.length, 65);
  assert.equal(new Set(ids).size, 65);
  const a = ids.filter((id) => id.startsWith('A'));
  assert.ok(a.filter((id) => !seen.has(id)).length === 5, 'all five unseen A questions are used');
  const few = [make('A0', 'A'), make('C0', 'C'), make('C1', 'C'), make('C2', 'C')];
  assert.equal(buildRun({ questions: few, domains, size: 4 }).length, 4);
  assert.equal(buildRun({ questions: few, domains, size: 65 }).length, 4);
});

test('shorter runs keep the exam pace', () => {
  assert.equal(minutesFor({ minutes: 90, questions: 65 }, 65), 90);
  assert.equal(minutesFor({ minutes: 90, questions: 65 }, 10), 14);
});

test('multiple response needs every key and no extras', () => {
  const q = make('x', 'A', ['A', 'C']);
  assert.ok(isCorrect(q, ['C', 'A']));
  assert.ok(!isCorrect(q, ['A']));
  assert.ok(!isCorrect(q, ['A', 'B', 'C']));
});

test('unanswered questions do not count against you', () => {
  const ids = ['A0', 'B0', 'C0', 'D0'];
  const r = grade({ questions, domains, ids, answers: { A0: ['A'], B0: ['B'], C0: [] } });
  assert.equal(r.total, 4);
  assert.equal(r.n, 2);
  assert.equal(r.ok, 1);
  assert.equal(r.unanswered, 2);
  assert.equal(r.pct, 50);
  // Normalized over A (24, right) and B (30, wrong): 24 / 54.
  assert.equal(r.weighted, 44);
  assert.equal(r.per.find((d) => d.name === 'C').pct, null);
  assert.equal(grade({ questions, domains, ids, answers: {} }).pct, null);
});

test('history records attempts and mistakes, not unanswered questions', () => {
  const ids = ['A0', 'B0', 'C0'];
  const first = { A0: ['B'], B0: ['A'] };
  let h = record(emptyHistory(), grade({ questions, domains, ids, answers: first }), first, 1);
  const second = { A0: ['C'] };
  h = record(h, grade({ questions, domains, ids, answers: second }), second, 2);
  assert.equal(h.attempts.length, 2);
  assert.deepEqual(h.questions.A0, { seen: 2, wrong: 2, last: ['C'] });
  assert.equal(h.questions.C0, undefined);
  assert.equal(totals(h, domains)[0].n, 2);
  const rows = mistakes(h, questions);
  assert.equal(rows[0].question.id, 'A0');
  assert.match(mistakesCsv([{ ...rows[0], question: { ...rows[0].question, prompt: { en: 'say "hi", ok' } } }], 'en'), /"say ""hi"", ok"/);
});

test('validation catches broken practice questions', () => {
  const cert = { id: 'c', domains };
  const bad = { ...make('x', 'Nope', ['Z']), prompt: { en: 'only english' } };
  const errors = validatePractice({ cert: 'c', license: 'CC BY 4.0', questions: [bad, make('x', 'A')] }, cert);
  assert.ok(errors.some((e) => e.includes('not in the certification')));
  assert.ok(errors.some((e) => e.includes('correct key Z')));
  assert.ok(errors.some((e) => e.includes('missing es text')));
  assert.ok(errors.some((e) => e.includes('duplicate id')));
  assert.ok(validatePractice({ cert: 'nope', questions: [] }, undefined).some((e) => e.includes('unknown certification')));
});

test('the shipped practice set matches its certification', async () => {
  const data = await loadCatalog(root);
  assert.deepEqual(validate(data), []);
  const set = data.practice.find((s) => s.cert === 'aws-clf-c02');
  assert.ok(set.questions.length >= 34);
  const cert = bundle(data, '2026-01-01').certifications.find((c) => c.id === 'aws-clf-c02');
  assert.equal(cert.practice_questions, set.questions.length);
});
