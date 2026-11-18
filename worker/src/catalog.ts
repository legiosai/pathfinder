// The catalog the site publishes (dist/catalog.json), compacted into text for the prompt
// and cached in memory and in the Cache API.

import { buildMentions, type Mentions } from './mentions';
import { shorten } from './picks';
import { buildSystemPrompt } from './prompt';

/**
 * Character caps for the free-text fields, so a long note doesn't grow the cached prompt (and the
 * cost of every first message) for little gain. The certification's page has the full text.
 */
export const CAPS = { feeNote: 160, format: 160, caveats: 240, access: 140 } as const;

export interface PrepItem {
  title: string;
  kind: string;
  cost: string;
  lang?: string;
}

export interface AccessNote {
  text: string;
  until?: string;
}

export interface CatalogCert {
  id: string;
  name: string;
  provider: string;
  code: string;
  type?: string;
  category: string;
  level: string;
  status: string;
  fee: { usd: number | null; basis?: string; note?: string };
  exam: {
    minutes?: number | null;
    style?: string;
    format?: string;
    questions?: string | number;
    passing?: string;
    validity?: string;
    languages?: string[];
    delivery?: string[];
  };
  scope?: string;
  requirements?: string;
  caveats?: string[];
  access?: { free_routes?: AccessNote[]; discounts?: AccessNote[]; retake?: string; accommodations?: string };
  timeline?: { date: string; kind: string; text: string }[];
  skills: string[];
  roles: string[];
  domains: { name: string; weight: number }[];
  prep: PrepItem[];
  practice_questions?: number;
}

interface Labelled {
  id: string;
  label: string;
}

export interface StudyPath {
  id: string;
  category: string;
  title: string;
  steps: { certs: string[]; note: string }[];
}

export interface Catalog {
  certifications: CatalogCert[];
  taxonomy?: {
    levels?: (Labelled & { hours?: number[] })[];
    hours_note?: string;
    statuses?: Labelled[];
    styles?: Labelled[];
    roles?: Labelled[];
    skills?: Labelled[];
  };
  paths?: StudyPath[];
  /** What paying from a country adds to list prices, in English, keyed by region code. */
  regions?: Record<string, string>;
}

/** What a request needs: the system prompt and the ids it may show. */
export interface CompiledCatalog {
  system: string;
  count: number;
  ids: ReadonlySet<string>;
  certs: readonly CatalogCert[];
  /** Finds catalog certifications named in a reply (by code or distinctive name). */
  mentions: Mentions;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** One line, no runs of whitespace. Catalog text never breaks the prompt's layout. */
const clean = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').replace(/\s+/g, ' ').trim();
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
const texts = (v: unknown): string[] => strings(v).map(clean).filter(Boolean);
const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function accessNotes(v: unknown): AccessNote[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObject)
    .map((n) => ({ text: clean(n.text), ...(typeof n.until === 'string' && DATE.test(n.until) ? { until: n.until } : {}) }))
    .filter((n) => n.text);
}

function parseAccess(v: unknown): CatalogCert['access'] {
  if (!isObject(v)) return undefined;
  const access: NonNullable<CatalogCert['access']> = {};
  const free = accessNotes(v.free_routes);
  const discounts = accessNotes(v.discounts);
  if (free.length) access.free_routes = free;
  if (discounts.length) access.discounts = discounts;
  if (clean(v.retake)) access.retake = clean(v.retake);
  if (clean(v.accommodations)) access.accommodations = clean(v.accommodations);
  return Object.keys(access).length ? access : undefined;
}

function parseTimeline(v: unknown): CatalogCert['timeline'] {
  if (!Array.isArray(v)) return undefined;
  const list = v
    .filter(isObject)
    .filter((e) => typeof e.date === 'string' && DATE.test(e.date) && clean(e.text))
    .map((e) => ({ date: e.date as string, kind: clean(e.kind) || 'changes', text: clean(e.text) }));
  return list.length ? list : undefined;
}

