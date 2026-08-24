/**
 * Sliding window rate limiter — in-memory for dev, Upstash Redis for production if configured.
 * Also respects TRUST_PROXY for X-Forwarded-For.
 */
type Entry = { count: number; resetAt: number };

const GLOBAL_KEY = "__PH_RATE_LIMIT_STORE__";

function getStore(): Map<string, Entry> {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map<string, Entry>();
  return g[GLOBAL_KEY] as Map<string, Entry>;
}

function isTrustProxy(): boolean {
  return process.env.TRUST_PROXY === "1" || process.env.VERCEL === "1";
}

// Optional Upstash Redis — lazy, no hard dep if not configured
let redisClient: {
  incr: (k: string) => Promise<number>;
  expire: (k: string, s: number) => Promise<unknown>;
  ttl: (k: string) => Promise<number>;
} | null = null;
async function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (redisClient) return redisClient;
  try {
    const { Redis } = await import(/* webpackIgnore: true */ "@upstash/redis");
    const r = new Redis({ url, token });
    redisClient = r as unknown as typeof redisClient;
    return redisClient;
  } catch {
    return null;
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const store = getStore();
  const now = Date.now();
  const existing = store.get(key);
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
  return {
    allowed: true,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
  };
}

// Async variant that prefers Redis when configured
export async function checkRateLimitAsync(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = await getRedis();
  if (!redis) return checkRateLimit(key, limit, windowMs);
  try {
    const redisKey = `rl:${key}:${Math.floor(Date.now() / windowMs)}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, Math.ceil(windowMs / 1000));
    const ttl = await redis.ttl(redisKey);
    const resetAt = Date.now() + (ttl > 0 ? ttl * 1000 : windowMs);
    if (count > limit) return { allowed: false, remaining: 0, resetAt };
    return { allowed: true, remaining: limit - count, resetAt };
  } catch {
    return checkRateLimit(key, limit, windowMs);
  }
}

export function getClientIp(
  req:
    | Request
    | { headers: Headers & { get(n: string): string | null }; ip?: string }
): string {
  const h = (req as unknown as { headers: { get(n: string): string | null } })
    .headers;
  if (isTrustProxy()) {
    const xff = h?.get?.("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
  } else {
    // When not trusting proxy, prefer x-real-ip or direct ip
    const xri = h?.get?.("x-real-ip");
    if (xri) return xri.trim();
    const direct = (req as unknown as { ip?: string }).ip;
    if (direct) return direct;
    // Only fall back to xff if no direct ip
    const xff = h?.get?.("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    return "unknown";
  }
  const xri = h?.get?.("x-real-ip");
  if (xri) return xri.trim();
  const ip = (req as unknown as { ip?: string }).ip;
  if (ip) return ip;
  return "unknown";
}

export function rateLimitHeaders(
  remaining: number,
  resetAt: number,
  limit: number
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
  };
}
