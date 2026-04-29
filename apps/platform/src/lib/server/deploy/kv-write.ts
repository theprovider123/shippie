/**
 * KV writes — direct binding access to platform.env.CACHE.
 *
 * Replaces apps/web/lib/deploy/kv.ts which used @shippie/cf-storage's
 * CfKv over HTTPS. The key shapes are unchanged:
 *
 *   apps:{slug}:meta     — runtime metadata read by the Worker on every request
 *   apps:{slug}:active   — version pointer, atomic-flip-last for swap-coherence
 *   apps:{slug}:csp      — CSP header string
 *   apps:{slug}:wrap     — wrap-mode upstream URL + csp_mode
 *
 * The wrapper rewriter (Phase 5) reads these same keys via direct binding
 * access, so the contract is preserved.
 */
import type { KVNamespace } from '@cloudflare/workers-types';
import type { ShippieJsonLite } from './manifest';

export interface AppMeta {
  slug: string;
  name: string;
  type: string;
  theme_color: string;
  background_color: string;
  version: number;
  visibility_scope: string;
  permissions?: ShippieJsonLite['permissions'];
  backend_type?: string | null;
  backend_url?: string | null;
  allowed_connect_domains?: string[];
  workflow_probes?: string[];
}

export async function writeAppMeta(
  kv: KVNamespace,
  slug: string,
  meta: AppMeta,
): Promise<void> {
  await kv.put(`apps:${slug}:meta`, JSON.stringify(meta));
}

/**
 * Patch a subset of fields in the meta row. Used by visibility flips, etc.
 */
export async function patchAppMeta(
  kv: KVNamespace,
  slug: string,
  patch: Partial<AppMeta>,
): Promise<void> {
  const existing = await kv.get(`apps:${slug}:meta`);
  const current: Record<string, unknown> = existing ? (JSON.parse(existing) as Record<string, unknown>) : {};
  await kv.put(`apps:${slug}:meta`, JSON.stringify({ ...current, ...patch }));
}

export async function writeActivePointer(
  kv: KVNamespace,
  slug: string,
  version: number,
): Promise<void> {
  await kv.put(`apps:${slug}:active`, String(version));
}

export async function writeCspHeader(
  kv: KVNamespace,
  slug: string,
  header: string,
): Promise<void> {
  await kv.put(`apps:${slug}:csp`, header);
}

export interface WrapMeta {
  upstream_url: string;
  csp_mode: 'lenient' | 'strict';
}

export async function writeWrapMeta(
  kv: KVNamespace,
  slug: string,
  meta: WrapMeta,
): Promise<void> {
  await kv.put(`apps:${slug}:wrap`, JSON.stringify(meta));
}

/**
 * Deploy-time AppProfile from @shippie/analyse. Stored under
 * `apps:{slug}:profile` for the maker dashboard's Enhancements tab and
 * the wrapper's PWA manifest synth (smart-defaults reads it).
 *
 * 30-day TTL — every successful deploy rewrites it; expiry guards against
 * orphan profiles for slugs the maker no longer owns.
 *
 * Typed as `unknown` here to avoid pulling @shippie/analyse types into
 * this Worker module; callers pass an `AppProfile` and the dashboard's
 * loader casts on read.
 */
export async function writeAppProfile(
  kv: KVNamespace,
  slug: string,
  profile: unknown,
): Promise<void> {
  await kv.put(`apps:${slug}:profile`, JSON.stringify(profile), {
    expirationTtl: 60 * 60 * 24 * 30,
  });
}

export async function readAppProfile(
  kv: KVNamespace,
  slug: string,
): Promise<unknown | null> {
  const raw = await kv.get(`apps:${slug}:profile`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * App Kinds profile (docs/app-kinds.md). Stored under
 * `apps:{slug}:kind-profile` alongside the existing AppProfile blob.
 *
 * Same TTL pattern as writeAppProfile — 30 days, refreshed on every
 * successful deploy.
 */
export async function writeAppKindProfile(
  kv: KVNamespace,
  slug: string,
  profile: unknown,
): Promise<void> {
  await kv.put(`apps:${slug}:kind-profile`, JSON.stringify(profile), {
    expirationTtl: 60 * 60 * 24 * 30,
  });
}

export async function readAppKindProfile(
  kv: KVNamespace,
  slug: string,
): Promise<unknown | null> {
  const raw = await kv.get(`apps:${slug}:kind-profile`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * KV-backed read/write of the maker's overridden shippie.json edited via
 * the Enhancements tab. Separate from the deploy-time manifest — the next
 * deploy picks this up. Stored under `apps:{slug}:shippie-json`.
 */
export async function readShippieJsonOverride(
  kv: KVNamespace,
  slug: string,
): Promise<Record<string, unknown> | null> {
  const raw = await kv.get(`apps:${slug}:shippie-json`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function writeShippieJsonOverride(
  kv: KVNamespace,
  slug: string,
  json: Record<string, unknown>,
): Promise<void> {
  await kv.put(`apps:${slug}:shippie-json`, JSON.stringify(json));
}

export async function clearShippieJsonOverride(
  kv: KVNamespace,
  slug: string,
): Promise<void> {
  await kv.delete(`apps:${slug}:shippie-json`);
}
