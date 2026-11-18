// The chat's rules, kept apart from the page so Node tests can import them: what goes to the
// endpoint, when the on-device matcher answers instead, what is saved, and how the assistant's text
// becomes HTML. No DOM, no storage and no network here; site/chat.js does those.
//
// The endpoint (POST {api}/chat) takes { messages, lang, profile? }: messages alternate, start and end
// with the user, at most 20 of them, the user's at most 1,000 characters each and the assistant's
// 4,000. Assistant messages carry the ids of the certifications shown with them (cards, roadmap and
// comparison) in `picks`, so the model knows what the person has seen; their text may be empty when
// they have picks. `profile` is what the endpoint's `profile` events recorded, sent back each turn.
//
// Besides `text`, `done` and `error`, the stream may carry `picks` (cards, each with an optional
// warning), `roadmap`, `comparison`, `profile` and `replies`; read*() below check their shape.

export const LIMITS = { messages: 20, chars: 1000, answerChars: 4000, stored: 20 };
export const STORE_VERSION = 1;
/** Seconds to wait after a 429 that did not say how long. */
export const RETRY_AFTER = 30;
/** No first byte in this long and the matcher answers instead. */
export const FIRST_BYTE_MS = 20000;
/** A stream that goes quiet this long after it started is treated as cut. */
export const STALL_MS = 45000;

/** Ids an answer showed: its cards, then its roadmap and comparison, each once. */
export const shownIds = (m) => [...new Set([...(m.picks || []).map((p) => p.id), ...(m.roadmap?.steps || []).map((s) => s.id), ...(m.comparison || [])])];

/** The request body for the conversation so far. Empty answers without picks are left out. */
export function toRequest(messages, lang, profile = null) {
  const list = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const content = String(m.content ?? '').trim();
    const shown = m.role === 'assistant' ? shownIds(m) : [];
    const picks = shown.length ? shown.slice(0, 10) : null;
    if (!content && !picks) continue;
    const item = m.role === 'user' ? { role: 'user', content: content.slice(0, LIMITS.chars) } : { role: 'assistant', content: content.slice(0, LIMITS.answerChars) };
    if (picks) item.picks = picks;
    // Two in a row from the same side: the later one stands (a resent question, a retried answer).
    if (list.length && list.at(-1).role === item.role) list[list.length - 1] = item;
    else list.push(item);
  }
  while (list.length && list.at(-1).role !== 'user') list.pop();
  let start = Math.max(0, list.length - LIMITS.messages);
  while (start < list.length && list[start].role !== 'user') start++;
  const body = { messages: list.slice(start), lang: lang === 'es' ? 'es' : 'en' };
  const kept = readProfile(profile);
  if (Object.keys(kept).length) body.profile = kept;
  return body;
}

// ---------- what the stream carries besides text ----------
// Shapes only: whether an id is in this page's catalog is checked when the answer is complete
// (keepKnown), after the page had a chance to load a newer catalog.

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isId = (x) => typeof x === 'string' && x.length <= 100 && ID.test(x);
const line = (x, max) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

/** Cards: [{ id, why, warning? }], distinct ids, at most five. */
export function readPicks(data) {
  const out = [];
  for (const p of Array.isArray(data?.picks) ? data.picks : []) {
    if (!isObj(p) || !isId(p.id) || out.some((x) => x.id === p.id) || out.length >= 5) continue;
    const pick = { id: p.id, why: line(p.why, 400) };
    const warning = line(p.warning, 240);
    if (warning) pick.warning = warning;
    out.push(pick);
  }
  return out;
}

/** A roadmap: { steps: [{ id, weeks, note }], hours_per_week? } with at least two steps, or null. */
export function readRoadmap(data) {
  const steps = [];
  for (const s of Array.isArray(data?.steps) ? data.steps : []) {
    if (!isObj(s) || !isId(s.id) || steps.some((x) => x.id === s.id) || steps.length >= 6) continue;
    const weeks = Number.isFinite(s.weeks) && s.weeks >= 1 ? Math.min(104, Math.round(s.weeks)) : null;
    steps.push({ id: s.id, weeks, note: line(s.note, 200) });
  }
  if (steps.length < 2) return null;
  const roadmap = { steps };
  if (Number.isFinite(data.hours_per_week) && data.hours_per_week > 0 && data.hours_per_week <= 100) roadmap.hours_per_week = data.hours_per_week;
  return roadmap;
}

/** Two to four distinct ids to compare, or []. */
export function readComparison(data) {
  const ids = [...new Set((Array.isArray(data?.ids) ? data.ids : []).filter(isId))].slice(0, 4);
  return ids.length >= 2 ? ids : [];
}

