// Validation of show_certifications input. With eager input streaming the API does not
// validate tool input, and the SDK's tolerant parser can return a truncated object, so
// every pick is checked here before it reaches the UI.

import type { Pick } from './sse';

export const MAX_PICKS = 5;
export const MAX_WHY_CHARS = 240;
export const MAX_WARNING_CHARS = 160;

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** One line: no runs of whitespace, no line breaks. */
export const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Cuts at a word boundary and adds an ellipsis when the text is over `max` characters. */
export function shorten(text: string, max = MAX_WHY_CHARS): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export interface PicksResult {
  picks: Pick[];
  /** Items dropped: unknown ids, duplicates, bad shapes or over the limit. */
  dropped: number;
}

/**
 * Keeps well-formed picks whose id exists in the catalog, deduplicated, at most five. A warning
 * is optional: kept when it is a non-empty string, dropped otherwise without losing the pick.
 */
export function validatePicks(input: unknown, known: ReadonlySet<string>): PicksResult {
  const items = isObject(input) && Array.isArray(input.picks) ? input.picks : [];
  const picks: Pick[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!isObject(item) || typeof item.id !== 'string' || typeof item.why !== 'string') continue;
    const id = item.id.trim();
    const why = oneLine(item.why);
    if (!known.has(id) || seen.has(id) || !why || picks.length >= MAX_PICKS) continue;
    seen.add(id);
    const pick: Pick = { id, why: shorten(why) };
    const warning = typeof item.warning === 'string' ? oneLine(item.warning) : '';
    if (warning) pick.warning = shorten(warning, MAX_WARNING_CHARS);
    picks.push(pick);
  }
  return { picks, dropped: items.length - picks.length };
}
