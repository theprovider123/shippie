/**
 * Signed fetch to the Shippie platform internal API.
 *
 * Every request carries:
 *   X-Shippie-Signature: HMAC_SHA256(secret, METHOD\nPATH\nBODY_HASH\nTIMESTAMP)
 *   X-Shippie-Timestamp: unix ms
 *
 * The shared implementation lives in @shippie/session-crypto so both
 * the worker and the platform use the same canonical input.
 *
 * Every call has a hard timeout. Retries are opt-in per-call because
 * most platform writes are not idempotent (feedback creates, analytics
 * ingests); callers that can safely retry (e.g. dedup'd votes) set
 * `retries > 0`. 5xx + network errors qualify for retry; 4xx responses
 * are returned as-is.
 *
 * Spec v6 §6.3.
 */
import { signWorkerRequest } from '@shippie/session-crypto';
import type { WorkerEnv } from './env.ts';

export interface PlatformFetchOptions {
  /** Hard timeout per attempt, in ms. Default 10s. */
  timeoutMs?: number;
  /** Number of retry attempts on 5xx / network error. Default 0. Only safe for idempotent calls. */
  retries?: number;
  /** Base delay between retries, ms. Actual delay is jittered exponential. Default 100ms. */
  retryBaseMs?: number;
  /** Trace id to forward so platform logs correlate with the worker's. */
  traceId?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_BASE_MS = 100;

function isRetryable(status: number): boolean {
  return status >= 500 && status < 600;
}

function jitteredDelay(attempt: number, baseMs: number): number {
  // 2^attempt * base * [0.5, 1.5)
  return baseMs * 2 ** attempt * (0.5 + Math.random());
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function platformFetch(
  env: WorkerEnv,
  method: string,
  path: string,
  body?: unknown,
  options: PlatformFetchOptions = {},
): Promise<Response> {
  const bodyStr = body == null ? '' : JSON.stringify(body);
  const { signature, timestamp } = await signWorkerRequest(
    env.WORKER_PLATFORM_SECRET,
    method,
    path,
    bodyStr,
  );

  const url = `${env.PLATFORM_API_URL}${path}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = (options.retries ?? 0) + 1;
  const baseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-shippie-signature': signature,
    'x-shippie-timestamp': timestamp,
  };
  if (options.traceId) headers['x-shippie-trace-id'] = options.traceId;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: bodyStr || undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!isRetryable(res.status) || attempt === maxAttempts - 1) {
        return res;
      }
      // Consume the body so the connection can be recycled.
      await res.arrayBuffer().catch(() => undefined);
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts - 1) throw err;
    }
    await sleep(jitteredDelay(attempt, baseMs));
  }

  // Unreachable — the loop either returns or throws on the final attempt.
  throw lastError ?? new Error('platformFetch: exhausted retries without response');
}

export async function platformJson<T>(
  env: WorkerEnv,
  method: string,
  path: string,
  body?: unknown,
  options: PlatformFetchOptions = {},
): Promise<
  { ok: true; status: number; data: T } | { ok: false; status: number; data: unknown }
> {
  const res = await platformFetch(env, method, path, body, options);
  const contentType = res.headers.get('content-type') ?? '';
  const parsed = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    return { ok: false, status: res.status, data: parsed };
  }
  return { ok: true, status: res.status, data: parsed as T };
}

// ---------------------------------------------------------------------------
// Wrap-mode KV accessor
//
// Source-kind dispatch in the Worker app needs to know, per-slug, whether the
// app is configured as a URL wrap. A KV GET on every single request would be
// wasteful, so we wrap it in a module-scoped LRU-ish cache with a short TTL.
// Invalidation: 30s natural expiry + explicit `bustWrapCache(slug)` on config
// change (Phase B will wire that via the signed-request spine).
// ---------------------------------------------------------------------------

export interface WrapMetaRuntime {
  upstreamUrl: string;
  cspMode: 'lenient' | 'strict';
}

interface CachedWrap {
  value: WrapMetaRuntime | null;
  expires: number;
}

// Module-scoped cache lives for the Worker isolate's lifetime (~30s to many
// minutes on CF, process lifetime in Bun dev).
const wrapCache = new Map<string, CachedWrap>();
const WRAP_TTL_MS = 30_000;

/**
 * KV accessor compatible with both Cloudflare KV (`get(key, { type: 'json' })`)
 * and the dev-storage `KvStore` (`getJson<T>(key)` / `get(key)` returning
 * string|null). We normalize by trying `getJson` first, then falling back to
 * `get` + manual parse.
 */
interface WrapKvLike {
  get(key: string, opts?: { type?: 'json' }): Promise<unknown>;
  getJson?<T>(key: string): Promise<T | null>;
}

async function kvReadJson(kv: WrapKvLike, key: string): Promise<unknown> {
  if (typeof kv.getJson === 'function') {
    return await kv.getJson(key);
  }
  // Cloudflare KV: supports the { type: 'json' } option.
  try {
    const raw = await kv.get(key, { type: 'json' });
    return raw;
  } catch {
    const raw = await kv.get(key);
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    }
    return raw ?? null;
  }
}

export async function loadWrapMeta(
  kv: WrapKvLike,
  slug: string,
): Promise<WrapMetaRuntime | null> {
  const hit = wrapCache.get(slug);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;

  const raw = await kvReadJson(kv, `apps:${slug}:wrap`);
  let value: CachedWrap['value'] = null;
  if (raw && typeof raw === 'object') {
    const r = raw as { upstream_url?: string; csp_mode?: string };
    if (r.upstream_url) {
      value = {
        upstreamUrl: r.upstream_url,
        cspMode: r.csp_mode === 'strict' ? 'strict' : 'lenient',
      };
    }
  }
  wrapCache.set(slug, { value, expires: now + WRAP_TTL_MS });
  return value;
}

// Exported for the KV-invalidation endpoint added by Phase B.
export function bustWrapCache(slug: string): void {
  wrapCache.delete(slug);
}
