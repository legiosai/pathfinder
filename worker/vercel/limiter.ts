// Vercel has no rate-limit binding like Cloudflare's, so the chat counts requests per address in
// memory. Each function instance keeps its own count: Fluid compute reuses instances, so this holds
// up for one visitor in a burst, not across regions. The AI Gateway key's monthly budget is the
// hard ceiling on spend either way.

export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export function memoryLimiter({
  limit,
  periodMs,
  now = () => Date.now(),
  maxKeys = 10_000,
}: {
  limit: number;
  periodMs: number;
  now?: () => number;
  maxKeys?: number;
}): Limiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    async limit({ key }) {
      const t = now();
      let w = windows.get(key);
      if (!w || t - w.start >= periodMs) {
        w = { start: t, count: 0 };
        windows.set(key, w);
      }
      w.count += 1;
      if (windows.size > maxKeys) {
        for (const [k, v] of windows) if (t - v.start >= periodMs) windows.delete(k);
      }
      return { success: w.count <= limit };
    },
  };
}
