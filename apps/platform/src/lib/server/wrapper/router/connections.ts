/**
 * /__shippie/connections — public, user-readable connection policy.
 *
 * This is the runtime transparency surface for Connection Guard. It never
 * stores payloads; it only discloses which hosts this app is allowed to
 * contact and why.
 */
import type { WrapperContext } from '../env';
import { loadWrapMeta } from '../platform-client';
import {
  connectionGuardHost,
  EMPTY_CONNECTION_GUARD,
  wrappedUrlConnectionGuard,
} from './connection-policy';

interface AppMetaWithConnectionGuard {
  slug?: string;
  name?: string;
  version?: number;
  connection_guard?: unknown;
  allowed_connect_domains?: string[];
}

export async function handleConnections(ctx: WrapperContext): Promise<Response> {
  const raw = await ctx.env.CACHE.get(`apps:${ctx.slug}:meta`);
  const wrap = await loadWrapMeta(ctx.env.CACHE, ctx.slug);
  let meta: AppMetaWithConnectionGuard | null = null;
  if (raw) {
    try {
      meta = JSON.parse(raw) as AppMetaWithConnectionGuard;
    } catch {
      meta = null;
    }
  }
  const connectionGuard =
    meta?.connection_guard ??
    (wrap ? wrappedUrlConnectionGuard(wrap.upstreamUrl) : EMPTY_CONNECTION_GUARD);
  const allowedDomains =
    meta?.allowed_connect_domains ??
    connectionGuardHost(connectionGuard);

  return Response.json(
    {
      slug: ctx.slug,
      name: meta?.name ?? ctx.slug,
      version: meta?.version ?? null,
      connection_guard: connectionGuard,
      allowed_connect_domains: allowedDomains,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=60',
      },
    },
  );
}
