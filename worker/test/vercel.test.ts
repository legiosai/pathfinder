import { describe, expect, it } from 'vitest';
import { clientIp } from '../src/handler';
import { memoryLimiter } from '../vercel/limiter';

describe('clientIp', () => {
  const req = (headers: Record<string, string>) => new Request('https://example.test/chat', { headers });
  it('prefers Cloudflare, then Vercel, then the first forwarded address', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '1.1.1.1', 'x-real-ip': '2.2.2.2' }))).toBe('1.1.1.1');
    expect(clientIp(req({ 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '3.3.3.3' }))).toBe('2.2.2.2');
    expect(clientIp(req({ 'x-forwarded-for': ' 3.3.3.3 , 10.0.0.1' }))).toBe('3.3.3.3');
    expect(clientIp(req({}))).toBe('unknown');
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