function parsePaths(v: unknown): StudyPath[] {
  if (!Array.isArray(v)) return [];
  const english = (x: unknown) => (isObject(x) ? clean(x.en) : clean(x));
  return v
    .filter((p): p is Record<string, unknown> => isObject(p) && typeof p.id === 'string' && Array.isArray(p.steps))
    .map((p) => ({
      id: p.id as string,
      category: clean(p.category),
      title: english(p.title),
      steps: (p.steps as unknown[]).filter(isObject).map((s) => ({ certs: strings(s.certs), note: english(s.note) })),
    }));
}

function parseRegions(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObject(v)) return out;
  for (const [code, r] of Object.entries(v)) {
    const text = isObject(r) ? clean(r.en) : '';
    if (/^[A-Z]{2}$/.test(code) && text) out[code] = text;
  }
  return out;
}

/** Checks the fields the prompt relies on and normalizes the rest. Throws on a malformed catalog. */
export function parseCatalog(json: unknown): Catalog {
  if (!isObject(json) || !Array.isArray(json.certifications) || json.certifications.length === 0) {
    throw new Error('catalog has no certifications');
  }
  const certifications: CatalogCert[] = [];
  const seen = new Set<string>();
  for (const c of json.certifications) {
    if (!isObject(c) || typeof c.id !== 'string' || !c.id || typeof c.name !== 'string') throw new Error('catalog entry without id or name');
    if (seen.has(c.id)) throw new Error(`duplicate catalog id ${c.id}`);
    seen.add(c.id);
    const fee = isObject(c.fee) ? c.fee : {};
    const exam = isObject(c.exam) ? c.exam : {};
    const domains = Array.isArray(c.domains)
      ? c.domains.filter((d): d is { name: string; weight: number } => isObject(d) && typeof d.name === 'string' && typeof d.weight === 'number')
      : [];
    const prep = Array.isArray(c.prep)
      ? c.prep.filter(isObject).map((p) => ({ title: clean(p.title), kind: clean(p.kind), cost: clean(p.cost), ...(clean(p.lang) ? { lang: clean(p.lang) } : {}) }))
      : [];
    certifications.push({
      id: c.id,
      name: c.name,
      provider: clean(c.provider),
      code: clean(c.code),
      type: clean(c.type),
      category: clean(c.category),
      level: clean(c.level),
      status: clean(c.status),
      fee: { usd: typeof fee.usd === 'number' ? fee.usd : null, basis: clean(fee.basis), note: clean(fee.note) },
      exam: {
        minutes: typeof exam.minutes === 'number' ? exam.minutes : null,
        style: clean(exam.style),
        format: clean(exam.format),
        questions: clean(exam.questions),
        passing: clean(exam.passing),
        validity: clean(exam.validity),
        languages: texts(exam.languages),
        delivery: texts(exam.delivery),
      },
      scope: clean(c.scope),
      requirements: clean(c.requirements),
      caveats: texts(c.caveats),
      access: parseAccess(c.access),
      timeline: parseTimeline(c.timeline),
      skills: strings(c.skills),
      roles: strings(c.roles),
      domains,
      prep,
      practice_questions: typeof c.practice_questions === 'number' ? c.practice_questions : 0,
    });
  }
  return {
    certifications,
    taxonomy: isObject(json.taxonomy) ? (json.taxonomy as Catalog['taxonomy']) : undefined,
    paths: parsePaths(json.paths),
    regions: parseRegions(json.regions),
  };
}

function legend(title: string, entries: Labelled[] | undefined): string | null {
  const list = (entries ?? []).filter((e) => isObject(e) && typeof e.id === 'string');
  if (!list.length) return null;
  return `${title}: ${[...list].sort((a, b) => byKey(a.id, b.id)).map((e) => `${e.id} = ${clean(e.label)}`).join('; ')}`;
}

function fee(cert: CatalogCert): string {
  const extra = [cert.fee.basis, cert.fee.note && shorten(cert.fee.note, CAPS.feeNote)].filter(Boolean).join('; ');
  const tail = extra ? ` (${extra})` : '';
  return cert.fee.usd === null ? `varies${tail}` : `USD ${cert.fee.usd}${tail}`;
}

