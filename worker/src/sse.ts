// Server-sent events in the shape the chat UI reads.
// JSON.stringify escapes newlines, so every event is a single `data:` line.

export type ErrorCode = 'overloaded' | 'refusal' | 'internal';

export interface Pick {
  id: string;
  why: string;
}

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const textEvent = (t: string) => sseEvent('text', { t });
export const picksEvent = (picks: Pick[]) => sseEvent('picks', { picks });
export const doneEvent = () => sseEvent('done', {});
export const errorEvent = (code: ErrorCode) => sseEvent('error', { code });

export interface ParsedEvent {
  event: string;
  data: unknown;
}

/** Parses a complete SSE body. Used by the tests and handy for debugging. */
export function parseSse(body: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  for (const chunk of body.split('\n\n')) {
    if (!chunk.trim()) continue;
    let event = 'message';
    const data: string[] = [];
    for (const line of chunk.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data.push(line.slice(6));
    }
    events.push({ event, data: JSON.parse(data.join('\n')) });
  }
  return events;
}
