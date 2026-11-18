// Server-sent events in the shape the chat UI reads.
// JSON.stringify escapes newlines, so every event is a single `data:` line. Clients ignore events
// they don't know, so new kinds can be added without breaking an older page.

export type ErrorCode = 'overloaded' | 'refusal' | 'internal';

export interface Pick {
  id: string;
  /** Why it fits, in the person's language. Empty for picks the Worker found in the text itself. */
  why: string;
  /** Something that could stop or surprise them: eligibility, an exam not open yet, over budget. */
  warning?: string;
}

export interface RoadmapStep {
  id: string;
  /** Estimated weeks at the person's weekly hours; null when the model gave none that makes sense. */
  weeks: number | null;
  note: string;
}

export interface Roadmap {
  steps: RoadmapStep[];
  /** The weekly hours the estimate assumes, when the model said. */
  hours_per_week?: number;
}

export type Experience = 'new' | 'some' | 'experienced';

/** What the person said about themselves, recorded by set_profile and sent back by the page. */
export interface Profile {
  role?: string;
  experience?: Experience;
  goal?: string;
  budget_usd?: number;
  hours_per_week?: number;
  prefers_spanish_exam?: boolean;
  country?: string;
}

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const textEvent = (t: string) => sseEvent('text', { t });
export const picksEvent = (picks: Pick[]) => sseEvent('picks', { picks });
export const roadmapEvent = (roadmap: Roadmap) => sseEvent('roadmap', roadmap);
export const comparisonEvent = (ids: string[]) => sseEvent('comparison', { ids });
export const repliesEvent = (replies: string[]) => sseEvent('replies', { replies });
export const profileEvent = (profile: Profile) => sseEvent('profile', { profile });
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
