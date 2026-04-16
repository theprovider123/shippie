/**
 * In-memory token bucket rate limiter for the worker.
 *
 * Mirror of apps/web/lib/rate-limit.ts — shared via copy because the
 * worker shouldn't take a dependency on the platform package.
 *
 * In Cloudflare Workers the `Map` is per-isolate, which is per-region.
 * A global limit lives in KV or a Durable Object — that's the
 * production path. Dev + single-region MVP uses this.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export interface CheckRateLimitInput {
  key: string;
  limit: number;
  windowMs: number;
}

export interface CheckRateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function checkRateLimit(input: CheckRateLimitInput): CheckRateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(input.key);

  if (!bucket) {
    if (buckets.size >= MAX_BUCKETS) {
      const firstKey = buckets.keys().next().value;
      if (firstKey) buckets.delete(firstKey);
    }
    bucket = { tokens: input.limit, lastRefill: now };
    buckets.set(input.key, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  const refill = (elapsed * input.limit) / input.windowMs;
  bucket.tokens = Math.min(input.limit, bucket.tokens + refill);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { ok: true, remaining: Math.floor(bucket.tokens), retryAfterMs: 0 };
  }

  const deficit = 1 - bucket.tokens;
  const retryAfterMs = Math.ceil((deficit * input.windowMs) / input.limit);
  return { ok: false, remaining: 0, retryAfterMs };
}

/**
 * Derive a client identifier from the request. Prefers the session handle
 * (authenticated) → user agent + IP (anonymous).
 */
export function clientKey(req: Request): string {
  const cf = (req as Request & { cf?: { connectingIP?: string } }).cf;
  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    cf?.connectingIP ??
    'local';
  return ip;
}
