import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nodeAdapter } from '../vercel/node-adapter.mjs';

const encoder = new TextEncoder();
const handlers = {
  GET: async (request) =>
    Response.json({ path: new URL(request.url).pathname, search: new URL(request.url).search, ip: request.headers.get('x-real-ip') }),
  POST: async (request) => {
    const body = await request.text();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${body}\n\n`));
        await new Promise((resolve) => setTimeout(resolve, 20));
        controller.enqueue(encoder.encode('data: done\n\n'));
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'x-test': 'yes' } });
  },
};

let server;
let base;
beforeAll(async () => {
  server = createServer(nodeAdapter(handlers));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

describe('nodeAdapter', () => {
  it('hands the method handler the path, the query and the headers', async () => {
    const res = await fetch(`${base}/health?x=1`, { headers: { 'x-real-ip': '203.0.113.7' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: '/health', search: '?x=1', ip: '203.0.113.7' });
  });

  it('passes the request body through and streams the response with its headers', async () => {
    const res = await fetch(`${base}/chat`, { method: 'POST', body: 'hola' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('x-test')).toBe('yes');
    expect(await res.text()).toBe('data: hola\n\ndata: done\n\n');
  });

  it('answers HEAD with the GET handler and no body', async () => {
    const res = await fetch(`${base}/health`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  it('answers 405 to a method no handler takes', async () => {
    const res = await fetch(`${base}/chat`, { method: 'PUT', body: 'x' });
    expect(res.status).toBe(405);
  });
});
