// CORS: the chat answers only pathfinder's own pages and local development servers.

const SITES = new Set(['https://pathfinder.legios.com.ar', 'https://legiosai.github.io']);
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function isAllowedOrigin(origin: string | null | undefined): origin is string {
  return typeof origin === 'string' && (SITES.has(origin) || LOCAL.test(origin));
}

/** Headers for an actual response. The origin is echoed only when it is allowed. */
export function corsHeaders(origin: string | null | undefined): Record<string, string> {
  const headers: Record<string, string> = { vary: 'Origin' };
  if (isAllowedOrigin(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-expose-headers'] = 'Retry-After';
  }
  return headers;
}

/** Headers for an OPTIONS preflight from an allowed origin. */
export function preflightHeaders(origin: string): Record<string, string> {
  return {
    ...corsHeaders(origin),
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}
