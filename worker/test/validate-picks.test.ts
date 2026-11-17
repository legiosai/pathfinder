import { describe, expect, it } from 'vitest';
import { MAX_WHY_CHARS, validatePicks } from '../src/picks';
import { LIMITS, validateChatRequest } from '../src/validate';

const u = (content: string) => ({ role: 'user', content });
const a = (content: string, picks?: string[]) => ({ role: 'assistant', content, ...(picks ? { picks } : {}) });

describe('validateChatRequest', () => {
  it('accepts a valid conversation and keeps shown picks', () => {
    const result = validateChatRequest({ lang: 'es', messages: [u('hola'), a('¿Qué rol tenés?', ['aws-clf-c02']), u('Soy dev')] });
    expect(result).toEqual({
      ok: true,
      value: { lang: 'es', messages: [u('hola'), a('¿Qué rol tenés?', ['aws-clf-c02']), u('Soy dev')] },
    });
  });

  it.each([
    ['a non-object body', [], 'body must be a JSON object'],
    ['a missing lang', { messages: [u('hi')] }, 'lang'],
    ['an unknown lang', { lang: 'pt', messages: [u('hi')] }, 'lang'],
    ['no messages', { lang: 'en', messages: [] }, 'non-empty'],
    ['a first assistant message', { lang: 'en', messages: [a('hi'), u('hi')] }, 'alternate'],
    ['two user messages in a row', { lang: 'en', messages: [u('a'), u('b')] }, 'alternate'],
    ['a final assistant message', { lang: 'en', messages: [u('a'), a('b')] }, 'last message'],
    ['a bad role', { lang: 'en', messages: [{ role: 'system', content: 'x' }] }, 'role'],
    ['non-string content', { lang: 'en', messages: [{ role: 'user', content: 3 }] }, 'content'],
    ['a blank user message', { lang: 'en', messages: [u('   ')] }, 'empty'],
    ['picks on a user message', { lang: 'en', messages: [{ ...u('a'), picks: ['x'] }] }, 'only allowed'],
    ['picks that are not ids', { lang: 'en', messages: [u('a'), a('b', ['Not An Id']), u('c')] }, 'ids'],
    ['too many shown picks', { lang: 'en', messages: [u('a'), a('b', Array(11).fill('x')), u('c')] }, 'at most'],
  ])('rejects %s with 400', (_, body, detail) => {
    const result = validateChatRequest(body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({ error: 'bad_request' });
      expect((result.body as { detail: string }).detail).toContain(detail);
    }
  });

  it('answers 413 for long content and long conversations', () => {
    const long = { lang: 'en', messages: [u('x'.repeat(LIMITS.userChars + 1))] };
    expect(validateChatRequest(long)).toEqual({ ok: false, status: 413, body: { error: 'too_long' } });
    const longReply = { lang: 'en', messages: [u('a'), a('x'.repeat(LIMITS.assistantChars + 1)), u('b')] };
    expect(validateChatRequest(longReply)).toMatchObject({ status: 413 });
    const turns = Array.from({ length: 21 }, (_, i) => (i % 2 ? a('r') : u('q')));
    expect(validateChatRequest({ lang: 'en', messages: turns })).toMatchObject({ status: 413 });
  });

  it('accepts the limits exactly', () => {
    const turns = Array.from({ length: 19 }, (_, i) => (i % 2 ? a('r'.repeat(LIMITS.assistantChars)) : u('q'.repeat(LIMITS.userChars))));
    expect(validateChatRequest({ lang: 'en', messages: turns }).ok).toBe(true);
  });
});

describe('validatePicks', () => {
  const known = new Set(['aws-clf-c02', 'aws-aif-c01', 'nvidia-nca-ads', 'microsoft-az-900', 'claude-architect-professional', 'x-six']);

  it('keeps catalog ids and drops unknown ones', () => {
    const input = {
      picks: [
        { id: 'aws-clf-c02', why: 'Cloud basics first.' },
        { id: 'made-up-cert', why: 'Invented.' },
        { id: 'aws-aif-c01', why: ' AI on AWS,\n next. ' },
      ],
    };
    expect(validatePicks(input, known)).toEqual({
      picks: [
        { id: 'aws-clf-c02', why: 'Cloud basics first.' },
        { id: 'aws-aif-c01', why: 'AI on AWS, next.' },
      ],
      dropped: 1,
    });
  });

  it('drops duplicates, empty reasons and bad shapes, and caps at five', () => {
    const ids = [...known];
    const input = {
      picks: [
        { id: ids[0], why: 'one' },
        { id: ids[0], why: 'again' },
        { id: ids[1], why: '   ' },
        { id: ids[1] },
        'aws-clf-c02',
        null,
        ...ids.slice(1).map((id) => ({ id, why: `because ${id}` })),
      ],
    };
    const { picks, dropped } = validatePicks(input, known);
    expect(picks.map((p) => p.id)).toEqual(ids.slice(0, 5));
    expect(dropped).toBe(input.picks.length - 5);
  });

  it('shortens a long reason', () => {
    const { picks } = validatePicks({ picks: [{ id: 'aws-clf-c02', why: 'word '.repeat(200) }] }, known);
    expect(picks[0].why.length).toBeLessThanOrEqual(MAX_WHY_CHARS);
    expect(picks[0].why.endsWith('…')).toBe(true);
  });

  it('returns nothing for input that is not an object with picks', () => {
    for (const input of [null, 'x', [], {}, { picks: 'x' }]) expect(validatePicks(input, known).picks).toEqual([]);
  });
});
