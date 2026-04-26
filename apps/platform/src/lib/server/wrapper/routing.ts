/**
 * Host header → app slug resolution. Ported from services/worker/src/routing.ts
 * and adapted to read from a Cloudflare KVNamespace directly (no KvStore shim).
 *
 * Resolution order:
 *   1. *.shippie.app subdomain → slug directly
 *   2. *.localhost (dev) → slug directly
 *   3. *.<ip>.nip.io (LAN dev) → slug from first label
 *   4. Custom domain → KV `custom-domains:{hostname}` → slug
 *   5. Unknown → null
 */
import type { KVNamespace } from '@cloudflare/workers-types';

export interface ResolvedHost {
  slug: string;
  isCanonical: boolean;
  canonicalDomain?: string;
}

const PLATFORM_HOSTS = new Set([
  'shippie.app',
  'next.shippie.app',
  'www.shippie.app',
  'ai.shippie.app',
  'localhost'
]);

/**
 * Synchronous slug resolution for built-in subdomains.
 * Returns null for the platform hosts and for custom domains
 * (those need an async KV lookup).
 */
export function resolveAppSlug(req: Request): string | null {
  const host = req.headers.get('host') ?? '';
  const hostname = host.split(':')[0]?.toLowerCase() ?? '';
  if (!hostname) return null;

  // Never treat the platform's own apex/canonical/AI hosts as a maker subdomain.
  if (PLATFORM_HOSTS.has(hostname)) return null;

  const parts = hostname.split('.').filter(Boolean);
  if (parts.length === 0) return null;

  // Local dev: *.localhost
  if (parts[parts.length - 1] === 'localhost') {
    if (parts.length < 2) return null;
    return parts.slice(0, -1).join('.');
  }

  // LAN dev: {slug}.<ip>.nip.io
  if (
    parts.length >= 3 &&
    parts[parts.length - 2] === 'nip' &&
    parts[parts.length - 1] === 'io'
  ) {
    return parts[0] ?? null;
  }

  // Production: *.shippie.app
  if (
    parts.length >= 3 &&
    parts[parts.length - 2] === 'shippie' &&
    parts[parts.length - 1] === 'app'
  ) {
    return parts.slice(0, -2).join('.');
  }

  return null;
}

/**
 * Async resolution including custom-domain KV lookup.
 */
export async function resolveHostFull(
  req: Request,
  cache: KVNamespace
): Promise<ResolvedHost | null> {
  const syncSlug = resolveAppSlug(req);
  if (syncSlug) return { slug: syncSlug, isCanonical: true };

  const host = req.headers.get('host') ?? '';
  const hostname = host.split(':')[0]?.toLowerCase() ?? '';
  if (!hostname) return null;

  const raw = await cache.get(`custom-domains:${hostname}`);
  if (!raw) return null;
  let entry: {
    slug?: string;
    is_canonical?: boolean;
    canonical_domain?: string;
  };
  try {
    entry = JSON.parse(raw) as typeof entry;
  } catch {
    return null;
  }
  if (!entry.slug) return null;

  return {
    slug: entry.slug,
    isCanonical: entry.is_canonical === true,
    canonicalDomain: entry.canonical_domain
  };
}
