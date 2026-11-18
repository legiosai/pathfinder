import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STUDY_KEYS, createStudyBackup, hasStudyData, parseStudyBackup, restoreStudyBackup } from '../site/lib/backup.js';

const cert = 'aws-clf-c02';
const progress = `${STUDY_KEYS.progress}${cert}:2026-11-18`;
const schedule = `${STUDY_KEYS.resched}${cert}:2026-11-18`;
const rating = `${STUDY_KEYS.confidence}${cert}`;
const history = `${STUDY_KEYS.practice}${cert}`;
const review = `${STUDY_KEYS.practice}review:${cert}`;
const run = `${STUDY_KEYS.practice}run:${cert}`;
const chat = 'pathfinder:chat';
const theme = 'pathfinder:theme';
const when = Date.parse('2026-11-18T15:00:00Z');

// Includes the fields that existed before practice attempts had metadata for the mode and plan.
const study = {
  [STUDY_KEYS.plans]: { [progress]: { cert, hours: '18', start: '2026-11-18', days: '1,3,5' } },
  [progress]: [1, 3],
  [rating]: { 'Cloud Concepts': 2 },
  [schedule]: { sig: '12:18:2026-12-14', on: '2026-11-18', dates: { 2: '2026-11-20' }, skipped: [4], prev: null },
  [history]: {
    attempts: [{
      id: `a${when}`, when, n: 1, total: 10, ok: 0, pct: 0, weighted: 0,
      per: [{ name: 'Cloud Concepts', weight: 24, n: 1, ok: 0, pct: 0 }],
      wrong: ['clf-001'], answers: { 'clf-001': ['B'] },
    }],
    questions: { 'clf-001': { seen: 1, wrong: 1, last: ['B'] } },
  },
  [review]: { v: 1, cards: { 'clf-001': { box: 0, due: when, lapses: 1 } } },
};

function memoryStorage(seed = {}, quota = Infinity) {
  const items = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    get length() { return items.size; },
    key(index) { return [...items.keys()][index] ?? null; },
    getItem(key) { return items.get(key) ?? null; },
    setItem(key, value) {
      const next = new Map(items).set(key, value);
      const size = [...next].reduce((total, [k, v]) => total + k.length + v.length, 0);
      if (size > quota) throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      items.set(key, value);
    },
    removeItem(key) { items.delete(key); },
    contents() { return Object.fromEntries([...items].map(([key, value]) => [key, JSON.parse(value)])); },
  };
}

test('a backup round trips the saved study data across browsers', () => {
  const source = memoryStorage({ ...study, [chat]: 'private chat', [theme]: 'dark', [run]: { inProgress: true } });
  const otherProgress = `${STUDY_KEYS.progress}aws-saa:2026-11-18`;
  const destination = memoryStorage({ [otherProgress]: [1], [chat]: 'another chat', [theme]: 'light', [run]: { inProgress: true } });
  assert.equal(hasStudyData(source), true);
  assert.equal(hasStudyData(memoryStorage({ [chat]: 'private chat', [run]: {} })), false);

  const text = createStudyBackup(source, new Date(when));
  assert.equal(JSON.parse(text).createdAt, new Date(when).toISOString());
  const parsed = parseStudyBackup(text);
  assert.deepEqual(parsed, study);
  restoreStudyBackup(destination, parsed);
  restoreStudyBackup(destination, parsed);
  assert.deepEqual(destination.contents(), { ...study, [chat]: 'another chat', [theme]: 'light', [run]: { inProgress: true } });
});

test('invalid backups and keys outside study data are rejected before writes', () => {
  const original = { [progress]: [1], [theme]: 'light' };
  const storage = memoryStorage(original);
  const envelope = JSON.parse(createStudyBackup(storage));
  assert.throws(() => parseStudyBackup('broken JSON'));
  assert.throws(() => parseStudyBackup(JSON.stringify({ ...envelope, version: 2 })));
  for (const data of [
    { [theme]: 'dark' },
    { [run]: {} },
    { [progress]: ['1'] },
    { [STUDY_KEYS.plans]: { [progress]: { ...study[STUDY_KEYS.plans][progress], days: '8' } } },
    { [STUDY_KEYS.plans]: { [progress]: { ...study[STUDY_KEYS.plans][progress], hours: '1e20' } } },
    { [schedule]: { ...study[schedule], dates: { 2: '2026-02-31' } } },
    { [history]: { ...study[history], attempts: [{ ...study[history].attempts[0], pct: '<img src=x>' }] } },
    JSON.parse('{"__proto__": {}}'),
  ]) {
    assert.throws(() => restoreStudyBackup(storage, data));
    assert.throws(() => parseStudyBackup(JSON.stringify({ ...envelope, data })));
    assert.deepEqual(storage.contents(), original);
  }
});

test('a full browser keeps its previous study data when a restore runs out of space', () => {
  const original = { [progress]: [9], [rating]: { 'Cloud Concepts': 3 }, [theme]: 'dark' };
  const storage = memoryStorage(original, 250);
  assert.throws(() => restoreStudyBackup(storage, { [progress]: [1], [history]: study[history] }), { name: 'QuotaExceededError' });
  assert.deepEqual(storage.contents(), original);
  restoreStudyBackup(storage, { [progress]: [2] });
  assert.deepEqual(storage.contents(), { [progress]: [2], [theme]: 'dark' });
});