function exam(cert: CatalogCert): string {
  const e = cert.exam;
  const parts: string[] = [];
  if (e.style) parts.push(e.style);
  if (e.minutes) parts.push(`${e.minutes} min`);
  if (e.questions) parts.push(`questions: ${e.questions}`);
  if (e.format) parts.push(`format: ${shorten(e.format, CAPS.format)}`);
  if (e.passing) parts.push(`passing: ${e.passing}`);
  if (e.validity) parts.push(`valid: ${e.validity}`);
  return parts.join('; ') || 'not listed';
}

const until = (n: AccessNote) => {
  const text = shorten(n.text, CAPS.access);
  return n.until ? `${text} (until ${n.until})` : text;
};

function certBlock(cert: CatalogCert, today: string): string {
  const domains = [...cert.domains]
    .sort((a, b) => b.weight - a.weight || byKey(a.name, b.name))
    .map((d) => `${clean(d.name)} ${d.weight}%`)
    .join('; ');
  const lines = [
    `id: ${cert.id}`,
    `name: ${clean(cert.name)}`,
    `code: ${cert.code}`,
    `provider: ${cert.provider}`,
    // Most entries are certifications; only the others (courses, labs) say what they are.
    ...(cert.type && cert.type !== 'certification' ? [`type: ${cert.type}`] : []),
    `category: ${cert.category}`,
    `level: ${cert.level}`,
    `status: ${cert.status}`,
    `fee: ${fee(cert)}`,
    `exam: ${exam(cert)}`,
  ];
  // Unknown languages or delivery stay out: the prompt says not to claim either way.
  if (cert.exam.languages?.length) lines.push(`exam languages: ${cert.exam.languages.join(', ')}`);
  if (cert.exam.delivery?.length) lines.push(`delivery: ${cert.exam.delivery.join(', ')}`);
  lines.push(`scope: ${cert.scope}`);
  if (cert.requirements) lines.push(`requirements: ${cert.requirements}`);
  if (cert.caveats?.length) lines.push(`caveats: ${shorten(cert.caveats.join(' | '), CAPS.caveats)}`);
  const a = cert.access;
  if (a?.free_routes?.length) lines.push(`free routes: ${a.free_routes.map(until).join(' | ')}`);
  if (a?.discounts?.length) lines.push(`discounts: ${a.discounts.map(until).join(' | ')}`);
  if (a?.retake) lines.push(`retake: ${shorten(a.retake, CAPS.access)}`);
  if (a?.accommodations) lines.push(`accommodations: ${shorten(a.accommodations, CAPS.access)}`);
  // Only what is still ahead: past entries are history, and dropping them keeps the prompt short.
  const ahead = (cert.timeline ?? []).filter((e) => e.date >= today);
  if (ahead.length) lines.push(`timeline: ${ahead.map((e) => `${e.date} ${e.kind}: ${e.text}`).join(' | ')}`);
  const prep = cert.prep.map((p) => `${p.title} (${[p.kind === 'official-guide' ? 'official' : '', p.cost, p.lang].filter(Boolean).join(', ')})`).join('; ');
  lines.push(
    `skills: ${[...cert.skills].sort(byKey).join(', ')}`,
    `roles: ${[...cert.roles].sort(byKey).join(', ')}`,
    `domains: ${domains || 'not published'}`,
    `prep: ${prep || 'none listed'}`,
    `practice questions: ${cert.practice_questions ?? 0}`,
  );
  return lines.join('\n');
}

function pathLine(path: StudyPath): string {
  const steps = path.steps.map((s, i) => `${i + 1}) ${s.certs.join(' or ')}${s.note ? `: ${s.note}` : ''}`).join(' ');
  return `${path.id} (${path.title}; ${path.category}): ${steps}`;
}

/**
 * Deterministic text form of the catalog: the same catalog on the same day always gives the same
 * bytes, whatever the order of the input, so the cached prompt prefix stays valid. `today`
 * (YYYY-MM-DD) only decides which timeline entries are still ahead.
 */
