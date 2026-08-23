/**
 * Simple in-memory sliding window rate limiter.
 * Works in both Edge (middleware) and Node (route handlers) via globalThis.
 * For production with multiple instances, replace with Redis.
 */
type Entry = { count: number; resetAt: number };

const GLOBAL_KEY = "__PH_RATE_LIMIT_STORE__";

function getStore(): Map<string, Entry> {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map<string, Entry>();
  return g[GLOBAL_KEY] as Map<string, Entry>;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const store = getStore();
  const now = Date.now();
  const existing = store.get(key);

  // Periodic cleanup: remove 10% oldest if size > 1000
  if (store.size > 1000 && Math.random() < 0.1) {
    for (const [k, v] of store) {
      if (v.resetAt < now) store.delete(k);
      if (store.size < 800) break;
    }
  }

  if (!existing || existing.resetAt < now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  store.set(key, existing);
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

export function getClientIp(req: Request | { headers: Headers & { get(n: string): string | null }; ip?: string }): string {
  const h = (req as unknown as { headers: { get(n: string): string | null } }).headers;
  const xff = h?.get?.("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xri = h?.get?.("x-real-ip");
  if (xri) return xri.trim();
  const ip = (req as unknown as { ip?: string }).ip;
  if (ip) return ip;
  return "unknown";
}

export function rateLimitHeaders(remaining: number, resetAt: number, limit: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
  };
}
