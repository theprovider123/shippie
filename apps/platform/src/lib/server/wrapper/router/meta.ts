/**
 * /__shippie/meta — public app metadata. Ported from
 * services/worker/src/router/meta.ts; reads from `apps:{slug}:meta` KV.
 */
import type { WrapperContext } from '../env';

interface AppMetaPayload {
  slug: string;
  name?: string;
  type?: 'app' | 'web_app' | 'website';
  theme_color?: string;
  background_color?: string;
  icon?: string;
  version?: number;
  backend_type?: string | null;
  backend_url?: string | null;
  permissions?: {
    auth: boolean;
    storage: 'none' | 'r' | 'rw';
    files: boolean;
    notifications: boolean;
    analytics: boolean;
    native_bridge?: string[];
  };
}

export async function handleMeta(ctx: WrapperContext): Promise<Response> {
  const raw = await ctx.env.CACHE.get(`apps:${ctx.slug}:meta`);
  let meta: AppMetaPayload | null = null;
  if (raw) {
    try {
      meta = JSON.parse(raw) as AppMetaPayload;
    } catch {
      meta = null;
    }
  }

  if (!meta) {
    const stub: AppMetaPayload = {
      slug: ctx.slug,
      name: ctx.slug,
      type: 'app',
      theme_color: '#f97316',
      background_color: '#ffffff',
      version: 0,
      backend_type: null,
      backend_url: null,
      permissions: {
        auth: false,
        storage: 'none',
        files: false,
        notifications: false,
        analytics: true
      }
    };
    return Response.json(stub, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  return Response.json(meta, {
    status: 200,
    headers: { 'Cache-Control': 'public, max-age=60' }
  });
}
