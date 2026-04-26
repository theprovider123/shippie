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