/** Up to four short replies to offer as buttons. */
export function readReplies(data) {
  const out = [];
  for (const r of Array.isArray(data?.replies) ? data.replies : []) {
    const text = line(r, 80);
    if (text && !out.some((x) => x.toLowerCase() === text.toLowerCase()) && out.length < 4) out.push(text);
  }
  return out;
}

const EXPERIENCE = ['new', 'some', 'experienced'];

/** The valid fields of a profile (the endpoint's `profile` event, or one saved here). */
export function readProfile(data) {
  const p = isObj(data?.profile) ? data.profile : data;
  const out = {};
  if (!isObj(p)) return out;
  if (line(p.role, 80)) out.role = line(p.role, 80);
  if (EXPERIENCE.includes(p.experience)) out.experience = p.experience;
  if (line(p.goal, 160)) out.goal = line(p.goal, 160);
  if (Number.isFinite(p.budget_usd) && p.budget_usd >= 0 && p.budget_usd <= 100000) out.budget_usd = Math.round(p.budget_usd);
  if (Number.isFinite(p.hours_per_week) && p.hours_per_week > 0 && p.hours_per_week <= 100) out.hours_per_week = p.hours_per_week;
  if (typeof p.prefers_spanish_exam === 'boolean') out.prefers_spanish_exam = p.prefers_spanish_exam;
  if (typeof p.country === 'string' && /^[A-Za-z]{2}$/.test(p.country)) out.country = p.country.toUpperCase();
  return out;
}

/** Ids an answer shows that `has` does not know (to load a newer catalog before showing it). */
export const unknownIds = (m, has) => shownIds(m).filter((id) => !has(id));

/** The answer without the certifications `has` does not know; a roadmap or table left too short goes. */
export function keepKnown(m, has) {
  if (m.picks) m.picks = m.picks.filter((p) => has(p.id));
  if (m.roadmap) {
    const steps = m.roadmap.steps.filter((s) => has(s.id));
    m.roadmap = steps.length >= 2 ? { ...m.roadmap, steps } : undefined;
  }
  if (m.comparison) {
    const ids = m.comparison.filter(has);
    m.comparison = ids.length >= 2 ? ids : undefined;
  }
  for (const key of ['picks', 'roadmap', 'comparison']) if (!m[key] || (Array.isArray(m[key]) && !m[key].length)) delete m[key];
  return m;
}

/** First paragraph and the rest, so cards can sit right under the lead of an answer. */
export function splitLead(text) {
  const parts = String(text ?? '').trim().split(/\n\s*\n/);
  return parts.length > 1 ? [parts[0], parts.slice(1).join('\n\n')] : [parts[0] || '', ''];
}

// ---------- hand-offs ----------

const DAYS = { 1: [6], 2: [3, 6], 3: [1, 3, 5], 4: [1, 3, 5, 6], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [1, 2, 3, 4, 5, 6, 0] };

/**
 * Study days and session length (minutes) that add up to about `hoursPerWeek`: sessions of about
 * an hour and a half, at most six days, lengths in quarters of an hour between 30 and 240.
 */
export function weeklySchedule(hoursPerWeek) {
  if (!(hoursPerWeek > 0)) return null;
  const n = Math.min(6, Math.max(1, Math.round(hoursPerWeek / 1.5)));
  const len = Math.min(240, Math.max(30, Math.round((hoursPerWeek * 60) / n / 15) * 15));
  return { days: DAYS[n], len };
}

/**
 * The study plan link for a certification. With weekly hours the plan gets matching days and
 * session length; with a roadmap estimate for it, the total hours too (weeks x hours a week).
 * Without them the plan page estimates on its own.
 */
export function planHref(id, profile = {}, roadmap = null) {
  const params = new URLSearchParams({ cert: id });
  const hpw = roadmap?.hours_per_week || profile?.hours_per_week;
  const step = roadmap?.steps?.find((s) => s.id === id);
  if (hpw && step?.weeks) params.set('hours', String(Math.min(400, Math.max(2, Math.round(step.weeks * hpw)))));
  const schedule = weeklySchedule(hpw);
  if (schedule) {
    params.set('days', schedule.days.join(','));
    params.set('len', String(schedule.len));
  }
  return `#plan?${params}`;
}

/**
 * The "For me" hand-off: what lib/intent.js read in the conversation, with what the AI recorded on
 * top. `fromProfile` is lib/intent.js's reading of the profile's role and goal; its roles and skills
 * are added. A stated experience and budget replace what the text suggested.
 */
