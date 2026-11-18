// Bindings and settings, read from wrangler.toml vars and secrets.

export interface Env {
  MODEL?: string;
  EFFORT?: string;
  CATALOG_URL?: string;
  CHAT_ENABLED?: string;
  MOCK?: string;
  /** Comma-separated https origins allowed besides the site, e.g. a staging copy. */
  EXTRA_ORIGINS?: string;
  /** Secret. Never logged. */
  ANTHROPIC_API_KEY?: string;
  /** Optional, for local testing against a stub server. */
  ANTHROPIC_BASE_URL?: string;
  CHAT_LIMITER?: RateLimit;
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface Config {
  model: string;
  effort: Effort;
  catalogUrl: string;
  enabled: boolean;
  mock: boolean;
  extraOrigins: string[];
}

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const DEFAULT_EFFORT: Effort = 'low';
export const DEFAULT_CATALOG_URL = 'https://pathfinder.legios.com.ar/catalog.json';

const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const OFF = new Set(['0', 'false', 'no', 'off']);
const ON = new Set(['1', 'true', 'yes', 'on']);

const flag = (value: string | undefined) => (value ?? '').trim().toLowerCase();

export function readConfig(env: Env): Config {
  const effort = flag(env.EFFORT) as Effort;
  return {
    model: env.MODEL?.trim() || DEFAULT_MODEL,
    effort: EFFORTS.includes(effort) ? effort : DEFAULT_EFFORT,
    catalogUrl: env.CATALOG_URL?.trim() || DEFAULT_CATALOG_URL,
    // Unset means enabled, so a missing var never takes the chat down by accident.
    enabled: !OFF.has(flag(env.CHAT_ENABLED)),
    mock: ON.has(flag(env.MOCK)),
    extraOrigins: (env.EXTRA_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => /^https:\/\/[a-z0-9.-]+$/.test(o)),
  };
}
