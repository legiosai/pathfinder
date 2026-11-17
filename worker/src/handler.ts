// HTTP layer: routing, CORS, the kill switch, rate limiting, validation, then the model
// (or the mock) as server-sent events.

import type Anthropic from '@anthropic-ai/sdk';
import { buildParams, startTurn, type Log } from './chat';
import { CatalogStore, type CompiledCatalog } from './catalog';
import { readConfig, type Env } from './config';
import { corsHeaders, isAllowedOrigin, preflightHeaders } from './cors';
import { planMock } from './mock';
import { doneEvent, errorEvent, picksEvent, textEvent } from './sse';
import { LIMITS, validateChatRequest, type ChatRequest } from './validate';

/** Seconds a client should wait after a 429; the limiter counts per minute. */
export const RETRY_AFTER_SECONDS = 60;

export interface Deps {
  createClient: (env: Env) => Anthropic;
  fetch: typeof fetch;
  cache?: () => Cache | undefined;
  now: () => number;
  log: Log;
  /** Pause between mock chunks, so the UI sees a stream. */
  mockDelayMs: number;
}

interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  'x-content-type-options': 'nosniff',
};

function json(status: number, body: unknown, origin: string | null, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders(origin), ...extra },
  });
}

const sleep = (ms: number) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

export function createHandler(deps: Deps) {
  const stores = new Map<string, CatalogStore>();
  const catalogFor = (url: string) => {
    let store = stores.get(url);
    if (!store) {
      store = new CatalogStore({ url, fetch: deps.fetch, cache: deps.cache?.(), now: deps.now, log: deps.log });
      stores.set(url, store);
    }
    return store.get();
  };

  async function health(env: Env, origin: string | null): Promise<Response> {
    const { model, catalogUrl } = readConfig(env);
    try {
      const catalog = await catalogFor(catalogUrl);
      return json(200, { ok: true, model, catalog: catalog.count }, origin);
    } catch {
      return json(503, { ok: false, model, catalog: 0 }, origin);
    }
  }

  function mockStream(request: ChatRequest, catalog: CompiledCatalog, origin: string, ctx: Ctx): Response {
    const plan = planMock(request, catalog);
    if (plan.kind === 'upstream') return json(503, { error: 'upstream' }, origin);
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const run = async () => {
      for (const chunk of plan.chunks) {
        await sleep(deps.mockDelayMs);
        await writer.write(encoder.encode(textEvent(chunk)));
      }
      if (plan.error) {
        await writer.write(encoder.encode(errorEvent(plan.error)));
      } else {
        if (plan.picks.length) await writer.write(encoder.encode(picksEvent(plan.picks)));
        await writer.write(encoder.encode(doneEvent()));
      }
      await writer.close();
    };
    ctx.waitUntil(run().catch(() => writer.abort().catch(() => undefined)));
    return new Response(readable, { status: 200, headers: { ...SSE_HEADERS, ...corsHeaders(origin) } });
  }

  async function chat(request: Request, env: Env, ctx: Ctx, origin: string | null): Promise<Response> {
    if (!isAllowedOrigin(origin)) return json(403, { error: 'origin' }, origin);
    const config = readConfig(env);
    if (!config.enabled) return json(503, { error: 'disabled' }, origin);

    // The limit protects the API budget; mock replies cost nothing, so UI work isn't throttled.
    if (env.CHAT_LIMITER && !config.mock) {
      const key = request.headers.get('cf-connecting-ip') ?? 'unknown';
      const allowed = await env.CHAT_LIMITER.limit({ key }).then(
        (r) => r.success,
        () => true, // fail open: a limiter outage should not take the chat down
      );
      if (!allowed) {
        deps.log({ evt: 'rate_limited' });
        return json(429, { error: 'rate_limited', retryAfter: RETRY_AFTER_SECONDS }, origin, { 'retry-after': String(RETRY_AFTER_SECONDS) });
      }
    }

    if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
      return json(400, { error: 'bad_request', detail: 'content-type must be application/json' }, origin);
    }
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > LIMITS.bodyBytes) return json(413, { error: 'too_long' }, origin);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > LIMITS.bodyBytes) return json(413, { error: 'too_long' }, origin);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { error: 'bad_request', detail: 'body must be valid JSON' }, origin);
    }
    const checked = validateChatRequest(body);
    if (!checked.ok) return json(checked.status, checked.body, origin);
    const chatRequest = checked.value;

    let catalog: CompiledCatalog;
    try {
      catalog = await catalogFor(config.catalogUrl);
    } catch {
      return json(503, { error: 'upstream' }, origin);
    }

    if (config.mock) return mockStream(chatRequest, catalog, origin, ctx);
    if (!env.ANTHROPIC_API_KEY) {
      deps.log({ evt: 'config_error', missing: 'ANTHROPIC_API_KEY' });
      return json(503, { error: 'upstream' }, origin);
    }

    const meta = {
      lang: chatRequest.lang,
      messages: chatRequest.messages.length,
      inChars: chatRequest.messages.reduce((n, m) => n + m.content.length, 0),
    };
    const turn = await startTurn({
      client: deps.createClient(env),
      params: buildParams(config, catalog, chatRequest),
      known: catalog.ids,
      meta,
      now: deps.now,
      log: deps.log,
    });
    if (!turn.ok) return json(503, { error: 'upstream' }, origin);
    ctx.waitUntil(turn.finished);
    return new Response(turn.body, { status: 200, headers: { ...SSE_HEADERS, ...corsHeaders(origin) } });
  }

  return async function handle(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    const origin = request.headers.get('origin');
    if (request.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin)) return json(403, { error: 'origin' }, origin);
      return new Response(null, { status: 204, headers: preflightHeaders(origin) });
    }
    if (pathname === '/health') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(405, { error: 'method' }, origin, { allow: 'GET, OPTIONS' });
      return health(env, origin);
    }
    if (pathname === '/chat') {
      if (request.method !== 'POST') return json(405, { error: 'method' }, origin, { allow: 'POST, OPTIONS' });
      try {
        return await chat(request, env, ctx, origin);
      } catch (err) {
        deps.log({ evt: 'chat', outcome: 'crash', error: err instanceof Error ? err.constructor.name : typeof err });
        return json(503, { error: 'upstream' }, origin);
      }
    }
    return json(404, { error: 'not_found' }, origin);
  };
}