export function applyProfile(intent, profile = {}, fromProfile = null) {
  const uniq = (a, b) => [...new Set([...(a || []), ...(b || [])])];
  const p = { ...intent.profile };
  if (fromProfile) {
    p.roles = uniq(p.roles, fromProfile.profile.roles);
    p.known = uniq(p.known, fromProfile.profile.known);
    p.want = uniq(p.want, fromProfile.profile.want);
  }
  let levelStated = intent.levelStated;
  if (profile.experience) {
    p.experience = profile.experience;
    levelStated = true;
  }
  if (Number.isFinite(profile.budget_usd)) p.budget = profile.budget_usd;
  const topical = intent.topical + (fromProfile?.topical || 0) + (profile.experience || Number.isFinite(profile.budget_usd) ? 1 : 0);
  return { ...intent, profile: p, levelStated, topical };
}

/**
 * What one attempt's outcome means. `result` is what site/chat.js saw:
 *   { type: 'done' }                          the stream finished
 *   { type: 'stopped', text }                 the person pressed stop
 *   { type: 'network' }                       fetch failed (offline, DNS, CORS)
 *   { type: 'timeout' }                       no first byte within FIRST_BYTE_MS
 *   { type: 'http', status, error, retryAfter } any status but 200 before the stream
 *   { type: 'event', code, text }             an `error` event; `text` says whether text came first
 *   { type: 'cut', text }                     the stream ended or stalled without `done`
 * Returns { fallback, reason, retry, retryAt, pauseUntil }:
 *   fallback    answer this message with the on-device matcher
 *   reason      why, for the note under the answer (null when all went well)
 *   retry       asking the AI again could work
 *   retryAt     not before this time (ms), for rate limits
 *   pauseUntil  skip the endpoint for new messages until then (Infinity: for the rest of the visit)
 */
export function decide(result, now = Date.now()) {
  const out = (fallback, reason, retry, extra = {}) => ({ fallback, reason, retry, retryAt: null, pauseUntil: null, ...extra });
  switch (result.type) {
    case 'done':
      return out(false, null, false);
    case 'stopped':
      return out(false, 'stopped', false);
    case 'network':
      return out(true, 'offline', true);
    case 'timeout':
      return out(true, 'timeout', true);
    case 'http': {
      const { status, error } = result;
      if (status === 429) {
        const seconds = Number(result.retryAfter) > 0 ? Math.min(Number(result.retryAfter), 3600) : RETRY_AFTER;
        const at = now + seconds * 1000;
        return out(true, 'rate', true, { retryAt: at, pauseUntil: at });
      }
      if (status === 503 && error === 'disabled') return out(true, 'disabled', false, { pauseUntil: Infinity });
      if (status === 503) return out(true, 'busy', true);
      // Refused by the endpoint: this origin is not allowed, or the message itself (size, shape).
      if (status === 403) return out(true, 'rejected', false, { pauseUntil: Infinity });
      if (status === 400 || status === 413) return out(true, 'rejected', false);
      return out(true, 'error', true);
    }
    case 'event': {
      const reason = result.code === 'overloaded' ? 'busy' : result.code === 'refusal' ? 'refused' : 'error';
      // After some text the answer stays, with a note; before any, the matcher answers.
      return out(!result.text, reason, reason !== 'refused');
    }
    case 'cut':
      return result.text ? out(false, 'cut', true) : out(true, 'error', true);
    default:
      return out(true, 'error', true);
  }
}

/** Whether new messages should skip the endpoint right now, and why. */
export function paused(pause, now = Date.now()) {
  return pause && pause.until > now ? pause.reason : null;
}

/** Seconds left before a retry is allowed (0 when it is). */
export const secondsLeft = (retryAt, now = Date.now()) => (retryAt && retryAt > now ? Math.ceil((retryAt - now) / 1000) : 0);

/** Everything the person has written, oldest first: what the on-device matcher reads. */
export const userText = (messages) =>
  messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n');

// ---------- saved conversation ----------

const REASONS = new Set(['stopped', 'cut', 'offline', 'timeout', 'busy', 'error', 'rate', 'disabled', 'rejected', 'refused']);
const str = (x, max = 20000) => (typeof x === 'string' ? x.slice(0, max) : '');

function cleanMessage(m) {
  if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null;
  if (m.role === 'user') return m.content.trim() ? { role: 'user', content: str(m.content, LIMITS.chars) } : null;
  const msg = { role: 'assistant', content: str(m.content), source: m.source === 'local' ? 'local' : 'ai' };
  if (Array.isArray(m.picks)) {
    const picks = m.picks
      .filter((p) => p && typeof p.id === 'string')
      .map((p) => ({ id: p.id.slice(0, 80), why: str(p.why, 400), ...(typeof p.warning === 'string' && p.warning ? { warning: str(p.warning, 240) } : {}) }));
    if (picks.length) msg.picks = picks.slice(0, 8);
  }
  const roadmap = m.roadmap ? readRoadmap(m.roadmap) : null;
  if (roadmap) msg.roadmap = roadmap;
  const comparison = readComparison({ ids: m.comparison });
  if (comparison.length) msg.comparison = comparison;
  const replies = readReplies({ replies: m.replies });
  if (replies.length) msg.replies = replies;
  if (typeof m.key === 'string' && /^chat\.[\w.]+$/.test(m.key)) msg.key = m.key;
  if (REASONS.has(m.reason)) msg.reason = m.reason;
  if (m.retry === true) msg.retry = true;
  if (Number.isFinite(m.retryAt)) msg.retryAt = m.retryAt;
  return msg.content || msg.picks || msg.roadmap || msg.comparison || msg.key ? msg : null;
}

