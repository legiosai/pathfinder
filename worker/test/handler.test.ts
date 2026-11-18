import { describe, expect, it } from 'vitest';
import { MAX_TOKENS } from '../src/chat';
import {
  API_KEY,
  ORIGIN,
  apiError,
  context,
  env,
  ev,
  harness,
  limiter,
  pieces,
  picksJson,
  send,
  slowStreamResponse,
  streamResponse,
} from './helpers';

const ask = (content: string, lang = 'es') => ({ lang, messages: [{ role: 'user', content }] });
const USER_TEXT = 'Soy desarrolladora backend y quiero algo de IA en la nube';

describe('POST /chat with Claude', () => {
  it('streams text, then validated picks, then done', async () => {
    const h = harness({
      reply: streamResponse([
        ev.start(),
        ...ev.thinking(0),
        ...ev.text(1, ['Para arrancar, ', 'te conviene la base de nube.']),
        ...ev.tool(
          2,
          pieces(
            picksJson([
              { id: 'aws-clf-c02', why: 'Te da la base de AWS.' },
              { id: 'not-in-catalog', why: 'Inventada.' },
              { id: 'aws-aif-c01', why: 'Suma IA sobre AWS.' },
            ]),
          ),
        ),
        ev.delta('tool_use', {}, { cache_read_input_tokens: 9100, cache_creation_input_tokens: 0, input_tokens: 40 }),
        ev.stop(),
      ]),
    });
    const { res, events } = await send(h, ask(USER_TEXT));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(events).toEqual([
      { event: 'text', data: { t: 'Para arrancar, ' } },
      { event: 'text', data: { t: 'te conviene la base de nube.' } },
      {
        event: 'picks',
        data: {
          picks: [
            { id: 'aws-clf-c02', why: 'Te da la base de AWS.' },
            { id: 'aws-aif-c01', why: 'Suma IA sobre AWS.' },
          ],
        },
      },
      { event: 'done', data: {} },
    ]);

    const log = h.logs.find((l) => l.evt === 'chat')!;
    expect(log).toMatchObject({ outcome: 'done', picks: 2, dropped: 1, stop: 'tool_use', messages: 1, fallback: false });
    expect(log.usage).toMatchObject({ cacheRead: 9100, cacheWrite: 0, output: 120 });
  });

  it('sends the request the owner specified', async () => {
    const h = harness({ reply: streamResponse([ev.start(), ...ev.text(0, ['Hi']), ev.delta('end_turn'), ev.stop()]) });
    await send(h, ask('hello', 'en'));
    expect(h.calls).toHaveLength(1);
    const [{ url, headers, body }] = h.calls;
    expect(new URL(url).pathname).toBe('/v1/messages');
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(body).toMatchObject({
      model: 'claude-sonnet-5-5',
      max_tokens: MAX_TOKENS,
      stream: true,
      fallbacks: 'default',
      output_config: { effort: 'low' },
      cache_control: { type: 'ephemeral' },
      tool_choice: { type: 'auto' },
    });
    // No sampling parameters, no disabled thinking: both are 400s on this model.
    for (const key of ['thinking', 'temperature', 'top_p', 'top_k']) expect(body).not.toHaveProperty(key);
    expect(body.system).toHaveLength(1);
    expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(body.system[0].text).toContain('<catalog>');
    expect(body.tools.map((t: { name: string }) => t.name)).toEqual(['show_certifications', 'show_roadmap', 'show_comparison', 'suggest_replies', 'set_profile']);
    for (const tool of body.tools) expect(tool).toMatchObject({ strict: true, eager_input_streaming: true });
    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hello' }, { type: 'text', text: '<ui_language>en</ui_language>' }] },
    ]);
  });

  it('honours MODEL and EFFORT and keeps the system prompt identical across requests', async () => {
    const reply = () => streamResponse([ev.start(), ...ev.text(0, ['ok']), ev.delta('end_turn'), ev.stop()]);
    const h = harness({ reply });
    await send(h, ask('uno'), env({ MODEL: 'claude-opus-5-5', EFFORT: 'medium' }));
    await send(h, { lang: 'en', messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b', picks: ['aws-clf-c02', 'gone'] }, { role: 'user', content: 'c' }] });
    expect(h.calls[0].body.model).toBe('claude-opus-5-5');
    expect(h.calls[0].body.output_config).toEqual({ effort: 'medium' });
    expect(h.calls[1].body.system).toEqual(h.calls[0].body.system);
    expect(h.calls[1].body.tools).toEqual(h.calls[0].body.tools);
    expect(h.calls[1].body.messages[1]).toEqual({ role: 'assistant', content: 'b\n\n[Shown: aws-clf-c02]' });
  });

  it('emits every tool as its own event, after the text and in a fixed order', async () => {
    const h = harness({
      reply: streamResponse([
        ev.start(),
        ...ev.text(0, ['Arrancá por Cloud Practitioner.']),
        ...ev.tool(1, pieces(JSON.stringify({ replies: ['¿Algo más barato?', 'Armame el plan'] })), { name: 'suggest_replies' }),
        ...ev.tool(2, pieces(JSON.stringify({ role: 'help desk', hours_per_week: 5, country: 'ar' })), { name: 'set_profile' }),
        ...ev.tool(3, pieces(JSON.stringify({ ids: ['aws-clf-c02', 'microsoft-az-900', 'made-up'] })), { name: 'show_comparison' }),
        ...ev.tool(
          4,
          pieces(JSON.stringify({ hours_per_week: 5, steps: [{ id: 'aws-clf-c02', weeks: 4, note: 'Base' }, { id: 'aws-aif-c01', weeks: 5, note: 'IA' }] })),
          { name: 'show_roadmap' },
        ),
        ...ev.tool(5, pieces(picksJson([{ id: 'aws-clf-c02', why: 'Base de nube.' }, { id: 'claude-architect-professional', why: 'Más adelante.', warning: 'Pide ser partner.' }]))),
        ev.delta('tool_use'),
        ev.stop(),
      ]),
    });
    const { events } = await send(h, ask('Trabajo en help desk, tengo 5 horas por semana'));
    expect(events).toEqual([
      { event: 'text', data: { t: 'Arrancá por Cloud Practitioner.' } },
      {
        event: 'picks',
        data: {
          picks: [
            { id: 'aws-clf-c02', why: 'Base de nube.' },
            { id: 'claude-architect-professional', why: 'Más adelante.', warning: 'Pide ser partner.' },
          ],
        },
      },
      { event: 'roadmap', data: { hours_per_week: 5, steps: [{ id: 'aws-clf-c02', weeks: 4, note: 'Base' }, { id: 'aws-aif-c01', weeks: 5, note: 'IA' }] } },
      { event: 'comparison', data: { ids: ['aws-clf-c02', 'microsoft-az-900'] } },
      { event: 'profile', data: { profile: { role: 'help desk', hours_per_week: 5, country: 'AR' } } },
      { event: 'replies', data: { replies: ['¿Algo más barato?', 'Armame el plan'] } },
      { event: 'done', data: {} },
    ]);
    expect(h.logs.find((l) => l.evt === 'chat')).toMatchObject({ picks: 2, named: 0, roadmap: 2, compared: 2, replies: 2, profile: true });
  });

  it('shows the certifications a reply names when the model called no show_certifications', async () => {
    const h = harness({
      reply: streamResponse([
        ev.start(),
        ...ev.text(0, ['Con un año no llegás; mirá AWS Certified Cloud Practitioner o AZ-900. ¿Qué rol tenés?']),
        ...ev.tool(1, [JSON.stringify({ replies: ['Soy dev'] })], { name: 'suggest_replies' }),
        ev.delta('tool_use'),
        ev.stop(),
      ]),
    });
    const { events } = await send(h, ask('¿Vale la pena el CISSP con 1 año?'));
    expect(events.map((e) => e.event)).toEqual(['text', 'picks', 'replies', 'done']);
    expect(events[1].data).toEqual({ picks: [{ id: 'aws-clf-c02', why: '' }, { id: 'microsoft-az-900', why: '' }] });
    expect(h.logs.find((l) => l.evt === 'chat')).toMatchObject({ picks: 0, named: 2 });
  });

  it('leaves the safety net alone when cards, the roadmap or the table already show them', async () => {
    const withPicks = harness({
      reply: streamResponse([
        ev.start(),
        ...ev.text(0, ['AZ-900 primero, después CLF-C02.']),
        ...ev.tool(1, [picksJson([{ id: 'microsoft-az-900', why: 'Base.' }])]),
        ev.delta('tool_use'),
        ev.stop(),
      ]),
    });
    expect((await send(withPicks, ask('hola'))).events[1].data).toEqual({ picks: [{ id: 'microsoft-az-900', why: 'Base.' }] });

    const withRoadmap = harness({
      reply: streamResponse([
        ev.start(),
        ...ev.text(0, ['Primero CLF-C02 y después AIF-C01; el AZ-900 es opcional.']),
        ...ev.tool(1, [JSON.stringify({ hours_per_week: 5, steps: [{ id: 'aws-clf-c02', weeks: 4, note: '' }, { id: 'aws-aif-c01', weeks: 4, note: '' }] })], { name: 'show_roadmap' }),
        ev.delta('tool_use'),
        ev.stop(),
      ]),
    });
    const { events } = await send(withRoadmap, ask('armame el camino'));
    expect(events.map((e) => e.event)).toEqual(['text', 'picks', 'roadmap', 'done']);
    expect(events[1].data).toEqual({ picks: [{ id: 'microsoft-az-900', why: '' }] });

    const plain = harness({ reply: streamResponse([ev.start(), ...ev.text(0, ['Acá solo ayudo con certificaciones.']), ev.delta('end_turn'), ev.stop()]) });
    expect((await send(plain, ask('¿me ayudás con Python?'))).events.map((e) => e.event)).toEqual(['text', 'done']);
  });

  it('sends the kept profile with the last message and records nothing about it in the logs', async () => {
    const h = harness({ reply: streamResponse([ev.start(), ...ev.text(0, ['ok']), ev.delta('end_turn'), ev.stop()]) });
    await send(h, { lang: 'es', messages: [{ role: 'user', content: 'hola' }], profile: { role: 'secret role text', budget_usd: 150 } });
    expect(h.calls[0].body.messages[0].content.at(-1)).toEqual({ type: 'text', text: '<profile>{"role":"secret role text","budget_usd":150}</profile>' });
    expect(JSON.stringify(h.logs)).not.toContain('secret role text');
    expect(h.logs.find((l) => l.evt === 'chat')).toMatchObject({ withProfile: true });
  });

  it('separates consecutive text blocks into paragraphs', async () => {
    const h = harness({ reply: streamResponse([ev.start(), ...ev.text(0, ['First.']), ...ev.text(1, ['Second.']), ev.delta('end_turn'), ev.stop()]) });
    const { events } = await send(h, ask('hola'));
    expect(events.map((e) => e.data)).toEqual([{ t: 'First.' }, { t: '\n\nSecond.' }, {}]);
  });

  it('turns a refusal into an error event', async () => {
    const h = harness({ reply: streamResponse([ev.start(), ev.delta('refusal', { stop_details: { type: 'refusal', category: 'cyber', explanation: null } }), ev.stop()]) });
    const { res, events } = await send(h, ask('...'));
    expect(res.status).toBe(200);
    expect(events).toEqual([{ event: 'error', data: { code: 'refusal' } }]);
    expect(h.logs.find((l) => l.evt === 'chat')).toMatchObject({ outcome: 'error', code: 'refusal', refusal: 'cyber' });
  });

  it('ends a reply refused mid-stream with the refusal error', async () => {
    const h = harness({ reply: streamResponse([ev.start(), ...ev.text(0, ['Partial ']), ev.delta('refusal', { stop_details: null }), ev.stop()]) });
    const { events } = await send(h, ask('...'));
    expect(events).toEqual([
      { event: 'text', data: { t: 'Partial ' } },
      { event: 'error', data: { code: 'refusal' } },
    ]);
  });

  it('keeps going after a server-side fallback and ignores tool calls from the declined attempt', async () => {
    const h = harness({
      reply: streamResponse([
        ev.start(),
        ...ev.text(0, ['Hola, ']),
        ...ev.tool(1, [picksJson([{ id: 'aws-clf-c02', why: 'del intento rechazado' }])]),
        ...ev.fallback(2),
        ...ev.text(3, ['sigo yo.']),
        ...ev.tool(4, [picksJson([{ id: 'aws-aif-c01', why: 'IA en AWS.' }])]),
        ev.delta('tool_use', {}, { iterations: [{ type: 'message', input_tokens: 10, output_tokens: 5 }, { type: 'fallback_message', model: 'claude-sonnet-5', input_tokens: 10, output_tokens: 20 }] }),
        ev.stop(),
      ]),
    });
    const { events } = await send(h, ask('hola'));
    expect(events).toEqual([
      { event: 'text', data: { t: 'Hola, ' } },
      { event: 'text', data: { t: 'sigo yo.' } },
      { event: 'picks', data: { picks: [{ id: 'aws-aif-c01', why: 'IA en AWS.' }] } },
      { event: 'done', data: {} },
    ]);
    expect(h.logs.find((l) => l.evt === 'chat')).toMatchObject({ fallback: true, model: 'claude-sonnet-5' });
  });

  it('never shows a tool call cut off by max_tokens', async () => {
    const h = harness({
      reply: streamResponse([ev.start(), ...ev.text(0, ['Mirá estas: ']), ...ev.tool(1, ['{"picks": [{"id": "aws-clf-c02", "why": "Base']), ev.delta('max_tokens'), ev.stop()]),
    });
    const { events } = await send(h, ask('hola'));
    expect(events).toEqual([
      { event: 'text', data: { t: 'Mirá estas: ' } },
      { event: 'done', data: {} },
    ]);
  });

  it('finishes without cards when the tool input is not valid JSON', async () => {
    const h = harness({ reply: streamResponse([ev.start(), ...ev.text(0, ['Text first. ']), ...ev.tool(1, ['{"picks": [}}}']), ev.delta('tool_use'), ev.stop()]) });
    const { events } = await send(h, ask('hola'));
    expect(events.map((e) => e.event)).toEqual(['text', 'done']);
    expect(h.logs.find((l) => l.evt === 'chat')).toMatchObject({ outcome: 'done', error: 'AnthropicError', picks: 0 });
  });

  it('reports an internal error when there is nothing to show', async () => {
    const h = harness({ reply: streamResponse([ev.start(), ...ev.tool(0, [picksJson([{ id: 'made-up', why: 'x' }])]), ev.delta('tool_use'), ev.stop()]) });
    const { events } = await send(h, ask('hola'));
    expect(events).toEqual([{ event: 'error', data: { code: 'internal' } }]);
  });

  it('maps an overload in the middle of the stream to an overloaded event', async () => {
    const h = harness({ reply: streamResponse([ev.start(), ...ev.text(0, ['Empiezo y ']), ev.error('overloaded_error')]) });
    const { res, events } = await send(h, ask('hola'));
    expect(res.status).toBe(200);
    expect(events).toEqual([
      { event: 'text', data: { t: 'Empiezo y ' } },
      { event: 'error', data: { code: 'overloaded' } },
    ]);
  });

  it('maps other failures after the stream started to internal', async () => {
    const h = harness({ reply: streamResponse([ev.start(), ...ev.text(0, ['Hi ']), ev.error('api_error')]) });
    const { events } = await send(h, ask('hola'));
    expect(events.at(-1)).toEqual({ event: 'error', data: { code: 'internal' } });
  });

  it.each([
    [529, 'overloaded_error'],
    [429, 'rate_limit_error'],
    [500, 'api_error'],
    [401, 'authentication_error'],
  ])('answers 503 upstream when the API fails with %i before streaming', async (status, type) => {
    const h = harness({ reply: () => apiError(status, type) });
    const { res, text } = await send(h, ask('hola'));
    expect(res.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ error: 'upstream' });
    expect(h.logs.find((l) => l.evt === 'chat')).toMatchObject({ outcome: 'upstream', status });
  });

  it('answers 503 upstream when the API cannot be reached', async () => {
    const h = harness({
      reply: () => {
        throw new TypeError('fetch failed');
      },
    });
    const { res, text } = await send(h, ask('hola'));
    expect(res.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ error: 'upstream' });
  });

  it('stops the model when the visitor goes away', async () => {
    const h = harness({ reply: () => slowStreamResponse([ev.start(), ...ev.text(0, Array(40).fill('word ')), ev.delta('end_turn'), ev.stop()]) });
    const { ctx, settle } = context();
    const { chatRequest } = await import('./helpers');
    const res = await h.handle(chatRequest(ask('hola')), env(), ctx);
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    await settle();
    expect(h.logs.find((l) => l.evt === 'chat')).toMatchObject({ outcome: 'client_gone' });
  });

  it('logs counts and usage, never message text or the key', async () => {
    const h = harness({ reply: streamResponse([ev.start(), ...ev.text(0, ['Respuesta privada']), ev.delta('end_turn'), ev.stop()]) });
    await send(h, ask(USER_TEXT));
    const logged = JSON.stringify(h.logs);
    expect(logged).not.toContain(USER_TEXT);
    expect(logged).not.toContain('Respuesta privada');
    expect(logged).not.toContain(API_KEY);
    expect(logged).not.toContain('203.0.113.7');
    expect(h.logs.find((l) => l.evt === 'chat')).toMatchObject({ inChars: USER_TEXT.length, outChars: 'Respuesta privada'.length });
  });
});

