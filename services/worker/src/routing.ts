/**
 * Host header → app slug resolution.
 *
 * Resolution order:
 *   1. *.shippie.app subdomain → slug directly
 *   2. *.localhost (dev) → slug directly
 *   3. Custom domain → KV lookup `custom-domains:{hostname}` → slug
 *   4. Unknown → null (rejected by app middleware)
 *
 * Spec v5 §5.
 */
import type { WorkerEnv } from './env.ts';

export interface ResolvedHost {
  slug: string;
  isCanonical: boolean;
  canonicalDomain?: string;
}

/**
 * Synchronous slug resolution for built-in subdomains.
 * Returns null for custom domains (needs async KV lookup).
 */
export function resolveAppSlug(req: Request): string | null {
  const host = req.headers.get('host') ?? '';
  const hostname = host.split(':')[0] ?? '';
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length === 0) return null;

  // Local dev: *.localhost
  if (parts[parts.length - 1] === 'localhost') {
    if (parts.length < 2) return null;
    return parts.slice(0, -1).join('.');
  }

  // Production: *.shippie.app
  if (parts.length >= 3 && parts[parts.length - 2] === 'shippie' && parts[parts.length - 1] === 'app') {
    return parts.slice(0, -2).join('.');
  }

  // Unknown — might be a custom domain (resolved async in resolveHostFull)
  return null;
}

/**
 * Full async resolution including custom domain KV lookup.
 * Called by the app middleware when the sync path returns null.
 */
export async function resolveHostFull(
  req: Request,
  env: WorkerEnv,
): Promise<ResolvedHost | null> {
  // Try sync first
  const syncSlug = resolveAppSlug(req);
  if (syncSlug) {
    return { slug: syncSlug, isCanonical: true };
  }

  // Custom domain lookup
  const host = req.headers.get('host') ?? '';
  const hostname = host.split(':')[0]?.toLowerCase() ?? '';
  if (!hostname) return null;

  const entry = await env.APP_CONFIG.getJson<{
    slug: string;
    is_canonical: boolean;
    canonical_domain?: string;
  }>(`custom-domains:${hostname}`);

  if (!entry) return null;

  return {
    slug: entry.slug,
    isCanonical: entry.is_canonical,
    canonicalDomain: entry.canonical_domain,
  };
}
