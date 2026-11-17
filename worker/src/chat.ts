// One chat turn against Claude: build the request, wait for the stream to open, then relay
// text deltas as SSE and finish with the validated picks. The turn ends at the tool call;
// nothing is sent back to the model.

import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages';
import type { CompiledCatalog } from './catalog';
import type { Config } from './config';
import { validatePicks } from './picks';
import { SHOW_TOOL, TOOL_NAME, toApiMessages } from './prompt';
import { doneEvent, errorEvent, picksEvent, textEvent, type ErrorCode, type Pick } from './sse';
import type { ChatRequest } from './validate';

/** Room for a short reply, a five-card tool call and the little thinking low effort does. */
export const MAX_TOKENS = 4096;
/** Server-side refusal fallback; `fallbacks: "default"` lets Anthropic pick the model per refusal category. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export type Log = (entry: Record<string, unknown>) => void;

export function buildParams(config: Config, catalog: CompiledCatalog, request: ChatRequest): BetaMessageStreamParams {
  return {
    model: config.model,
    max_tokens: MAX_TOKENS,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    // Thinking is left at the model default (adaptive); effort keeps it short for chat.
    output_config: { effort: config.effort },
    // Tools and system are byte-identical across requests: the breakpoint on the system block
    // caches them for every visitor. The top-level marker caches the conversation so far.
    system: [{ type: 'text', text: catalog.system, cache_control: { type: 'ephemeral' } }],
    cache_control: { type: 'ephemeral' },
    tools: [SHOW_TOOL],
    tool_choice: { type: 'auto', disable_parallel_tool_use: true },
    messages: toApiMessages(request.messages, request.lang, catalog.ids),
  };
}

type Final = Anthropic.Beta.Messages.BetaMessage;

/** Error code for a failure after the SSE stream has started. */
export function streamErrorCode(err: unknown): ErrorCode {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529 || err.status === 429 || err.type === 'overloaded_error' || err.type === 'rate_limit_error') return 'overloaded';
  }
  return 'internal';
}

/** Error description for logs: class, status and API error type, never message text. */
export function describeError(err: unknown): Record<string, unknown> {
  if (err instanceof Anthropic.APIError) return { error: err.constructor.name, status: err.status ?? null, type: err.type ?? null };
  return { error: err instanceof Error ? err.constructor.name : typeof err };
}

function picksFrom(final: Final, known: ReadonlySet<string>) {
  // After a server-side fallback, tool calls before the last fallback block belong to the
  // declined attempt and are discarded.
  let start = 0;
  final.content.forEach((block, i) => {
    if (block.type === 'fallback') start = i + 1;
  });
  const items: unknown[] = [];
  for (const block of final.content.slice(start)) {
    if (block.type === 'tool_use' && block.name === TOOL_NAME) {
      const input = block.input as { picks?: unknown };
      if (Array.isArray(input?.picks)) items.push(...input.picks);
    }
  }
  return validatePicks({ picks: items }, known);
}

export type ModelStart = { ok: true; body: ReadableStream<Uint8Array>; finished: Promise<void> } | { ok: false };

export interface TurnContext {
  client: Anthropic;
  params: BetaMessageStreamParams;
  known: ReadonlySet<string>;
  /** Counts only, merged into the log line. */
  meta: Record<string, unknown>;
  now: () => number;
  log: Log;
}

/**
 * Opens the model stream. Resolves `{ ok: false }` when it fails before the first event, so
 * the caller can still answer with a plain HTTP error; otherwise the SSE body and a promise
 * that settles when the turn is over (for ctx.waitUntil).
 */
