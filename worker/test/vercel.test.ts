import { describe, expect, it } from 'vitest';
import type { Env } from '../src/config';
import { clientIp, createHandler, vercelClientIp } from '../src/handler';
import { allOf, memoryLimiter } from '../vercel/limiter';
import { context, env, harness, ORIGIN } from './helpers';

describe('clientIp', () => {
  const req = (headers: Record<string, string>) => new Request('https://example.test/chat', { headers });
  it('prefers Cloudflare, then Vercel, then the first forwarded address', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '1.1.1.1', 'x-real-ip': '2.2.2.2' }))).toBe('1.1.1.1');
    expect(clientIp(req({ 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '3.3.3.3' }))).toBe('2.2.2.2');
    expect(clientIp(req({ 'x-forwarded-for': ' 3.3.3.3 , 10.0.0.1' }))).toBe('3.3.3.3');
    expect(clientIp(req({}))).toBe('unknown');
  });
});

describe('vercelClientIp', () => {
  const req = (headers: Record<string, string>) => new Request('https://example.test/chat', { headers });
  it("reads the address Vercel sets and never cf-connecting-ip, which a client can send there", () => {
    expect(vercelClientIp(req({ 'cf-connecting-ip': '1.1.1.1', 'x-real-ip': '2.2.2.2' }))).toBe('2.2.2.2');
    expect(vercelClientIp(req({ 'cf-connecting-ip': '1.1.1.1' }))).toBe('unknown');
    expect(vercelClientIp(req({ 'x-vercel-forwarded-for': '4.4.4.4, 10.0.0.1', 'x-forwarded-for': '3.3.3.3' }))).toBe('4.4.4.4');
    expect(vercelClientIp(req({ 'x-forwarded-for': ' 3.3.3.3 , 10.0.0.1' }))).toBe('3.3.3.3');
  });

  it('keeps counting one visitor who sends a new cf-connecting-ip on every request', async () => {
    const handle = createHandler({ ...harness().deps, clientIp: vercelClientIp });
    const e = env({ CHAT_LIMITER: memoryLimiter({ limit: 2, periodMs: 60_000 }) as unknown as Env['CHAT_LIMITER'] });
    const statuses: number[] = [];
    for (let i = 1; i <= 3; i++) {
      // text/plain is refused with 400 after the limiter counts it, so no model call is needed.
      const request = new Request('https://pathfinder-api.legios.com.ar/chat', {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'text/plain', 'x-real-ip': '203.0.113.7', 'cf-connecting-ip': `198.51.100.${i}` },
        body: 'x',
      });
      const { ctx, settle } = context();
      statuses.push((await handle(request, e, ctx)).status);
      await settle();
    }
    expect(statuses).toEqual([400, 400, 429]);
  });
});

describe('memoryLimiter', () => {
  it('allows the limit per key and window, then resets', async () => {
    let t = 0;
    const limiter = memoryLimiter({ limit: 2, periodMs: 60_000, now: () => t });
    const ok = async (key: string) => (await limiter.limit({ key })).success;
    expect([await ok('a'), await ok('a'), await ok('a')]).toEqual([true, true, false]);
    expect(await ok('b')).toBe(true);
    t = 60_000;
    expect(await ok('a')).toBe(true);
  });

  it('drops expired windows once it holds too many keys', async () => {
    let t = 0;
    const limiter = memoryLimiter({ limit: 1, periodMs: 1_000, now: () => t, maxKeys: 2 });
    await limiter.limit({ key: 'x' });
    await limiter.limit({ key: 'y' });
    t = 5_000;
    await limiter.limit({ key: 'z' });
    // x and y expired and were pruned, so x starts a fresh window.
    expect((await limiter.limit({ key: 'x' })).success).toBe(true);
  });
});

describe('allOf', () => {
  it('allows a request only while every limiter allows it', async () => {
    let t = 0;
    const limiter = allOf(
      memoryLimiter({ limit: 2, periodMs: 60_000, now: () => t }),
      memoryLimiter({ limit: 3, periodMs: 3_600_000, now: () => t }),
    );
    const ok = async () => (await limiter.limit({ key: 'a' })).success;
    expect([await ok(), await ok(), await ok()]).toEqual([true, true, false]);
    t = 60_000; // the minute window resets; the hour window has counted 3
    expect(await ok()).toBe(false);
    t = 3_600_000;
    expect(await ok()).toBe(true);
  });
});
