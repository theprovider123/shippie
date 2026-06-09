/**
 * KV-cache helpers for wrapper dispatch.
 *
 * Adapted from services/worker/src/platform-client.ts. The HMAC
 * platformFetch / platformJson code is gone — the Worker→Platform
 * boundary disappears in Phase 5 (one Worker now serves both). All
 * calls that used to be HTTP signed-requests become local function
 * invocations via apps/platform/src/lib/server/* helpers.
 *
 * What survives: the per-isolate LRU cache of `apps:{slug}:wrap` and
 * `apps:{slug}:meta`, which are KV reads on the hot path of every
 * subdomain request and benefit from a 30s memo.
 */
import type { KVNamespace } from '@cloudflare/workers-types';

export interface WrapMetaRuntime {
  upstreamUrl: string;
  cspMode: 'lenient' | 'strict';
}

interface CachedWrap {
  value: WrapMetaRuntime | null;
  expires: number;
}

const wrapCache = new Map<string, CachedWrap>();
const WRAP_TTL_MS = 5_000;

async function kvReadJson(kv: KVNamespace, key: string): Promise<unknown> {
  // CF KV exposes a typed `get(key, { type: 'json' })`. We use that when
  // available, falling back to manual parse.
  try {
    const raw = await kv.get(key, { type: 'json' });
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    }
    return raw;
  } catch {
    const raw = await kv.get(key);
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
}

export async function loadWrapMeta(
  kv: KVNamespace,
  slug: string
): Promise<WrapMetaRuntime | null> {
  const hit = wrapCache.get(slug);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;

  const raw = await kvReadJson(kv, `apps:${slug}:wrap`);
  let value: WrapMetaRuntime | null = null;
  if (raw && typeof raw === 'object') {
    const r = raw as { upstream_url?: string; csp_mode?: string };
    if (r.upstream_url) {
      value = {
        upstreamUrl: r.upstream_url,
        cspMode: r.csp_mode === 'strict' ? 'strict' : 'lenient'
      };
    }
  }
  wrapCache.set(slug, { value, expires: now + WRAP_TTL_MS });
  return value;
}

export function bustWrapCache(slug: string): void {
  wrapCache.delete(slug);
}

// ────────────────────────────────────────────────────────────────────
// App meta (visibility_scope) — powers the access gate.
// ────────────────────────────────────────────────────────────────────

export interface AppMetaRuntime {
  slug: string;
  visibility_scope: 'public' | 'unlisted' | 'private' | 'team';
  organization_id?: string;
}

interface CachedAppMeta {
  value: AppMetaRuntime | null;
  expires: number;
}

const appMetaCache = new Map<string, CachedAppMeta>();

export async function loadAppMeta(
  kv: KVNamespace,
  slug: string
): Promise<AppMetaRuntime | null> {
  const hit = appMetaCache.get(slug);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;

  const raw = await kvReadJson(kv, `apps:${slug}:meta`);
  let value: AppMetaRuntime | null = null;
  if (raw && typeof raw === 'object') {
    const r = raw as { visibility_scope?: string; organization_id?: string };
    const scope =
      r.visibility_scope === 'team'
        ? 'team'
        : r.visibility_scope === 'private'
        ? 'private'
        : r.visibility_scope === 'unlisted'
          ? 'unlisted'
          : 'public';
    value = {
      slug,
      visibility_scope: scope,
      organization_id: typeof r.organization_id === 'string' ? r.organization_id : undefined,
    };
  }
  appMetaCache.set(slug, { value, expires: now + WRAP_TTL_MS });
  return value;
}

export function bustAppMetaCache(slug: string): void {
  appMetaCache.delete(slug);
}

// ────────────────────────────────────────────────────────────────────
// Suspension flag — apps:{slug}:suspended. Read on the hot path by the
// access gate; 30s memo like meta. Presence-based (no JSON parse) so a
// corrupt/empty value fails closed (treated as suspended).
// ────────────────────────────────────────────────────────────────────

export interface SuspensionRuntime {
  suspended: boolean;
  reason: string | null;
}

interface CachedSuspension {
  value: SuspensionRuntime;
  expires: number;
}

const suspensionCache = new Map<string, CachedSuspension>();

export async function loadSuspension(
  kv: KVNamespace,
  slug: string
): Promise<SuspensionRuntime> {
  const hit = suspensionCache.get(slug);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;

  const raw = await kv.get(`apps:${slug}:suspended`);
  const value: SuspensionRuntime =
    raw === null || raw === undefined
      ? { suspended: false, reason: null }
      : { suspended: true, reason: raw === '' ? null : raw };
  suspensionCache.set(slug, { value, expires: now + WRAP_TTL_MS });
  return value;
}

export function bustSuspensionCache(slug: string): void {
  suspensionCache.delete(slug);
}