describe('POST /chat guards', () => {
  const noApi = () => harness();

  it('rejects requests without an allowed Origin', async () => {
    for (const origin of [null, 'https://evil.example']) {
      const { res, text } = await send(noApi(), ask('hola'), env(), { origin });
      expect(res.status).toBe(403);
      expect(JSON.parse(text)).toEqual({ error: 'origin' });
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    }
  });

  it('answers 503 disabled when the kill switch is off, without calling Claude', async () => {
    const h = noApi();
    const { res, text } = await send(h, ask('hola'), env({ CHAT_ENABLED: '0' }));
    expect(res.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ error: 'disabled' });
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(h.calls).toHaveLength(0);
  });

  it('rate limits by client IP with Retry-After', async () => {
    const { keys, binding } = limiter(false);
    const h = noApi();
    const { res, text } = await send(h, ask('hola'), env({ CHAT_LIMITER: binding }), { ip: '198.51.100.9' });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(JSON.parse(text)).toEqual({ error: 'rate_limited', retryAfter: 60 });
    expect(keys).toEqual(['198.51.100.9']);
    expect(h.calls).toHaveLength(0);
  });

  it('passes when the limiter allows the request', async () => {
    const { binding } = limiter(true);
    const h = harness({ reply: streamResponse([ev.start(), ...ev.text(0, ['ok']), ev.delta('end_turn'), ev.stop()]) });
    const { res } = await send(h, ask('hola'), env({ CHAT_LIMITER: binding }));
    expect(res.status).toBe(200);
  });

  it.each([
    ['invalid JSON', '{"lang":', 'valid JSON'],
    ['a bad shape', { lang: 'en', messages: [{ role: 'assistant', content: 'x' }] }, 'alternate'],
    ['a missing lang', { messages: [{ role: 'user', content: 'x' }] }, 'lang'],
  ])('answers 400 for %s', async (_, body, detail) => {
    const { res, text } = await send(noApi(), body);
    expect(res.status).toBe(400);
    expect(JSON.parse(text).error).toBe('bad_request');
    expect(JSON.parse(text).detail).toContain(detail);
  });

  it('answers 400 for a non-JSON content type', async () => {
    const { res } = await send(noApi(), ask('hola'), env(), { contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('answers 413 for long messages, long conversations and huge bodies', async () => {
    for (const body of [
      ask('x'.repeat(1001)),
      { lang: 'en', messages: Array.from({ length: 21 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x' })) },
      JSON.stringify({ lang: 'en', messages: [{ role: 'user', content: 'x' }], pad: 'y'.repeat(200_000) }),
    ]) {
      const { res, text } = await send(noApi(), body);
      expect(res.status).toBe(413);
      expect(JSON.parse(text)).toEqual({ error: 'too_long' });
    }
  });

  it('answers 503 upstream when the key is missing or the catalog is unreachable', async () => {
    const missingKey = await send(noApi(), ask('hola'), env({ ANTHROPIC_API_KEY: undefined }));
    expect(missingKey.res.status).toBe(503);
    expect(JSON.parse(missingKey.text)).toEqual({ error: 'upstream' });

    const noCatalog = harness({ catalog: () => new Response('down', { status: 502 }) });
    const res = await send(noCatalog, ask('hola'));
    expect(res.res.status).toBe(503);
    expect(JSON.parse(res.text)).toEqual({ error: 'upstream' });
  });
});

describe('other routes', () => {
  const get = (path: string, method = 'GET', origin?: string) =>
    new Request(`https://pathfinder-api.legios.com.ar${path}`, { method, headers: origin ? { origin } : {} });

  it('GET /health reports the model and catalog size, from any origin', async () => {
    const h = harness();
    const res = await h.handle(get('/health'), env(), context().ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, model: 'claude-sonnet-5-5', catalog: 5 });
    // The catalog is fetched once and then served from memory.
    await h.handle(get('/health', 'GET', ORIGIN), env(), context().ctx);
    expect(h.catalogFetches()).toBe(1);
  });

  it('GET /health answers 503 when the catalog is unavailable', async () => {
    const h = harness({ catalog: () => new Response('down', { status: 500 }) });
    const res = await h.handle(get('/health'), env(), context().ctx);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, model: 'claude-sonnet-5-5', catalog: 0 });
  });

  it('handles preflight from allowed origins only', async () => {
    const h = harness();
    const ok = await h.handle(get('/chat', 'OPTIONS', 'http://localhost:5173'), env(), context().ctx);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(ok.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
    expect(ok.headers.get('access-control-allow-headers')).toBe('content-type');
    const denied = await h.handle(get('/chat', 'OPTIONS', 'https://evil.example'), env(), context().ctx);
    expect(denied.status).toBe(403);
  });

  it('answers 404 and 405', async () => {
    const h = harness();
    expect((await h.handle(get('/nope'), env(), context().ctx)).status).toBe(404);
    expect((await h.handle(get('/chat'), env(), context().ctx)).status).toBe(405);
    expect((await h.handle(get('/health', 'POST'), env(), context().ctx)).status).toBe(405);
  });
});

describe('MOCK=1', () => {
  const mock = env({ MOCK: '1', ANTHROPIC_API_KEY: undefined });

  it('streams a canned reply with picks from the real catalog, without calling Claude', async () => {
    const h = harness();
    const { res, events } = await send(h, ask('Quiero algo de AWS para empezar en la nube'), mock);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(h.calls).toHaveLength(0);
    const kinds = events.map((e) => e.event);
    expect(kinds.slice(-2)).toEqual(['picks', 'done']);
    expect(kinds.slice(0, -2).every((k) => k === 'text')).toBe(true);
    const { picks } = events.at(-2)!.data as { picks: { id: string; why: string }[] };
    expect(picks.length).toBeGreaterThanOrEqual(1);
    expect(picks.length).toBeLessThanOrEqual(5);
    expect(picks.map((p) => p.id)).toContain('aws-clf-c02');
    expect(picks.every((p) => /^[a-z0-9-]+$/.test(p.id) && p.why.length > 0)).toBe(true);
  });

  it('falls back to entry-level picks and speaks the request language', async () => {
    const { events } = await send(harness(), ask('zzz qqq', 'en'), mock);
    expect((events[0].data as { t: string }).t).toMatch(/^This is a mock reply/);
    const { picks } = events.at(-2)!.data as { picks: { id: string }[] };
    expect(picks.map((p) => p.id)).toEqual(['aws-aif-c01', 'aws-clf-c02', 'microsoft-az-900']);
  });

  it('mock:tools streams every event', async () => {
    const { events } = await send(harness(), ask('mock:tools'), mock);
    expect(events.map((e) => e.event).filter((k) => k !== 'text')).toEqual(['picks', 'roadmap', 'comparison', 'profile', 'replies', 'done']);
    const { picks } = events.find((e) => e.event === 'picks')!.data as { picks: { warning?: string }[] };
    expect(picks.some((p) => p.warning)).toBe(true);
  });

  it.each([
    ['mock:ask', ['text', 'text', 'done']],
    ['mock:refusal', ['error']],
    ['mock:overloaded', ['text', 'text', 'error']],
    ['mock:internal', ['error']],
  ])('%s produces that case', async (command, kinds) => {
    const { events } = await send(harness(), ask(command), mock);
    expect(events.map((e) => e.event)).toEqual(kinds);
  });

  it('mock:upstream answers 503 before streaming', async () => {
    const { res, text } = await send(harness(), ask('mock:upstream'), mock);
    expect(res.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ error: 'upstream' });
  });

  it('is not rate limited, since it costs nothing', async () => {
    const { keys, binding } = limiter(false);
    const { res } = await send(harness(), ask('hola'), { ...mock, CHAT_LIMITER: binding });
    expect(res.status).toBe(200);
    expect(keys).toEqual([]);
  });

  it('still enforces origin, kill switch and validation', async () => {
    expect((await send(harness(), ask('hola'), mock, { origin: null })).res.status).toBe(403);
    expect((await send(harness(), ask('hola'), { ...mock, CHAT_ENABLED: 'false' })).res.status).toBe(503);
    expect((await send(harness(), { lang: 'xx', messages: [] }, mock)).res.status).toBe(400);
  });
});
