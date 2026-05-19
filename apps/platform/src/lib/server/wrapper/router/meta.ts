/**
 * /__shippie/meta — public app metadata. Ported from
 * services/worker/src/router/meta.ts; reads from `apps:{slug}:meta` KV.
 */
import type { WrapperContext } from '../env';
import { loadWrapMeta } from '../platform-client';
import {
  connectionGuardHost,
  EMPTY_CONNECTION_GUARD,
  wrappedUrlConnectionGuard,
} from './connection-policy';

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
  allowed_connect_domains?: string[];
  connection_guard?: unknown;
  workflow_probes?: string[];
  data?: {
    mode: string;
    documents: string[];
    attachments: boolean;
    recovery: string;
    migrations: string;
    snapshots: string;
    media: string;
    realtime: string;
    localStorage?: {
      keys?: string[];
      prefixes?: string[];
    };
  };
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
  const wrap = await loadWrapMeta(ctx.env.CACHE, ctx.slug);
  let meta: AppMetaPayload | null = null;
  if (raw) {
    try {
      meta = JSON.parse(raw) as AppMetaPayload;
    } catch {
      meta = null;
    }
  }

  if (!meta) {
    const connectionGuard = wrap
      ? wrappedUrlConnectionGuard(wrap.upstreamUrl)
      : EMPTY_CONNECTION_GUARD;
    const stub: AppMetaPayload = {
      slug: ctx.slug,
      name: ctx.slug,
      type: 'app',
      theme_color: '#f97316',
      background_color: '#ffffff',
      version: 0,
      backend_type: null,
      backend_url: null,
      allowed_connect_domains: connectionGuardHost(connectionGuard),
      connection_guard: connectionGuard,
      workflow_probes: [],
      data: {
        mode: 'shippie-documents',
        documents: ['main'],
        attachments: false,
        recovery: 'inherited',
        migrations: 'snapshot-v0',
        snapshots: 'inherited',
        media: 'none',
        realtime: 'inherited',
        localStorage: { keys: [], prefixes: [] }
      },
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

  if (!meta.connection_guard && wrap) {
    const connectionGuard = wrappedUrlConnectionGuard(wrap.upstreamUrl);
    meta = {
      ...meta,
      allowed_connect_domains: meta.allowed_connect_domains ?? connectionGuardHost(connectionGuard),
      connection_guard: connectionGuard,
    };
  }

  return Response.json(meta, {
    status: 200,
    headers: { 'Cache-Control': 'public, max-age=60' }
  });
}
