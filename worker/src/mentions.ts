// The safety net for replies that name certifications without showing them: finds catalog
// certifications in the reply text by exam code or by a distinctive name, so the Worker can show
// their cards when the model forgot to call show_certifications. It errs on the side of missing a
// mention: a card for a certification the reply only ruled out would be worse than no card.

export type Mentions = (text: string) => string[];

interface Named {
  id: string;
  name: string;
  code: string;
  provider: string;
}

/** Words too common in prose to identify a certification on their own (two-word names). */
const GENERIC = new Set(
  'ai data cloud security engineer engineering developer development associate professional expert specialist operations infrastructure networking agentic generative science accelerated foundations fundamentals architect administrator analyst certified models model application applications platform rack interconnect context course certificate exam'.split(
    ' ',
  ),
);
/** All-caps codes that are also everyday acronyms. */
const AMBIGUOUS_CODES = new Set(['ACE', 'PCA', 'PDE', 'AWS', 'API', 'SOC', 'LLM', 'CLI']);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SEP = '[\\s\\-\\u2010-\\u2015]';

/** Code-like pieces of an exam code: "OSCP+ / PEN-200" gives OSCP+, OSCP and PEN-200. */
function codeAliases(code: string): { text: string; caseless: boolean }[] {
  const out: { text: string; caseless: boolean }[] = [];
  for (const token of code.split(/[\s/()]+/).filter(Boolean)) {
    if (/\d/.test(token) && /[A-Za-z]/.test(token) && token.length >= 4) out.push({ text: token, caseless: true });
    else if (/^[A-Z][A-Z+-]{2,}$/.test(token) && !AMBIGUOUS_CODES.has(token)) {
      out.push({ text: token, caseless: false });
      if (token.endsWith('+') && token.length >= 4) out.push({ text: token.slice(0, -1), caseless: false });
    } else if (/^e[A-Z]{3,}$/.test(token)) out.push({ text: token, caseless: false });
  }
  return out;
}

function distinctive(name: string): boolean {
  const words = name.split(/[\s\-‐-―]+/).filter(Boolean);
  if (words.length >= 3) return true;
  if (words.length === 2) return words.some((w) => !GENERIC.has(w.toLowerCase()));
  // One word: only marked ones like Security+ or SecurityX.
  return words.length === 1 && (/\+$/.test(words[0]) || /[a-z][A-Z]/.test(words[0]));
}

/** The name as written, without the provider's prefix, and with the provider in front. */
function nameAliases(cert: Named): string[] {
  const out = new Set<string>();
  const name = cert.name.trim();
  for (const inner of name.match(/\(([^)]+)\)/g) ?? []) out.add(inner.slice(1, -1).trim());
  const plain = name.replace(/\s*\([^)]*\)/g, '').trim();
  out.add(plain);
  const provider = cert.provider.trim();
  const unprefixed = plain.startsWith(`${provider} `) ? plain.slice(provider.length + 1) : plain;
  const bare = unprefixed.replace(/^Certified\s+/, '');
  out.add(bare);
  if (provider && !plain.startsWith(provider)) out.add(`${provider} ${plain}`);
  if (provider && bare !== plain) out.add(`${provider} ${bare}`);
  return [...out].filter((a) => a && distinctive(a));
}

interface Alias {
  id: string;
  re: RegExp;
}

function pattern(text: string, caseless: boolean, code: boolean): RegExp {
  const body = text
    .split(/[\s\-‐-―]+/)
    .map(escape)
    .join(code ? `${SEP}?` : `${SEP}+`);
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}+])`, `gu${caseless ? 'i' : ''}`);
}

export function buildMentions(certs: readonly Named[]): Mentions {
  // Count each alias across the catalog first: one that two certifications share identifies neither.
  const owners = new Map<string, Set<string>>();
  const candidates: { id: string; text: string; caseless: boolean; code: boolean }[] = [];
  for (const cert of certs) {
    for (const c of codeAliases(cert.code)) candidates.push({ id: cert.id, ...c, code: true });
    for (const text of nameAliases(cert)) candidates.push({ id: cert.id, text, caseless: false, code: false });
  }
  for (const c of candidates) {
    const key = c.text.toLowerCase();
    if (!owners.has(key)) owners.set(key, new Set());
    owners.get(key)!.add(c.id);
  }
  const seen = new Set<string>();
  const aliases: Alias[] = [];
  for (const c of candidates) {
    const key = c.text.toLowerCase();
    if (owners.get(key)!.size > 1 || seen.has(`${c.id}|${key}`)) continue;
    seen.add(`${c.id}|${key}`);
    aliases.push({ id: c.id, re: pattern(c.text, c.caseless, c.code) });
  }

  return (text: string) => {
    const hits: { id: string; start: number; end: number }[] = [];
    for (const alias of aliases) {
      alias.re.lastIndex = 0;
      for (const m of text.matchAll(alias.re)) hits.push({ id: alias.id, start: m.index!, end: m.index! + m[0].length });
    }
    // Longest match wins where two overlap ("AWS AI Practitioner" over "AI Practitioner").
    hits.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    const ids: string[] = [];
    let reached = -1;
    for (const hit of hits) {
      if (hit.start < reached) continue;
      reached = hit.end;
      if (!ids.includes(hit.id)) ids.push(hit.id);
    }
    return ids;
  };
}
