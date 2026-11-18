// Preserve the version 1 file format, including data from the retired Plan and Progress views.
export const STUDY_KEYS = {
  plans: 'pathfinder:plans',
  progress: 'pathfinder:progress:',
  confidence: 'pathfinder:confidence:',
  resched: 'pathfinder:resched:',
  practice: 'pathfinder:practice:',
};

const FORMAT = 'pathfinder-study-backup';
const VERSION = 1;
const MAX_PLAN_SESSIONS = 10_000;
const REVIEW_VERSION = 1;
const LAST_REVIEW_BOX = 5;

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const test = (pattern, value) => typeof value === 'string' && pattern.test(value);
const certId = (value) => test(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, value);
const questionId = (value) => test(/^[a-z0-9][a-z0-9_.-]*$/i, value);
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const session = (value) => count(value) && value > 0;
const sessions = (value) => Array.isArray(value) && value.every(session);
const pct = (value) => value === null || (Number.isFinite(value) && value >= 0 && value <= 100);
const timestamp = (value) => count(value) && value <= 8.64e15;
const nullable = (value, valid) => value == null || valid(value);
const entriesMatch = (value, valid) => object(value) && Object.entries(value).every(([key, entry]) => valid(key, entry));

function date(value) {
  if (!test(/^\d{4}-\d{2}-\d{2}$/, value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(`${value}T`);
}

function planKey(key, prefix = STUDY_KEYS.progress) {
  if (!key.startsWith(prefix)) return '';
  const [id, start, extra] = key.slice(prefix.length).split(':');
  return extra === undefined && certId(id) && date(start) ? id : '';
}

function planSettings(value, id) {
  if (!object(value) || value.cert !== id || !date(value.start)) return false;
  const hours = Number(value.hours);
  const minutes = Number(value.len) || 90;
  // Keep the same limits as the original backup format.
  return hours > 0 && Number.isFinite(hours * 60) && session(minutes) && minutes >= 15 &&
    hours * 60 / minutes <= MAX_PLAN_SESSIONS && test(/^[0-6](?:,[0-6]){0,6}$/, value.days) &&
    (!value.time || test(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, value.time)) &&
    (!value.exam || date(value.exam));
}

const plans = (value) => entriesMatch(value, (key, settings) => {
  const id = planKey(key);
  return id && planSettings(settings, id);
});

const confidence = (value) => entriesMatch(value, (_, rating) => session(rating) && rating <= 5);
const moves = (value) => object(value) && date(value.on) && sessions(value.skipped) &&
  entriesMatch(value.dates, (n, day) => /^\d+$/.test(n) && session(Number(n)) && date(day));
const reschedule = (value) => value === null || (moves(value) && typeof value.sig === 'string' && nullable(value.prev, moves));

const choices = (value) => Array.isArray(value) && value.every((choice) => test(/^[A-Z]$/, choice));
const score = (value) => object(value) && count(value.n) && count(value.ok) && value.ok <= value.n && pct(value.pct);
const domainScore = (value) => score(value) && typeof value.name === 'string' && Number.isFinite(value.weight);

function attempt(value) {
  return score(value) && questionId(value.id) && timestamp(value.when) && count(value.total) && value.n <= value.total &&
    pct(value.weighted) && Array.isArray(value.per) && value.per.every(domainScore) &&
    Array.isArray(value.wrong) && value.wrong.every(questionId) &&
    entriesMatch(value.answers, (id, answer) => questionId(id) && choices(answer)) &&
    nullable(value.from, (from) => object(from) && typeof from.key === 'string' && planKey(from.key) && session(from.n));
}

const history = (value) => object(value) && Array.isArray(value.attempts) && value.attempts.every(attempt) &&
  entriesMatch(value.questions, (id, q) => questionId(id) && object(q) && count(q.seen) && count(q.wrong) &&
    q.wrong <= q.seen && nullable(q.last, choices));
const review = (value) => object(value) && value.v === REVIEW_VERSION &&
  entriesMatch(value.cards, (id, card) => questionId(id) && object(card) && count(card.box) && card.box <= LAST_REVIEW_BOX &&
    timestamp(card.due) && nullable(card.lapses, count));

function validator(key) {
  if (key === STUDY_KEYS.plans) return plans;
  if (planKey(key)) return sessions;
  if (planKey(key, STUDY_KEYS.resched)) return reschedule;
  if (key.startsWith(STUDY_KEYS.confidence) && certId(key.slice(STUDY_KEYS.confidence.length))) return confidence;
  if (!key.startsWith(STUDY_KEYS.practice)) return null;
  const practice = key.slice(STUDY_KEYS.practice.length);
  if (certId(practice)) return history;
  if (practice.startsWith('review:') && certId(practice.slice('review:'.length))) return review;
  return null;
}

function readStudyData(storage) {
  const values = new Map();
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key === null || !validator(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) values.set(key, value);
  }
  return values;
}

function validateData(data) {
  if (!entriesMatch(data, (key, value) => validator(key)?.(value))) throw new Error('Invalid study data');
}

export function hasStudyData(storage) {
  return readStudyData(storage).size > 0;
}

export function createStudyBackup(storage, now = new Date()) {
  const data = Object.fromEntries([...readStudyData(storage)].map(([key, value]) => [key, JSON.parse(value)]));
  validateData(data);
  return JSON.stringify({ format: FORMAT, version: VERSION, createdAt: now.toISOString(), data });
}

export function parseStudyBackup(text) {
  const backup = JSON.parse(text);
  if (!object(backup) || backup.format !== FORMAT || backup.version !== VERSION) throw new Error('Unsupported study backup');
  validateData(backup.data);
  return backup.data;
}

/** Replace the study snapshot, keeping the original values if storage runs out of space. */
export function restoreStudyBackup(storage, data) {
  validateData(data);
  const previous = readStudyData(storage);
  const incoming = new Map(Object.entries(data).map(([key, value]) => [key, JSON.stringify(value)]));
  const changed = [...new Set([...previous.keys(), ...incoming.keys()])].filter((key) => previous.get(key) !== incoming.get(key));
  const removed = [];
  const written = [];
  try {
    // Clear space for changed records before writing their replacements.
    for (const key of changed) {
      if (!previous.has(key)) continue;
      storage.removeItem(key);
      removed.push(key);
    }
    for (const key of changed) {
      if (!incoming.has(key)) continue;
      storage.setItem(key, incoming.get(key));
      written.push(key);
    }
  } catch (error) {
    for (const key of written) storage.removeItem(key);
    for (const key of removed) storage.setItem(key, previous.get(key));
    throw error;
  }
}
