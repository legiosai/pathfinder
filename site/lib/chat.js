// The chat's rules, kept apart from the page so Node tests can import them: what goes to the
// endpoint, when the on-device matcher answers instead, what is saved, and how the assistant's text
// becomes HTML. No DOM, no storage and no network here; site/chat.js does those.
//
// The endpoint (POST {api}/chat) takes { messages, lang }: messages alternate, start and end with the
// user, at most 20 of them, the user's at most 1,000 characters each and the assistant's 4,000.
// Assistant messages carry the ids of the certifications shown with them in `picks`, so the model
// knows what the person has seen; their text may be empty when they have picks.

export const LIMITS = { messages: 20, chars: 1000, answerChars: 4000, stored: 20 };
export const STORE_VERSION = 1;
/** Seconds to wait after a 429 that did not say how long. */
export const RETRY_AFTER = 30;
/** No first byte in this long and the matcher answers instead. */
export const FIRST_BYTE_MS = 20000;
/** A stream that goes quiet this long after it started is treated as cut. */
export const STALL_MS = 45000;

/** The request body for the conversation so far. Empty answers without picks are left out. */
export function toRequest(messages, lang) {
  const list = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const content = String(m.content ?? '').trim();
    const picks = m.role === 'assistant' && m.picks?.length ? m.picks.slice(0, 10).map((p) => p.id) : null;
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
  return { messages: list.slice(start), lang: lang === 'es' ? 'es' : 'en' };
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
    const picks = m.picks.filter((p) => p && typeof p.id === 'string').map((p) => ({ id: p.id.slice(0, 80), why: str(p.why, 400) }));
    if (picks.length) msg.picks = picks.slice(0, 8);
  }
  if (typeof m.key === 'string' && /^chat\.[\w.]+$/.test(m.key)) msg.key = m.key;
  if (REASONS.has(m.reason)) msg.reason = m.reason;
  if (m.retry === true) msg.retry = true;
  if (Number.isFinite(m.retryAt)) msg.retryAt = m.retryAt;
  return msg.content || msg.picks || msg.key ? msg : null;
}

/** The value to save: the last LIMITS.stored messages, without anything that only matters mid-answer. */
export function toStore(messages) {
  return { v: STORE_VERSION, messages: messages.map(cleanMessage).filter(Boolean).slice(-LIMITS.stored) };
}

/**
 * Read a saved value back. A question left without an answer (the page closed while it was being
 * written) is returned as `draft`, for the composer, instead of staying in the transcript.
 */
export function fromStore(saved) {
  if (!saved || saved.v !== STORE_VERSION || !Array.isArray(saved.messages)) return { messages: [], draft: '' };
  const messages = saved.messages.map(cleanMessage).filter(Boolean).slice(-LIMITS.stored);
  const draft = messages.at(-1)?.role === 'user' ? messages.pop().content : '';
  return { messages, draft };
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
