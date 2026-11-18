// Worker entry point. See README.md for the API contract.

import Anthropic from '@anthropic-ai/sdk';
import type { Env } from './config';
import { createHandler } from './handler';

const handle = createHandler({
  createClient: (env) =>
    new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}),
      // One quick retry, then the visitor gets an error they can retry themselves.
      maxRetries: 1,
      timeout: 60_000,
    }),
  fetch: (input, init) => fetch(input, init),
  cache: () => (typeof caches === 'undefined' ? undefined : caches.default),
  now: () => Date.now(),
  // Log lines hold counts, latency and token usage only: never message text, never the key.
  log: (entry) => console.log(JSON.stringify(entry)),
  mockDelayMs: 40,
});

export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),
} satisfies ExportedHandler<Env>;
