// Validation of show_certifications input. With eager input streaming the API does not
// validate tool input, and the SDK's tolerant parser can return a truncated object, so
// every pick is checked here before it reaches the UI.

import type { Pick } from './sse';

export const MAX_PICKS = 5;
export const MAX_WHY_CHARS = 240;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function shorten(text: string): string {
  if (text.length <= MAX_WHY_CHARS) return text;
  const cut = text.slice(0, MAX_WHY_CHARS - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > MAX_WHY_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export interface PicksResult {
  picks: Pick[];
  /** Items dropped: unknown ids, duplicates, bad shapes or over the limit. */
  dropped: number;
}

/** Keeps well-formed picks whose id exists in the catalog, deduplicated, at most five. */
export function validatePicks(input: unknown, known: ReadonlySet<string>): PicksResult {
  const items = isObject(input) && Array.isArray(input.picks) ? input.picks : [];
  const picks: Pick[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!isObject(item) || typeof item.id !== 'string' || typeof item.why !== 'string') continue;
    const id = item.id.trim();
    const why = item.why.replace(/\s+/g, ' ').trim();
    if (!known.has(id) || seen.has(id) || !why || picks.length >= MAX_PICKS) continue;
    seen.add(id);
    picks.push({ id, why: shorten(why) });
  }
  return { picks, dropped: items.length - picks.length };
}