export async function startTurn(turn: TurnContext): Promise<ModelStart> {
  const { client, params, known, meta, now, log } = turn;
  const startedAt = now();
  const stream = client.beta.messages.stream(params);
  const iterator = stream[Symbol.asyncIterator]();
  let first: IteratorResult<Anthropic.Beta.Messages.BetaRawMessageStreamEvent>;
  try {
    first = await iterator.next();
    if (first.done) throw new Error('empty stream');
  } catch (err) {
    log({ evt: 'chat', outcome: 'upstream', ...describeError(err), ms: now() - startedAt, ...meta });
    return { ok: false };
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let open = true;
  const write = async (chunk: string) => {
    if (!open) return;
    try {
      await writer.write(encoder.encode(chunk));
    } catch {
      // The visitor closed the page: stop paying for tokens nobody reads.
      open = false;
      stream.abort();
    }
  };

  const finished = (async () => {
    const textBlocks = new Set<number>();
    let textChars = 0;
    let firstTextMs: number | undefined;
    let separator = false;
    let afterFallback = false;
    let sawTool = false;
    let final: Final | undefined;
    let failure: unknown;

    try {
      for (let result: IteratorResult<Anthropic.Beta.Messages.BetaRawMessageStreamEvent> = first; !result.done && open; result = await iterator.next()) {
        const event = result.value;
        if (event.type === 'content_block_start') {
          const type = event.content_block.type;
          if (type === 'text') {
            textBlocks.add(event.index);
            // A new text block after earlier text is a new paragraph, unless it continues a
            // reply that a fallback model took over mid-sentence.
            if (textChars > 0 && !afterFallback) separator = true;
            afterFallback = false;
          } else if (type === 'fallback') {
            afterFallback = true;
          } else if (type === 'tool_use') {
            sawTool = true;
          }
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && textBlocks.has(event.index)) {
          if (!event.delta.text) continue;
          const chunk = (separator ? '\n\n' : '') + event.delta.text;
          separator = false;
          firstTextMs ??= now() - startedAt;
          textChars += event.delta.text.length;
          await write(textEvent(chunk));
        }
      }
      if (open) final = await stream.finalMessage();
    } catch (err) {
      failure = err;
    }

    let outcome = 'done';
    let code: ErrorCode | undefined;
    let picks: Pick[] = [];
    let dropped = 0;
    if (!open) {
      outcome = 'client_gone';
    } else if (failure !== undefined) {
      // The SDK raises a plain AnthropicError when eager-streamed tool input is not valid
      // JSON. The text already went out, so finish without cards.
      const badToolInput = sawTool && failure instanceof Anthropic.AnthropicError && !(failure instanceof Anthropic.APIError);
      code = badToolInput && textChars > 0 ? undefined : streamErrorCode(failure);
    } else if (final?.stop_reason === 'refusal') {
      code = 'refusal';
    } else if (final) {
      // A tool call cut off by max_tokens can still parse as a partial object: never show it.
      if (final.stop_reason !== 'max_tokens') ({ picks, dropped } = picksFrom(final, known));
      if (picks.length) await write(picksEvent(picks));
      if (!picks.length && textChars === 0) code = 'internal';
    }
    if (open) {
      if (code) outcome = 'error';
      await write(code ? errorEvent(code) : doneEvent());
      await writer.close().catch(() => undefined);
    }

    const usage = final?.usage;
    log({
      evt: 'chat',
      outcome,
      code,
      ...(failure !== undefined ? describeError(failure) : {}),
      model: final?.model ?? params.model,
      fallback: Boolean(usage?.iterations?.some((it) => it.type === 'fallback_message')),
      stop: final?.stop_reason ?? null,
      refusal: final?.stop_details?.category ?? null,
      ...meta,
      outChars: textChars,
      picks: picks.length,
      dropped,
      ms: now() - startedAt,
      firstTextMs: firstTextMs ?? null,
      usage: usage
        ? {
            input: usage.input_tokens,
            output: usage.output_tokens,
            cacheRead: usage.cache_read_input_tokens ?? 0,
            cacheWrite: usage.cache_creation_input_tokens ?? 0,
          }
        : null,
    });
  })();

  return { ok: true, body: readable, finished };
}
