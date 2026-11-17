// The catalog the site publishes (dist/catalog.json), compacted into text for the prompt
// and cached in memory and in the Cache API.

import { buildSystemPrompt } from './prompt';

export interface CatalogCert {
  id: string;
  name: string;
  provider: string;
  code: string;
  type?: string;
  category: string;
  level: string;
  status: string;
  fee: { usd: number | null; basis?: string };
  exam: { minutes?: number | null; style?: string; format?: string; questions?: string | number };
  scope?: string;
  requirements?: string;
  skills: string[];
  roles: string[];
  domains: { name: string; weight: number }[];
  prep: unknown[];
  practice_questions?: number;
}

interface Labelled {
  id: string;
  label: string;
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
}

/** What a request needs: the system prompt and the ids it may show. */
export interface CompiledCatalog {
  system: string;
  count: number;
  ids: ReadonlySet<string>;
  certs: readonly CatalogCert[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
/** One line, no runs of whitespace. Catalog text never breaks the prompt's layout. */
const clean = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').replace(/\s+/g, ' ').trim();
const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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
    certifications.push({
      id: c.id,
      name: c.name,
      provider: clean(c.provider),
      code: clean(c.code),
      type: clean(c.type),
      category: clean(c.category),
      level: clean(c.level),
      status: clean(c.status),
      fee: { usd: typeof fee.usd === 'number' ? fee.usd : null, basis: clean(fee.basis) },
      exam: {
        minutes: typeof exam.minutes === 'number' ? exam.minutes : null,
        style: clean(exam.style),
        format: clean(exam.format),
        questions: clean(exam.questions),
      },
      scope: clean(c.scope),
      requirements: clean(c.requirements),
      skills: strings(c.skills),
      roles: strings(c.roles),
      domains,
      prep: Array.isArray(c.prep) ? c.prep : [],
      practice_questions: typeof c.practice_questions === 'number' ? c.practice_questions : 0,
    });
  }
  return { certifications, taxonomy: isObject(json.taxonomy) ? (json.taxonomy as Catalog['taxonomy']) : undefined };
}

function legend(title: string, entries: Labelled[] | undefined): string | null {
  const list = (entries ?? []).filter((e) => isObject(e) && typeof e.id === 'string');
  if (!list.length) return null;
  return `${title}: ${[...list].sort((a, b) => byKey(a.id, b.id)).map((e) => `${e.id} = ${clean(e.label)}`).join('; ')}`;
}

function fee(cert: CatalogCert): string {
  const basis = cert.fee.basis ? ` (${cert.fee.basis})` : '';
  return cert.fee.usd === null ? `varies${basis}` : `USD ${cert.fee.usd}${basis}`;
}

function exam(cert: CatalogCert): string {
  const parts: string[] = [];
  if (cert.exam.style) parts.push(cert.exam.style);
  if (cert.exam.minutes) parts.push(`${cert.exam.minutes} min`);
  if (cert.exam.questions) parts.push(`questions: ${cert.exam.questions}`);
  if (cert.exam.format) parts.push(`format: ${cert.exam.format}`);
  return parts.join('; ') || 'not listed';
}

function certBlock(cert: CatalogCert): string {
  const domains = [...cert.domains]
    .sort((a, b) => b.weight - a.weight || byKey(a.name, b.name))
    .map((d) => `${clean(d.name)} ${d.weight}%`)
    .join('; ');
  const lines = [
    `id: ${cert.id}`,
    `name: ${clean(cert.name)}`,
    `code: ${cert.code}`,
    `provider: ${cert.provider}`,
    `type: ${cert.type}`,
    `category: ${cert.category}`,
    `level: ${cert.level}`,
    `status: ${cert.status}`,
    `fee: ${fee(cert)}`,
    `exam: ${exam(cert)}`,
    `scope: ${cert.scope}`,
  ];
  if (cert.requirements) lines.push(`requirements: ${cert.requirements}`);
  lines.push(
    `skills: ${[...cert.skills].sort(byKey).join(', ')}`,
    `roles: ${[...cert.roles].sort(byKey).join(', ')}`,
    `domains: ${domains || 'not published'}`,
    `prep resources: ${cert.prep.length}`,
    `practice questions: ${cert.practice_questions ?? 0}`,
  );
  return lines.join('\n');
}

/**
 * Deterministic text form of the catalog: the same catalog always gives the same bytes,
 * whatever the order of the input, so the cached prompt prefix stays valid.
 */
export function compactCatalog(catalog: Catalog): string {
  const t = catalog.taxonomy ?? {};
  const levels = (t.levels ?? [])
    .filter((l) => isObject(l) && typeof l.id === 'string')
    .map((l) => (Array.isArray(l.hours) && l.hours.length === 2 ? `${l.id} = ${clean(l.label)}, about ${l.hours[0]}-${l.hours[1]} study hours` : `${l.id} = ${clean(l.label)}`));
  const header = [
    levels.length ? `levels: ${levels.join('; ')}` : null,
    t.hours_note ? `study hours note: ${clean(t.hours_note)}` : null,
    legend('statuses', t.statuses),
    legend('exam styles', t.styles),
    legend('skills', t.skills),
    legend('roles', t.roles),
  ].filter((line): line is string => line !== null);
  const certs = [...catalog.certifications].sort((a, b) => byKey(a.id, b.id)).map(certBlock);
  return [...header, '', `${certs.length} certifications:`, '', certs.join('\n\n')].join('\n');
}

export function compileCatalog(json: unknown): CompiledCatalog {
  const catalog = parseCatalog(json);
  const certs = [...catalog.certifications].sort((a, b) => byKey(a.id, b.id));
  return {
    system: buildSystemPrompt(compactCatalog(catalog)),
    count: certs.length,
    ids: new Set(certs.map((c) => c.id)),
    certs,
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
    try {
      const hit = await cache?.match(url).catch(() => undefined);
      if (hit) return this.keep(compileCatalog(await hit.json()));
      const res = await this.options.fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`catalog fetch returned ${res.status}`);
      const text = await res.text();
      const compiled = compileCatalog(JSON.parse(text));
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
