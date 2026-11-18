# pathfinder-chat

The backend behind pathfinder's recommendation chat. It answers with Claude
(`claude-sonnet-5-5` by default) and recommends certifications from pathfinder's own catalog,
which it reads from the published site (`catalog.json`). Replies stream as server-sent events;
recommended certifications arrive as a separate `picks` event whose ids are guaranteed to exist
in the catalog.

Production runs on Vercel (project `pathfinder-chat`) and reaches Claude through Vercel AI
Gateway. The same handler also deploys as a Cloudflare Worker (`src/index.ts`, `wrangler.toml`);
`vercel/entry.ts` is the Vercel wrapper around it.

It lives in its own directory with its own `package.json`, so the site at the repository root
stays dependency-free.

## API

`POST /chat` with `content-type: application/json`:

```json
{ "lang": "es", "messages": [{ "role": "user", "content": "Soy dev backend y quiero sumar IA" }] }
```

Messages alternate, start and end with `user`, at most 20. User content up to 1000 characters,
assistant content up to 4000. An assistant message may carry `"picks": ["id", ...]`, the
certifications its cards, roadmap or table showed; the model sees them as `[Shown: id, id]`.

An optional `profile` object sends back what an earlier `profile` event recorded (see below):
`role`, `experience` (`new`, `some` or `experienced`), `goal`, `budget_usd`, `hours_per_week`,
`prefers_spanish_exam`, `country` (two letters). Invalid fields are dropped, not refused; a
`profile` that is not an object is a 400. It reaches the model as a `<profile>` tag on the last
user message only, after the cache breakpoint.

On success: `200`, `text/event-stream; charset=utf-8`, with these events in order:

```
event: text        data: {"t":"<chunk>"}                                    zero or more
event: picks       data: {"picks":[{"id":"...","why":"...","warning":"..."}]} at most one, 1-5 items
event: roadmap     data: {"steps":[{"id":"...","weeks":4,"note":"..."}],"hours_per_week":5}
event: comparison  data: {"ids":["...","..."]}                               2-4 ids
event: profile     data: {"profile":{"role":"...","hours_per_week":5}}
event: replies     data: {"replies":["...","..."]}                           1-4 short replies
event: done        data: {}
```

Every event after `text` is optional and appears at most once, in this order. Every id is
guaranteed to exist in the catalog. `warning` is optional (eligibility, an exam not open yet,
experience required, over budget, English only). Roadmap steps are 2-6, in order; `weeks` is an
integer from 1 to 104, or `null` when the model gave nothing usable; `hours_per_week` is optional.
A `why` can be empty: when the model names catalog certifications in its text without calling
`show_certifications`, the Worker shows them itself (see Tools). Clients should ignore events
they don't know; the page has done so since the first version, so new kinds are safe to add.

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
  becomes a small, sorted, deterministic text block (see Catalog text below).
- **Prompt.** Instructions plus that catalog form the `system` prompt, marked with
  `cache_control`. Nothing per-request comes before that breakpoint (the interface language is a
  `<ui_language>` tag inside each user message), so every visitor shares one cached prefix. A
  top-level cache marker also caches the conversation so far.
- **Model call.** Streaming, `effort: low`, adaptive thinking (the model default), `max_tokens`
  4096, `tool_choice: auto` with parallel tool calls, and server-side refusal fallback enabled (`fallbacks: "default"`
  with the `server-side-fallback-2026-07-01` beta), which re-runs `cyber` and `frontier_llm`
  refusals on Claude Sonnet 5. Other refusals end the reply with `error: refusal`.
- **Tools.** Five strict tools with eager input streaming, called in parallel at the end of a
  reply: `show_certifications` (cards, each with a reason and an optional warning),
  `show_roadmap` (an ordered path with weeks per step), `show_comparison` (2-4 ids; the page
  builds the table from the catalog), `suggest_replies` (tappable next messages) and
  `set_profile` (facts the person stated, which the page keeps and sends back as `profile`). The
  Worker validates every input itself (`src/picks.ts`, `src/tools.ts`): unknown ids, duplicates,
  bad shapes and items over the limits are dropped, and each tool becomes one event. The turn
  ends there; nothing goes back to the model. Tool calls cut off by `max_tokens` are never shown.
- **Safety net.** When a reply names catalog certifications (by exam code or a distinctive name,
  `src/mentions.ts`) and has no valid `show_certifications` call, the Worker emits a `picks`
  event for them with an empty `why`, leaving out any the roadmap or table already shows.