export function compactCatalog(catalog: Catalog, today = ''): string {
  const t = catalog.taxonomy ?? {};
  const levels = (t.levels ?? [])
    .filter((l) => isObject(l) && typeof l.id === 'string')
    .map((l) => (Array.isArray(l.hours) && l.hours.length === 2 ? `${l.id} = ${clean(l.label)}, about ${l.hours[0]}-${l.hours[1]} study hours` : `${l.id} = ${clean(l.label)}`));
  const regions = Object.keys(catalog.regions ?? {})
    .sort(byKey)
    .map((code) => `${code}: ${catalog.regions![code]}`);
  const paths = [...(catalog.paths ?? [])].sort((a, b) => byKey(a.id, b.id)).map(pathLine);
  const header = [
    levels.length ? `levels: ${levels.join('; ')}` : null,
    t.hours_note ? `study hours note: ${clean(t.hours_note)}` : null,
    legend('statuses', t.statuses),
    legend('exam styles', t.styles),
    legend('skills', t.skills),
    legend('roles', t.roles),
    regions.length ? `regions (what paying from there adds to list prices): ${regions.join(' | ')}` : null,
  ].filter((line): line is string => line !== null);
  const pathBlock = paths.length ? ['', 'study paths (editorial suggestions by goal; each step lists alternatives, best known first):', ...paths] : [];
  const certs = [...catalog.certifications].sort((a, b) => byKey(a.id, b.id)).map((c) => certBlock(c, today));
  return [...header, ...pathBlock, '', `${certs.length} certifications:`, '', certs.join('\n\n')].join('\n');
}

export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function compileCatalog(json: unknown, today = ''): CompiledCatalog {
  const catalog = parseCatalog(json);
  const certs = [...catalog.certifications].sort((a, b) => byKey(a.id, b.id));
  return {
    system: buildSystemPrompt(compactCatalog(catalog, today)),
    count: certs.length,
    ids: new Set(certs.map((c) => c.id)),
    certs,
    mentions: buildMentions(certs),
  };
}

export interface CatalogStoreOptions {
  url: string;
  fetch: typeof fetch;
  /** The Cache API (caches.default on Workers); absent in tests and plain Node. */
  cache?: Cache;
  now?: () => number;
  ttlMs?: number;
  /** How long a copy may still be served when the site is unreachable. */
  staleMs?: number;
  log?: (entry: Record<string, unknown>) => void;
}

export const CATALOG_TTL_MS = 10 * 60 * 1000;
const RETRY_MS = 60 * 1000;

/** Memory first, then the Cache API, then the site. Concurrent loads share one fetch. */
export class CatalogStore {
  /** loadedAt: when this copy was fetched; freshUntil: when to look for a newer one. */
  private memory: { compiled: CompiledCatalog; loadedAt: number; freshUntil: number } | undefined;
  private inflight: Promise<CompiledCatalog> | undefined;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly staleMs: number;

  constructor(private readonly options: CatalogStoreOptions) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? CATALOG_TTL_MS;
    this.staleMs = options.staleMs ?? 24 * 60 * 60 * 1000;
  }

  get(): Promise<CompiledCatalog> {
    if (this.memory && this.now() < this.memory.freshUntil) return Promise.resolve(this.memory.compiled);
    this.inflight ??= this.load().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  private async load(): Promise<CompiledCatalog> {
    const { url, cache, log } = this.options;
    const today = isoDay(this.now());
    try {
      const hit = await cache?.match(url).catch(() => undefined);
      if (hit) return this.keep(compileCatalog(await hit.json(), today));
      const res = await this.options.fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`catalog fetch returned ${res.status}`);
      const text = await res.text();
      const compiled = compileCatalog(JSON.parse(text), today);
      if (cache) {
        const copy = new Response(text, {
          headers: { 'content-type': 'application/json', 'cache-control': `max-age=${Math.round(this.ttlMs / 1000)}` },
        });
        await cache.put(url, copy).catch(() => undefined);
      }
      return this.keep(compiled);
    } catch (err) {
      const stale = this.memory && this.now() - this.memory.loadedAt < this.staleMs ? this.memory : undefined;
      log?.({ evt: 'catalog_error', stale: Boolean(stale), error: err instanceof Error ? err.message : String(err) });
      if (!stale) throw err;
      // Serve the old copy and try the site again in a minute rather than on every request.
      stale.freshUntil = this.now() + RETRY_MS;
      return stale.compiled;
    }
  }

  private keep(compiled: CompiledCatalog): CompiledCatalog {
    const now = this.now();
    this.memory = { compiled, loadedAt: now, freshUntil: now + this.ttlMs };
    return compiled;
  }
}