/** The value to save: the last LIMITS.stored messages, without anything that only matters mid-answer, and the profile. */
export function toStore(messages, profile = null) {
  const saved = { v: STORE_VERSION, messages: messages.map(cleanMessage).filter(Boolean).slice(-LIMITS.stored) };
  const kept = readProfile(profile);
  if (Object.keys(kept).length) saved.profile = kept;
  return saved;
}

/**
 * Read a saved value back. A question left without an answer (the page closed while it was being
 * written) is returned as `draft`, for the composer, instead of staying in the transcript.
 */
export function fromStore(saved) {
  if (!saved || saved.v !== STORE_VERSION || !Array.isArray(saved.messages)) return { messages: [], draft: '', profile: {} };
  const messages = saved.messages.map(cleanMessage).filter(Boolean).slice(-LIMITS.stored);
  const draft = messages.at(-1)?.role === 'user' ? messages.pop().content : '';
  return { messages, draft, profile: readProfile(saved.profile) };
}

// ---------- where the endpoint is ----------

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|[\w-]+\.localhost)$/i;
const isLoopback = (host) => LOOPBACK.test(host || '');

function asBase(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return { base: url.href.replace(/\/+$/, ''), host: url.hostname };
  } catch {
    return null;
  }
}

/**
 * The API base for this page. `param` is ?chat= (null when absent), `saved` what an earlier ?chat=
 * stored, `page` this page's hostname and `fallback` the address set at build time.
 * Only a loopback address is honoured, or any address when the page itself runs on loopback: a link
 * to the live site must not be able to send someone's messages elsewhere. ?chat= with nothing (or
 * "default") forgets the saved one. Returns { api, save }, where save is undefined (leave storage
 * alone), '' (forget) or the address to keep.
 */
export function resolveApi({ param = null, saved = '', page = '', fallback }) {
  const allowed = (value) => {
    const b = value ? asBase(value) : null;
    return b && (isLoopback(b.host) || isLoopback(page)) ? b.base : null;
  };
  const kept = allowed(saved);
  if (param === null) return { api: kept || fallback, save: undefined };
  if (param === '' || param === 'default') return { api: fallback, save: '' };
  const asked = allowed(param);
  return asked ? { api: asked, save: asked } : { api: kept || fallback, save: undefined };
}

// ---------- the assistant's text ----------

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Inline marks the model tends to use. Links keep their words and lose the address: the
// certification rows below the text carry the links that matter.
function inline(s) {
  return esc(s)
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![*\w])/g, '$1<em>$2</em>');
}

/**
 * Plain text with a little Markdown (paragraphs, line breaks, - and 1. lists, # headings, **bold**,
 * *italic*, `code`) as escaped HTML. Safe for text still arriving: an unclosed mark shows as typed.
 */
export function formatText(text) {
  const out = [];
  let para = [];
  let list = null;
  const endPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const endList = () => {
    if (list) out.push(`<${list.tag}${list.start > 1 ? ` start="${list.start}"` : ''}>${list.items.map((x) => `<li>${inline(x)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  for (const raw of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      endPara();
      if (list) list.gap = true;
      continue;
    }
    const bullet = raw.match(/^\s*[-*•]\s+(.*)$/);
    const num = raw.match(/^\s*(\d{1,3})[.)]\s+(.*)$/);
    if (bullet || num) {
      endPara();
      const tag = bullet ? 'ul' : 'ol';
      if (!list || list.tag !== tag) {
        endList();
        list = { tag, start: num ? Number(num[1]) : 1, items: [] };
      }
      list.items.push(bullet ? bullet[1] : num[2]);
      list.gap = false;
      continue;
    }
    // An indented line right under an item continues it.
    if (list && !list.gap && /^\s{2,}/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line}`;
      continue;
    }
    endList();
    const head = line.match(/^#{1,6}\s+(.*)$/);
    if (head) {
      endPara();
      out.push(`<p><strong>${inline(head[1])}</strong></p>`);
      continue;
    }
    para.push(line);
  }
  endPara();
  endList();
  return out.join('');
}
