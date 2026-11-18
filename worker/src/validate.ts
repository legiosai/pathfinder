// Request validation for POST /chat. Lengths are JavaScript string lengths (UTF-16 code
// units), the same unit as a textarea's maxlength.

import type { Profile } from './sse';
import { isEmptyProfile, sanitizeProfile } from './tools';

export const LIMITS = {
  maxMessages: 20,
  userChars: 1000,
  assistantChars: 4000,
  maxShownPicks: 10,
  /** Raw body cap, well above the largest valid conversation. */
  bodyBytes: 128 * 1024,
} as const;

export type Lang = 'en' | 'es';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  picks?: string[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  lang: Lang;
  /** What set_profile recorded earlier, as the page kept it. Invalid fields are dropped, not refused. */
  profile?: Profile;
}

export type Validation =
  | { ok: true; value: ChatRequest }
  | { ok: false; status: 400; body: { error: 'bad_request'; detail: string } }
  | { ok: false; status: 413; body: { error: 'too_long' } };

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const bad = (detail: string): Validation => ({ ok: false, status: 400, body: { error: 'bad_request', detail } });
const tooLong = (): Validation => ({ ok: false, status: 413, body: { error: 'too_long' } });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateChatRequest(body: unknown): Validation {
  if (!isObject(body)) return bad('body must be a JSON object');
  const { messages, lang } = body;
  if (lang !== 'en' && lang !== 'es') return bad('lang must be "en" or "es"');
  if (body.profile !== undefined && body.profile !== null && !isObject(body.profile)) return bad('profile must be an object');
  if (!Array.isArray(messages) || messages.length === 0) return bad('messages must be a non-empty array');
  if (messages.length > LIMITS.maxMessages) return tooLong();

  const out: ChatMessage[] = [];
  for (const [i, m] of messages.entries()) {
    const where = `messages[${i}]`;
    if (!isObject(m)) return bad(`${where} must be an object`);
    const expected = i % 2 === 0 ? 'user' : 'assistant';
    if (m.role !== 'user' && m.role !== 'assistant') return bad(`${where}.role must be "user" or "assistant"`);
    if (m.role !== expected) return bad(`messages must alternate, starting with user: ${where} should be ${expected}`);
    if (typeof m.content !== 'string') return bad(`${where}.content must be a string`);
    if (m.content.length > (m.role === 'user' ? LIMITS.userChars : LIMITS.assistantChars)) return tooLong();
    if (m.role === 'user' && !m.content.trim()) return bad(`${where}.content must not be empty`);

    const msg: ChatMessage = { role: m.role, content: m.content };
    if (m.picks !== undefined) {
      if (m.role !== 'assistant') return bad(`${where}.picks is only allowed on assistant messages`);
      if (!Array.isArray(m.picks) || m.picks.length > LIMITS.maxShownPicks) {
        return bad(`${where}.picks must be an array of at most ${LIMITS.maxShownPicks} ids`);
      }
      for (const id of m.picks) {
        if (typeof id !== 'string' || id.length > 100 || !ID.test(id)) return bad(`${where}.picks must hold certification ids`);
      }
      msg.picks = [...m.picks];
    }
    out.push(msg);
  }
  if (out[out.length - 1].role !== 'user') return bad('the last message must be from the user');
  const value: ChatRequest = { messages: out, lang };
  const profile = sanitizeProfile(body.profile);
  if (!isEmptyProfile(profile)) value.profile = profile;
  return { ok: true, value };
}
