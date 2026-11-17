// Test doubles: a fake network (catalog + Anthropic API) behind the real SDK, a fake
// execution context and builders for the API's streaming events.

import Anthropic from '@anthropic-ai/sdk';
import catalogJson from './fixtures/catalog.json';
import type { Env } from '../src/config';
import { createHandler, type Deps } from '../src/handler';
import { parseSse, type ParsedEvent } from '../src/sse';

export const CATALOG_URL = 'https://pathfinder.test/catalog.json';
export const ORIGIN = 'https://pathfinder.legios.com.ar';
export const API_KEY = 'sk-ant-test-key-never-logged';
export const fixture = catalogJson;

export type ApiEvent = Record<string, unknown>;

/** Anthropic's wire format: one `event:` + `data:` pair per event. */
export function sseBody(events: (ApiEvent | { raw: string })[]): string {
  return events
    .map((e) => ('raw' in e ? e.raw : `event: ${e.type as string}\ndata: ${JSON.stringify(e)}\n\n`))
    .join('');
}

export const ev = {
  start: (model = 'claude-sonnet-5-5', usage: Record<string, number> = {}) => ({
    type: 'message_start',
    message: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 40, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 9100, ...usage },
    },
  }),
  thinking: (index: number): ApiEvent[] => [
    { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: 'sig' } },
    { type: 'content_block_stop', index },
  ],
  text: (index: number, chunks: string[]): ApiEvent[] => [
    { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
    ...chunks.map((text) => ({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } })),
    { type: 'content_block_stop', index },
  ],
  tool: (index: number, json: string[], { name = 'show_certifications', stop = true } = {}): ApiEvent[] => [
    { type: 'content_block_start', index, content_block: { type: 'tool_use', id: `toolu_${index}`, name, input: {} } },
    ...json.map((partial_json) => ({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json } })),
    ...(stop ? [{ type: 'content_block_stop', index }] : []),
  ],
  fallback: (index: number, from = 'claude-sonnet-5-5', to = 'claude-sonnet-5'): ApiEvent[] => [
    {
      type: 'content_block_start',
      index,
      content_block: { type: 'fallback', from: { model: from }, to: { model: to }, trigger: { type: 'refusal', category: 'cyber' } },
    },
    { type: 'content_block_stop', index },
  ],
  delta: (stop_reason: string, extra: Record<string, unknown> = {}, usage: Record<string, unknown> = {}) => ({
    type: 'message_delta',
    delta: { stop_reason, stop_sequence: null, ...extra },
    usage: { output_tokens: 120, ...usage },
  }),
  stop: () => ({ type: 'message_stop' }),
  error: (type = 'overloaded_error') => ({ raw: `event: error\ndata: ${JSON.stringify({ type: 'error', error: { type, message: 'Overloaded' } })}\n\n` }),
};

export const picksJson = (picks: { id: string; why: string }[]) => JSON.stringify({ picks });

/** Splits a string into pieces, as the API streams tool input. */
export const pieces = (text: string, size = 17) => Array.from({ length: Math.ceil(text.length / size) }, (_, i) => text.slice(i * size, (i + 1) * size));

export interface ApiCall {
  url: string;
  headers: Headers;
  body: Record<string, any>;
}

type ApiReply = Response | (() => Response | Promise<Response>);

export function streamResponse(events: (ApiEvent | { raw: string })[]): Response {
  return new Response(sseBody(events), { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_test' } });
}

/** A streamed reply whose events arrive with a pause between them. */
export function slowStreamResponse(events: (ApiEvent | { raw: string })[], ms = 5): Response {
  const encoder = new TextEncoder();
  const chunks = sseBody(events).split(/(?<=\n\n)/);
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i >= chunks.length) return controller.close();
      await new Promise((r) => setTimeout(r, ms));
      controller.enqueue(encoder.encode(chunks[i++]));
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

export function apiError(status: number, type: string): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message: type } }), {
    status,
    headers: { 'content-type': 'application/json', 'request-id': 'req_test' },
  });
}

export interface Harness {
  handle: ReturnType<typeof createHandler>;
  calls: ApiCall[];
  catalogFetches: () => number;
  logs: Record<string, unknown>[];
  deps: Deps;
}

export function harness(options: { reply?: ApiReply; catalog?: () => Response; mockDelayMs?: number } = {}): Harness {
  const calls: ApiCall[] = [];
  const logs: Record<string, unknown>[] = [];
  let catalogCount = 0;
  const catalog = options.catalog ?? (() => new Response(JSON.stringify(fixture), { headers: { 'content-type': 'application/json' } }));

  const apiFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? '{}')) });
    const reply = options.reply;
    if (!reply) throw new Error('unexpected Anthropic call');
    return typeof reply === 'function' ? reply() : reply;
  };

  const deps: Deps = {
    createClient: (env) => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: 'https://api.anthropic.test', fetch: apiFetch, maxRetries: 0 }),
    fetch: (async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url !== CATALOG_URL) throw new Error(`unexpected fetch ${url}`);
      catalogCount++;
      return catalog();
    }) as typeof fetch,
    now: () => Date.now(),
    log: (entry) => logs.push(entry),
    mockDelayMs: options.mockDelayMs ?? 0,
  };
  return { handle: createHandler(deps), calls, catalogFetches: () => catalogCount, logs, deps };
}

export function env(overrides: Partial<Env> = {}): Env {
  return {
    MODEL: 'claude-sonnet-5-5',
    EFFORT: 'low',
    CATALOG_URL,
    CHAT_ENABLED: '1',
    MOCK: '0',
    ANTHROPIC_API_KEY: API_KEY,
    ...overrides,
  };
}

export function limiter(allow: boolean) {
  const keys: string[] = [];
  return {
    keys,
    binding: {
      limit: async ({ key }: { key: string }) => {
        keys.push(key);
        return { success: allow };
      },
    } as RateLimit,
  };
}

export function context() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p) },
    settle: () => Promise.all(pending),
  };
}

export const userMessage = (content: string) => ({ role: 'user', content });

export function chatRequest(body: unknown, { origin = ORIGIN as string | null, ip = '203.0.113.7', contentType = 'application/json' } = {}): Request {
  const headers: Record<string, string> = { 'content-type': contentType, 'cf-connecting-ip': ip };
  if (origin) headers.origin = origin;
  return new Request('https://pathfinder-api.legios.com.ar/chat', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Sends a chat request and returns the response, its parsed events and the finished logs. */
export async function send(h: Harness, body: unknown, e: Env = env(), options: Parameters<typeof chatRequest>[1] = {}) {
  const { ctx, settle } = context();
  const res = await h.handle(chatRequest(body, options), e, ctx);
  const text = await res.text();
  await settle();
  const events: ParsedEvent[] = res.headers.get('content-type')?.startsWith('text/event-stream') ? parseSse(text) : [];
  return { res, text, events };
}
