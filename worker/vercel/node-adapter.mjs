// Node (req, res) adapter for the Vercel function that scripts/build-vercel.mjs writes. Vercel's
// Node launcher calls a (req, res) handler; entry.ts exports web handlers (GET, POST, OPTIONS).
// This turns the request into a web Request, calls the handler for its method, and copies the
// Response back as it is read, so server-sent events reach the visitor while they are written.

import { Readable } from 'node:stream';

/** @param {Record<string, ((request: Request) => Promise<Response>) | undefined>} handlers */
export function nodeAdapter(handlers) {
  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  return async function handler(req, res) {
    const method = (req.method ?? 'GET').toUpperCase();
    const run = handlers[method] ?? (method === 'HEAD' ? handlers.GET : undefined);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) for (const v of value) headers.append(key, v);
      else if (value !== undefined) headers.set(key, value);
    }
    // Only the path and query matter to the handler; the host is a placeholder.
    const url = new URL(req.url ?? '/', 'https://function.invalid');
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const request = new Request(url, {
      method,
      headers,
      body: hasBody ? /** @type {ReadableStream} */ (Readable.toWeb(req)) : undefined,
      // Node's fetch needs duplex for a streamed request body.
      duplex: 'half',
    });

    /** @type {Response} */
    let response;
    try {
      response = run ? await run(request) : new Response(null, { status: 405 });
    } catch {
      // The handler answers its own errors; this only covers a throw before it could.
      response = new Response(JSON.stringify({ error: 'upstream' }), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (!response.body || method === 'HEAD') {
      res.end();
      return;
    }
    for await (const chunk of response.body) res.write(chunk);
    res.end();
  };
}
