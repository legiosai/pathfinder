# pathfinder-chat

The Cloudflare Worker behind pathfinder's recommendation chat. It answers with Claude
(`claude-sonnet-5-5` by default) and recommends certifications from pathfinder's own catalog,
which it reads from the published site (`catalog.json`). Replies stream as server-sent events;
recommended certifications arrive as a separate `picks` event whose ids are guaranteed to exist
in the catalog.

It lives in its own directory with its own `package.json`, so the site at the repository root
stays dependency-free.

## API

`POST /chat` with `content-type: application/json`:

```json
{ "lang": "es", "messages": [{ "role": "user", "content": "Soy dev backend y quiero sumar IA" }] }
```

Messages alternate, start and end with `user`, at most 20. User content up to 1000 characters,
assistant content up to 4000. An assistant message may carry `"picks": ["id", ...]`, the
certifications its cards showed; the model sees them as `[Shown: id, id]`.

On success: `200`, `text/event-stream; charset=utf-8`, with these events in order:

```
event: text      data: {"t":"<chunk>"}                       zero or more
event: picks     data: {"picks":[{"id":"...","why":"..."}]}   at most one, 1-5 items
event: done      data: {}
```

If something fails after the stream started, the last event is
`event: error` with `data: {"code":"overloaded"|"refusal"|"internal"}`.

Errors before streaming:

| Status | Body | When |
| --- | --- | --- |
| 400 | `{"error":"bad_request","detail":"..."}` | invalid JSON, shape, roles or `lang` |
| 403 | `{"error":"origin"}` | `Origin` is not an allowed site |
| 413 | `{"error":"too_long"}` | a message over its limit, more than 20 messages, or a body over 128 KB |
| 429 | `{"error":"rate_limited","retryAfter":60}` + `Retry-After` | over the per-IP limit |
| 503 | `{"error":"disabled"}` | `CHAT_ENABLED` is off |
| 503 | `{"error":"upstream"}` | the catalog or the Claude API failed before the reply started |

`GET /health` returns `{"ok":true,"model":"<id>","catalog":<count>}` from any origin.

CORS echoes the origin only for `https://pathfinder.legios.com.ar`, `https://legiosai.github.io`
and `http://localhost` / `http://127.0.0.1` on any port. `POST /chat` without one of those
origins is rejected (a browser always sends it; other clients can fake it, so this keeps casual
use out, the rate limit does the rest).

## How it works

- **Catalog.** Fetched from `CATALOG_URL` and kept for 10 minutes in memory and in the Cache API;
  if the site is unreachable, the last good copy keeps serving for up to a day. Each certification
  becomes a small, sorted, deterministic text block (id, code, name, provider, category, level,
  status, fee, exam facts, scope, skills, roles, weighted domains, prep resources and practice
  question counts).
- **Prompt.** Instructions plus that catalog form the `system` prompt, marked with
  `cache_control`. Nothing per-request comes before that breakpoint (the interface language is a
  `<ui_language>` tag inside each user message), so every visitor shares one cached prefix. A
  top-level cache marker also caches the conversation so far.
- **Model call.** Streaming, `effort: low`, adaptive thinking (the model default), `max_tokens`
  4096, `tool_choice: auto`, and server-side refusal fallback enabled (`fallbacks: "default"`
  with the `server-side-fallback-2026-07-01` beta), which re-runs `cyber` and `frontier_llm`
  refusals on Claude Sonnet 5. Other refusals end the reply with `error: refusal`.
- **Tool.** The model recommends by calling `show_certifications` (strict schema, eager input
  streaming). The Worker validates the input itself, drops unknown ids and duplicates, keeps at
  most five and emits them as one `picks` event. The turn ends there; nothing goes back to the
  model. A tool call cut off by `max_tokens` is never shown.

## Privacy

Conversations are not stored anywhere: the Worker forwards them to the Claude API and keeps
nothing. Its log lines carry only counts (messages, characters, picks), latency, the stop
reason, refusal category, token usage and cache hits; never message text, IP addresses or the API
key. Cloudflare invocation logs are turned off in `wrangler.toml` for the same reason. The rate
limiter sees the client IP only to count requests.

## Configuration

`wrangler.toml` holds everything except the API key:

| Var | Default | Meaning |
| --- | --- | --- |
| `MODEL` | `claude-sonnet-5-5` | Claude model id |
| `EFFORT` | `low` | `low`, `medium`, `high`, `xhigh` or `max` |
| `CATALOG_URL` | `https://pathfinder.legios.com.ar/catalog.json` | catalog the prompt is built from |
| `CHAT_ENABLED` | `1` | kill switch: `0` answers `503 disabled` without calling Claude |
| `MOCK` | `0` | `1` streams a canned reply instead of calling Claude |

The `CHAT_LIMITER` binding allows **8 chat requests per minute per client IP**. Cloudflare
counts per location and the count is eventually consistent, so treat it as a guard against
abuse, not an exact quota. It is skipped in mock mode.

The API key is a secret named `ANTHROPIC_API_KEY`. It never goes in a file and is never logged.
`ANTHROPIC_BASE_URL` is optional and stays unset in production; it points the SDK at a local
stub when testing the real request path under `wrangler dev`.

## Development

```sh
cd worker
npm ci
npm test               # vitest: pure functions and the handler end to end, no network, no key
npm run typecheck
npx wrangler dev --var MOCK:1 --port 8787
curl -N http://127.0.0.1:8787/chat -H 'origin: http://localhost:5173' \
  -H 'content-type: application/json' \
  -d '{"lang":"en","messages":[{"role":"user","content":"I want to start in cloud"}]}'
```

With `MOCK=1` the reply is canned but follows the contract, with picks from the real catalog. A
last user message of `mock:ask`, `mock:refusal`, `mock:overloaded`, `mock:internal` or
`mock:upstream` produces that case, for testing the UI's error states.

## Deploy

Needs a Cloudflare login on the account that holds the `legios.com.ar` zone, and an Anthropic API
key.

```sh
cd worker
npm ci
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY     # paste the key at the prompt
npx wrangler deploy
curl https://pathfinder-api.legios.com.ar/health
```

The first deploy creates the custom domain `pathfinder-api.legios.com.ar` (DNS record and
certificate). To switch the chat off, set `CHAT_ENABLED = "0"` in `wrangler.toml` and deploy,
or run `npx wrangler deploy --var CHAT_ENABLED:0`; the next normal deploy turns it back on.

## Costs and limits

Prices for Claude Sonnet 5.5: $2 per million input tokens, $10 per million output tokens, cache
reads $0.10 and 5-minute cache writes $2.50 per million.

- The cached prefix (instructions, tool and catalog) is roughly 10-14K tokens with 44
  certifications and grows with the catalog. The exact figure shows up as `cacheRead` or
  `cacheWrite` in the Worker's logs.
- A message while the cache is warm (another request in the last 5 minutes) costs about
  $0.005-0.01: the cached read, the new turn and a few hundred output tokens.
- The first message after a quiet spell also writes the cache: about $0.03-0.04 more.
- The ceiling for one request (20 long messages and the full 4096 output tokens) is under $0.10.

Set a monthly spend limit on the Anthropic workspace that owns the key; the per-IP rate limit
does not cap total spend.
