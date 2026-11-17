// Spaced review of practice questions with Leitner boxes. No DOM here.
// A question you miss or mark joins the schedule in box 0 and is due at once. Each right answer
// on a due question moves it up a box and pushes the next review further out (INTERVALS); a
// wrong answer sends it back to box 0. Questions you never missed or marked are not scheduled.

export const REVIEW_VERSION = 1;
const DAY = 86400000;
/** Days to the next review after a right answer, by the box the question moves into (1 to 5). */
export const INTERVALS = [1, 3, 7, 16, 35];

export const emptyReview = () => ({ v: REVIEW_VERSION, cards: {} });

const isCard = (c) => c && Number.isInteger(c.box) && c.box >= 0 && c.box <= INTERVALS.length && Number.isFinite(c.due);

/**
 * The saved schedule, or a new one when there is none yet (or it is unreadable): questions the
 * practice history shows as missed start in box 0, due now, so mistakes made before review existed
 * come back too. Later versions of the format migrate here.
 */
export function loadReview(saved, history, now) {
  if (saved && saved.v === REVIEW_VERSION && saved.cards && typeof saved.cards === 'object') {
    const cards = {};
    for (const [id, c] of Object.entries(saved.cards)) if (isCard(c)) cards[id] = { box: c.box, due: c.due, lapses: c.lapses || 0 };
    return { v: REVIEW_VERSION, cards };
  }
  const review = emptyReview();
  for (const [id, h] of Object.entries(history?.questions || {})) if (h && h.wrong > 0) review.cards[id] = { box: 0, due: now, lapses: h.wrong };
  return review;
}

const put = (review, id, card) => ({ ...review, cards: { ...review.cards, [id]: card } });

/**
 * One graded answer. Wrong: back to box 0, due now. Right on a due question: up one box, due after
 * that box's interval. Right before it was due, or on a question not scheduled: nothing changes.
 */
export function answer(review, id, right, now) {
  const card = review.cards[id];
  if (!right) return put(review, id, { box: 0, due: now, lapses: (card?.lapses || 0) + 1 });
  if (!card || card.due > now) return review;
  const box = Math.min(card.box + 1, INTERVALS.length);
  return put(review, id, { ...card, box, due: now + INTERVALS[box - 1] * DAY });
}

/** A marked question is due now without moving up; a new one starts in box 0. */
export function mark(review, id, now) {
  const card = review.cards[id];
  return put(review, id, card ? { ...card, due: Math.min(card.due, now) } : { box: 0, due: now, lapses: 0 });
}

/** Fold a finished practice run into the schedule. A marked question that was answered right counts as marked, not as right. */
export function applyRun(review, { right, wrong }, marked, now) {
  const flagged = new Set(marked);
  let next = review;
  for (const id of wrong) next = answer(next, id, false, now);
  for (const id of right) if (!flagged.has(id)) next = answer(next, id, true, now);
  for (const id of flagged) next = mark(next, id, now);
  return next;
}

/**
 * Scheduled questions that are still in the set: `due` (lowest box first, then the longest
 * waiting) and `later` (soonest first). Questions removed from the set are skipped.
 */
export function queue(review, questions, now) {
  const ids = new Set(questions.map((q) => q.id));
  const rows = Object.entries(review.cards)
    .filter(([id]) => ids.has(id))
    .map(([id, c]) => ({ id, ...c }));
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    due: rows.filter((r) => r.due <= now).sort((a, b) => a.box - b.box || a.due - b.due || byId(a, b)),
    later: rows.filter((r) => r.due > now).sort((a, b) => a.due - b.due || byId(a, b)),
  };
}

/** Whole days from `now` until `due`, at least 1 for anything in the future. */
export const daysUntil = (due, now) => (due <= now ? 0 : Math.max(1, Math.round((due - now) / DAY)));
