import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERVALS, REVIEW_VERSION, answer, applyRun, daysUntil, emptyReview, loadReview, mark, queue } from '../site/lib/review.js';

const DAY = 86400000;
const T0 = Date.UTC(2026, 10, 17, 9);
const at = (days) => T0 + days * DAY;
const questions = ['q1', 'q2', 'q3', 'q4'].map((id) => ({ id }));

test('a miss is due at once, in box 0', () => {
  const r = answer(emptyReview(), 'q1', false, T0);
  assert.deepEqual(r.cards.q1, { box: 0, due: T0, lapses: 1 });
  assert.deepEqual(queue(r, questions, T0).due.map((x) => x.id), ['q1']);
});

test('right answers on due questions climb the boxes and stretch the gap', () => {
  let r = answer(emptyReview(), 'q1', false, T0);
  let now = T0;
  const gaps = [];
  for (let i = 0; i < INTERVALS.length + 2; i++) {
    r = answer(r, 'q1', true, now);
    gaps.push((r.cards.q1.due - now) / DAY);
    now = r.cards.q1.due;
  }
  // The last box keeps its interval.
  assert.deepEqual(gaps, [1, 3, 7, 16, 35, 35, 35]);
  assert.equal(r.cards.q1.box, INTERVALS.length);
  assert.equal(r.cards.q1.lapses, 1);
});

test('a miss on review sends the question back to box 0', () => {
  let r = answer(emptyReview(), 'q1', false, T0);
  r = answer(r, 'q1', true, T0);
  r = answer(r, 'q1', true, at(1));
  assert.equal(r.cards.q1.box, 2);
  r = answer(r, 'q1', false, at(4));
  assert.deepEqual(r.cards.q1, { box: 0, due: at(4), lapses: 2 });
});

test('a right answer before the due date, or on a question never missed, changes nothing', () => {
  let r = answer(emptyReview(), 'q1', false, T0);
  r = answer(r, 'q1', true, T0);
  const before = r;
  assert.equal(answer(r, 'q1', true, at(0.5)), before);
  assert.equal(answer(r, 'q2', true, T0), before);
  assert.equal(r.cards.q2, undefined);
});

test('answers never change the schedule they were given', () => {
  const start = answer(emptyReview(), 'q1', false, T0);
  const copy = structuredClone(start);
  answer(start, 'q1', true, T0);
  answer(start, 'q2', false, T0);
  mark(start, 'q1', T0);
  applyRun(start, { right: ['q1'], wrong: ['q3'] }, ['q4'], T0);
  assert.deepEqual(start, copy);
});

test('marking schedules a question now without moving it up', () => {
  let r = mark(emptyReview(), 'q2', T0);
  assert.deepEqual(r.cards.q2, { box: 0, due: T0, lapses: 0 });
  r = answer(answer(r, 'q2', true, T0), 'q2', true, at(1));
  assert.deepEqual([r.cards.q2.box, r.cards.q2.due], [2, at(4)]);
  r = mark(r, 'q2', at(2));
  assert.deepEqual([r.cards.q2.box, r.cards.q2.due], [2, at(2)]);
});

test('a finished run schedules misses and marks; a marked right answer does not climb', () => {
  let r = answer(answer(emptyReview(), 'q1', false, T0), 'q1', true, T0);
  r = answer(answer(r, 'q4', false, T0), 'q4', true, T0);
  // q1 and q4 are both due on day 1. q4 is answered right but marked as unsure.
  r = applyRun(r, { right: ['q1', 'q2', 'q4'], wrong: ['q3'] }, ['q4'], at(1));
  assert.deepEqual([r.cards.q1.box, r.cards.q1.due], [2, at(4)]);
  assert.equal(r.cards.q2, undefined, 'right and never missed: not scheduled');
  assert.deepEqual(r.cards.q3, { box: 0, due: at(1), lapses: 1 });
  assert.deepEqual([r.cards.q4.box, r.cards.q4.due], [1, at(1)]);
  // Marked but left unanswered still comes back.
  assert.equal(applyRun(emptyReview(), { right: [], wrong: [] }, ['q2'], T0).cards.q2.due, T0);
});

test('the queue serves due questions first: lowest box, then the longest waiting', () => {
  const r = {
    v: REVIEW_VERSION,
    cards: {
      q1: { box: 2, due: at(-1), lapses: 1 },
      q2: { box: 0, due: at(0), lapses: 1 },
      q3: { box: 0, due: at(-2), lapses: 2 },
      q4: { box: 1, due: at(3), lapses: 1 },
      gone: { box: 0, due: at(-5), lapses: 1 },
    },
  };
  const { due, later } = queue(r, questions, T0);
  assert.deepEqual(due.map((x) => x.id), ['q3', 'q2', 'q1'], 'a question no longer in the set is skipped');
  assert.deepEqual(later.map((x) => x.id), ['q4']);
  assert.equal(daysUntil(later[0].due, T0), 3);
  assert.equal(daysUntil(T0 + 3600000, T0), 1);
  assert.equal(daysUntil(T0, T0), 0);
});

test('saved schedules load; old or missing data starts from the practice history', () => {
  const saved = { v: REVIEW_VERSION, cards: { q1: { box: 3, due: at(5), lapses: 2 }, bad: { box: 'x' }, worse: null } };
  assert.deepEqual(loadReview(saved, null, T0), { v: REVIEW_VERSION, cards: { q1: { box: 3, due: at(5), lapses: 2 } } });
  // Practice history saved before review existed: { attempts, questions: { id: { seen, wrong, last } } }.
  const history = { attempts: [], questions: { q1: { seen: 3, wrong: 2, last: null }, q2: { seen: 1, wrong: 0, last: null } } };
  const seeded = { v: REVIEW_VERSION, cards: { q1: { box: 0, due: T0, lapses: 2 } } };
  assert.deepEqual(loadReview(null, history, T0), seeded);
  assert.deepEqual(loadReview('garbage', history, T0), seeded);
  assert.deepEqual(loadReview({ cards: {} }, history, T0), seeded, 'no version: read as old data');
  assert.deepEqual(loadReview(undefined, undefined, T0), emptyReview());
});
