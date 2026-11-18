// Vercel entry point: the same handler as the Worker (src/index.ts), with Claude reached through
// Vercel AI Gateway. scripts in package.json bundle this file into api/index.mjs for deploys.

import Anthropic from '@anthropic-ai/sdk';
import type { Env } from '../src/config';
import { createHandler } from '../src/handler';
import { memoryLimiter } from './limiter';

// Node's process, declared here so the Worker's type set (no @types/node) still checks this file.
declare const process: { env: Record<string, string | undefined> };

const GATEWAY = 'https://ai-gateway.vercel.sh';
/** Gateway model ids carry the provider: anthropic/claude-sonnet-5-5. */
const DEFAULT_GATEWAY_MODEL = 'anthropic/claude-sonnet-5-5';

const handle = createHandler({
  createClient: (env) =>
    new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      baseURL: env.ANTHROPIC_BASE_URL,
      maxRetries: 1,
      timeout: 60_000,
    }),
  fetch: (input, init) => fetch(input, init),
  cache: () => undefined, // no Cache API on Vercel: the catalog stays in module memory
  now: () => Date.now(),
  // Counts, latency and token usage only: never message text, never the key.
  log: (entry) => console.log(JSON.stringify(entry)),
  mockDelayMs: 40,
});

const limiter = memoryLimiter({ limit: 8, periodMs: 60_000 });

function env(): Env {
  return {
    MODEL: process.env.MODEL || DEFAULT_GATEWAY_MODEL,
    EFFORT: process.env.EFFORT,
    CATALOG_URL: process.env.CATALOG_URL,
    CHAT_ENABLED: process.env.CHAT_ENABLED,
    MOCK: process.env.MOCK,
    EXTRA_ORIGINS: process.env.EXTRA_ORIGINS,
    ANTHROPIC_API_KEY: process.env.AI_GATEWAY_API_KEY,
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || GATEWAY,
    CHAT_LIMITER: limiter as unknown as Env['CHAT_LIMITER'],
  };
}

// The response streams after the handler returns; the invocation stays open until the body ends,
// so background work only needs its errors swallowed.
const ctx = { waitUntil: (promise: Promise<unknown>) => void promise.catch(() => undefined) };

const run = (request: Request) => handle(request, env(), ctx);
export { run as GET, run as POST, run as OPTIONS };
