import { describe, expect, it } from 'vitest';
import { MAX_WARNING_CHARS, MAX_WHY_CHARS, validatePicks } from '../src/picks';
import { collectOutputs, sanitizeProfile, validateComparison, validateReplies, validateRoadmap } from '../src/tools';
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

  it('keeps the valid fields of a profile and refuses a profile that is not an object', () => {
    const ok = validateChatRequest({ lang: 'es', messages: [u('hola')], profile: { role: ' dev ', budget_usd: 100.4, hours_per_week: 'five', country: 'ar', extra: 1 } });
    expect(ok).toEqual({ ok: true, value: { lang: 'es', messages: [u('hola')], profile: { role: 'dev', budget_usd: 100, country: 'AR' } } });
    expect(validateChatRequest({ lang: 'es', messages: [u('hola')], profile: { nothing: true } })).toEqual({ ok: true, value: { lang: 'es', messages: [u('hola')] } });
    expect(validateChatRequest({ lang: 'es', messages: [u('hola')], profile: null }).ok).toBe(true);
    for (const profile of ['dev', [1], 3]) {
      const bad = validateChatRequest({ lang: 'es', messages: [u('hola')], profile });
      expect(bad).toMatchObject({ ok: false, status: 400 });
    }
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

  it('keeps a warning when there is one and the pick without it otherwise', () => {
    const { picks } = validatePicks(
      {
        picks: [
          { id: 'aws-clf-c02', why: 'Base.', warning: '  Over your budget\n by 50 dollars. ' },
          { id: 'aws-aif-c01', why: 'IA.', warning: '   ' },
          { id: 'x-six', why: 'Six.', warning: 7 },
          { id: 'microsoft-az-900', why: 'Azure.', warning: 'w '.repeat(200) },
        ],
      },
      known,
    );
    expect(picks.slice(0, 3)).toEqual([
      { id: 'aws-clf-c02', why: 'Base.', warning: 'Over your budget by 50 dollars.' },
      { id: 'aws-aif-c01', why: 'IA.' },
      { id: 'x-six', why: 'Six.' },
    ]);
    expect(picks[3].warning!.length).toBeLessThanOrEqual(MAX_WARNING_CHARS);
  });
});

describe('the other tools', () => {
  const known = new Set(['a-one', 'b-two', 'c-three', 'd-four', 'e-five', 'f-six', 'g-seven']);

  it('validates a roadmap: known ids in order, weeks rounded into range, at least two steps', () => {
    const roadmap = validateRoadmap(
      {
        hours_per_week: 5,
        steps: [
          { id: 'a-one', weeks: 3.6, note: ' Base\n' },
          { id: 'made-up', weeks: 2, note: 'x' },
          { id: 'a-one', weeks: 2, note: 'again' },
          { id: 'b-two', weeks: 500, note: 'long' },
          { id: 'c-three', weeks: 'six', note: 7 },
        ],
      },
      known,
    );
    expect(roadmap).toEqual({
      hours_per_week: 5,
      steps: [
        { id: 'a-one', weeks: 4, note: 'Base' },
        { id: 'b-two', weeks: 104, note: 'long' },
        { id: 'c-three', weeks: null, note: '' },
      ],
    });
    expect(validateRoadmap({ steps: [{ id: 'a-one', weeks: 1, note: '' }] }, known)).toBeNull();
    expect(validateRoadmap({ hours_per_week: -1, steps: [...known].map((id) => ({ id, weeks: 1, note: '' })) }, known)).toEqual({
      steps: [...known].slice(0, 6).map((id) => ({ id, weeks: 1, note: '' })),
    });
    for (const input of [null, {}, { steps: 'x' }]) expect(validateRoadmap(input, known)).toBeNull();
  });

  it('validates a comparison of two to four known ids', () => {
    expect(validateComparison({ ids: ['a-one', 'nope', 'b-two', 'a-one'] }, known)).toEqual(['a-one', 'b-two']);
    expect(validateComparison({ ids: ['a-one', 'nope'] }, known)).toEqual([]);
    expect(validateComparison({ ids: [...known] }, known)).toEqual([...known].slice(0, 4));
    expect(validateComparison({ ids: 'a-one' }, known)).toEqual([]);
  });

  it('keeps up to four short, distinct replies', () => {
    expect(validateReplies({ replies: [' Tengo 5 horas ', 'tengo 5 horas', '', 7, 'x'.repeat(81), '¿Algo más barato?', 'A', 'B', 'C'] })).toEqual([
      'Tengo 5 horas',
      '¿Algo más barato?',
      'A',
      'B',
    ]);
    expect(validateReplies(null)).toEqual([]);
  });

  it('keeps only valid profile fields', () => {
    expect(
      sanitizeProfile({
        role: ' backend\n developer ',
        experience: 'senior',
        goal: 'AI on AWS',
        budget_usd: -5,
        hours_per_week: 5.25,
        prefers_spanish_exam: 'yes',
        country: 'Argentina',
      }),
    ).toEqual({ role: 'backend developer', goal: 'AI on AWS', hours_per_week: 5.3 });
    expect(sanitizeProfile({ experience: 'new', budget_usd: 0, prefers_spanish_exam: false, country: 'ar' })).toEqual({
      experience: 'new',
      budget_usd: 0,
      prefers_spanish_exam: false,
      country: 'AR',
    });
    expect(sanitizeProfile('x')).toEqual({});
  });

  it('collects every tool call, merging picks and profiles, after the last fallback', () => {
    const tool = (name: string, input: unknown) => ({ type: 'tool_use', name, input });
    const out = collectOutputs(
      [
        tool('show_certifications', { picks: [{ id: 'g-seven', why: 'declined attempt' }] }),
        { type: 'fallback' },
        { type: 'text' },
        tool('show_certifications', { picks: [{ id: 'a-one', why: 'one' }] }),
        tool('show_certifications', { picks: [{ id: 'b-two', why: 'two' }, { id: 'nope', why: 'x' }] }),
        tool('show_roadmap', { hours_per_week: 4, steps: [{ id: 'a-one', weeks: 2, note: 'n' }, { id: 'b-two', weeks: 3, note: 'n' }] }),
        tool('show_comparison', { ids: ['a-one', 'b-two'] }),
        tool('suggest_replies', { replies: ['Sí', 'No'] }),
        tool('set_profile', { role: 'dev' }),
        tool('set_profile', { hours_per_week: 4 }),
        tool('unknown_tool', {}),
      ],
      known,
    );
    expect(out).toEqual({
      picks: [
        { id: 'a-one', why: 'one' },
        { id: 'b-two', why: 'two' },
      ],
      roadmap: { hours_per_week: 4, steps: [{ id: 'a-one', weeks: 2, note: 'n' }, { id: 'b-two', weeks: 3, note: 'n' }] },
      comparison: ['a-one', 'b-two'],
      replies: ['Sí', 'No'],
      profile: { role: 'dev', hours_per_week: 4 },
      calledShow: true,
      dropped: 2,
    });
    expect(collectOutputs([{ type: 'text' }], known)).toMatchObject({ picks: [], roadmap: null, comparison: [], replies: [], profile: null, calledShow: false });
  });
});
