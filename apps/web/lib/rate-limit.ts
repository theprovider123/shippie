/**
 * In-memory token bucket rate limiter.
 *
 * For dev + single-instance prod. Production ships Redis/Upstash or
 * Cloudflare Rate Limiting. The key shape and check function are stable
 * across implementations so the call sites don't change on swap.
 *
 * Bucket semantics:
 *   - each bucket has capacity `limit` tokens
 *   - tokens refill at `limit / windowMs` per ms
 *   - `take(n)` returns `{ ok, retryAfterMs }` — never blocks
 *
 * Typical use in a route:
 *   const rl = await checkRateLimit({
 *     key: `deploy:${session.user.id}`,
 *     limit: 30,
 *     windowMs: 60_000,
 *   });
 *   if (!rl.ok) return NextResponse.json(..., { status: 429, headers: { 'retry-after': String(Math.ceil(rl.retryAfterMs/1000)) }});
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

// Max 10k buckets — evict the oldest when full
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
      // Evict the first inserted key (Map preserves insertion order)
      const firstKey = buckets.keys().next().value;
      if (firstKey) buckets.delete(firstKey);
    }
    bucket = { tokens: input.limit, lastRefill: now };
    buckets.set(input.key, bucket);
  }

  // Refill tokens proportional to elapsed time
  const elapsed = now - bucket.lastRefill;
  const refill = (elapsed * input.limit) / input.windowMs;
  bucket.tokens = Math.min(input.limit, bucket.tokens + refill);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      ok: true,
      remaining: Math.floor(bucket.tokens),
      retryAfterMs: 0,
    };
  }

  // Not enough tokens — compute when the next one will be available
  const deficit = 1 - bucket.tokens;
  const retryAfterMs = Math.ceil((deficit * input.windowMs) / input.limit);
  return { ok: false, remaining: 0, retryAfterMs };
}

/** Clear all buckets — used by tests + dev-tools only. */
export function resetRateLimits(): void {
  buckets.clear();
}