- **Catalog text.** Besides the basics, each certification carries its fee note, passing score,
  validity, caveats, exam languages and delivery, free routes and discounts, retake and
  accommodation rules, dated changes still ahead (`timeline`, filtered by today's date) and the
  titles and cost of its prep resources; the study paths by goal and the region notes come first.
  Long free text is capped (`CAPS` in `src/catalog.ts`). With 85 certifications the system prompt
  is about 112,000 characters, roughly 28-32K tokens.

## Privacy

Conversations are not stored anywhere: the Worker forwards them to the Claude API and keeps
nothing. Its log lines carry only counts (messages, characters, picks), latency, the stop
reason, refusal category, token usage and cache hits; never message text, IP addresses or the API
key. Cloudflare invocation logs are turned off in `wrangler.toml` for the same reason. On Vercel, the
platform's own request logs record each request (path, status, region) as for any site hosted
there, and messages pass through Vercel AI Gateway on their way to Claude. The rate limiter sees
the client IP only to count requests.

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
`mock:upstream` produces that case, for testing the UI's error states, and `mock:tools` a reply
with every event.

### Eval

`scripts/eval.mjs` replays 13 conversations (vague beginner, low budget in Argentina, an ordered
path, CISSP with one year, US$100 in three weeks, "¿algo más barato?", off-topic, dumps, prompt
injection, a certification not in the catalog, a bare code, an exam in Spanish) and checks each
reply automatically: valid ids, cards whenever it recommends, warnings over budget and on
restricted picks, nothing over budget called cheap, no markdown, at most ~150 words, the person's
language, at most one question, no invented certification codes, no prompt leak.

```sh
node scripts/eval.mjs http://127.0.0.1:8813 --catalog ../dist/catalog.json   # the site's mock
node scripts/eval.mjs https://pathfinder-api.legios.com.ar --out eval.json  # production, ~US$0.30
```

Against a non-local endpoint it waits 8 s between cases to stay under the rate limit. Exit code 1
when any check fails; `--only id,id` runs a subset.

## Deploy

### Vercel (production)

Needs `VERCEL_TOKEN` with access to the team that owns the `pathfinder-chat` project. The project
has one secret, `AI_GATEWAY_API_KEY`: an AI Gateway key with its own monthly budget, so a
traffic spike stops at the budget instead of running up the bill. `MODEL` defaults to
`anthropic/claude-sonnet-5-5`; `EFFORT`, `CATALOG_URL`, `CHAT_ENABLED` and `MOCK` work as below.

```sh
cd worker
npm ci
npx vercel link --project pathfinder-chat     # once, writes .vercel/project.json
npm run deploy:vercel                         # bundles vercel/entry.ts into api/index.mjs, deploys to production
curl https://pathfinder-api.legios.com.ar/health
```

`pathfinder-api.legios.com.ar` is a DNS-only CNAME to `cname.vercel-dns.com` in Cloudflare.
Vercel has no rate-limit binding, so `vercel/limiter.ts` counts requests per IP in each function
instance's memory: it stops one visitor's burst, not traffic spread across instances; the key's
budget is the hard ceiling. To switch the chat off, set `CHAT_ENABLED=0` in the project's
environment variables and redeploy.

### Cloudflare Workers (alternative)

Needs a Cloudflare login on the account that holds the `legios.com.ar` zone and an Anthropic API
key, and the DNS record above removed first.

```sh
cd worker
npm ci
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY     # paste the key at the prompt
npx wrangler deploy
```

The first deploy creates the custom domain (DNS record and certificate). To switch the chat off,
set `CHAT_ENABLED = "0"` in `wrangler.toml` and deploy, or run
`npx wrangler deploy --var CHAT_ENABLED:0`; the next normal deploy turns it back on.

## Costs and limits

Prices for Claude Sonnet 5.5: $2 per million input tokens, $10 per million output tokens, cache
reads $0.10 and 5-minute cache writes $2.50 per million.

- The cached prefix (instructions, tools and catalog) is roughly 28-32K tokens with 85
  certifications and grows with the catalog and its access and timeline fields. The exact figure
  shows up as `cacheRead` or `cacheWrite` in the Worker's logs.
- A message while the cache is warm (another request in the last 5 minutes) costs about
  $0.005-0.01: the cached read, the new turn and a few hundred output tokens.
- The first message after a quiet spell also writes the cache: about $0.07-0.08 more.
- A `profile` changes the last user message on every turn, so with one only the system prompt
  (tools, instructions and catalog) is read from cache; the conversation itself is re-read at the
  normal input price, a few hundred tokens per turn.
- The ceiling for one request (20 long messages, the full 4096 output tokens and a cache write) is
  under $0.20.

Through AI Gateway the token prices are the same as Anthropic's. Keep a monthly budget on the
key (on Vercel) or a spend limit on the Anthropic workspace (on Cloudflare); the per-IP rate
limit does not cap total spend.
