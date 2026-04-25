/**
 * Shippie Hub — entry point.
 *
 * One process, three concerns:
 *   1. HTTP + WebSocket server on :80 (configurable via HUB_PORT).
 *   2. mDNS broadcast as `hub.local` so devices on the LAN find us.
 *   3. Internal state (in-memory rooms, on-disk app + model caches).
 *
 * Routes:
 *   GET  /__shippie/health          → liveness probe (used by transport-select)
 *   GET  /                          → dashboard (Host: hub.local)
 *   GET  /api/rooms                 → JSON room stats
 *   GET  /__shippie/signal/<roomId> → WebSocket signalling (also accepted at /signal/<roomId>)
 *   GET  /models/<rest>             → read-through model cache
 *   GET  /apps/<slug>/<rest>        → cached static app files
 *
 * The Hub deployment is internal-network only. No outbound connections
 * unless the model cache is fetching from `ai.shippie.app`.
 */

import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { ServerWebSocket } from 'bun';
import { HubState } from './state.ts';
import { wsHandlerFor, extractRoomId } from './signal.ts';
import { ModelCache } from './model-cache.ts';
import { serveAppFile, extractSlugFromHost } from './static.ts';
import { renderDashboard } from './dashboard.ts';

interface WsData {
  roomId: string;
  peerId: string | null;
}

export interface HubConfig {
  port: number;
  host: string;
  /** Disk root for app + model caches. */
  cacheRoot: string;
  /** Upstream for model fetches. */
  upstream: string;
  /** Service name advertised over mDNS. */
  mdnsName: string;
  /** Disable mDNS (useful for tests / single-machine dev). */
  disableMdns: boolean;
}

export function loadConfig(env = process.env): HubConfig {
  return {
    port: Number(env.HUB_PORT ?? 80),
    host: env.HUB_HOST ?? '0.0.0.0',
    cacheRoot: env.HUB_CACHE_ROOT ?? '/var/lib/shippie-hub',
    upstream: env.HUB_UPSTREAM ?? 'https://ai.shippie.app',
    mdnsName: env.HUB_MDNS_NAME ?? 'hub',
    disableMdns: env.HUB_DISABLE_MDNS === '1',
  };
}

export interface HubHandle {
  config: HubConfig;
  state: HubState;
  modelCache: ModelCache;
  stop(): Promise<void>;
}

export async function startHub(config: HubConfig): Promise<HubHandle> {
  // Ensure the cache directory tree exists. Don't blow up if the OS
  // says no — log and continue with an in-memory-only mode.
  try {
    mkdirSync(join(config.cacheRoot, 'apps'), { recursive: true });
    mkdirSync(join(config.cacheRoot, 'models'), { recursive: true });
  } catch (err) {
    console.warn('[hub] cache root unwritable:', (err as Error).message);
  }

  const state = new HubState({ dbPath: join(config.cacheRoot, 'audit.sqlite') });
  const modelCache = new ModelCache({
    cacheRoot: config.cacheRoot,
    upstream: config.upstream,
  });

  const ws = wsHandlerFor(state);

  const server = Bun.serve<WsData, never>({
    port: config.port,
    hostname: config.host,
    async fetch(req, srv) {
      const url = new URL(req.url);
      const host = req.headers.get('host') ?? '';

      // 1) WebSocket upgrade for signalling.
      const roomId = extractRoomId(url.pathname);
      if (roomId && req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
        const ok = srv.upgrade(req, { data: { roomId, peerId: null } });
        if (ok) return undefined as unknown as Response;
        return new Response('upgrade failed', { status: 400 });
      }

      // 2) Health probe — always cheap, never authenticates.
      if (url.pathname === '/__shippie/health' || url.pathname === '/health') {
        return Response.json({ ok: true, service: 'shippie-hub' });
      }

      // 3) Per-app static (Host: <slug>.hub.local).
      const slugFromHost = extractSlugFromHost(host);
      if (slugFromHost) {
        return serveAppFile(config.cacheRoot, slugFromHost, url.pathname);
      }

      // 4) /apps/<slug>/<rest> — explicit slug in path (e.g. for hub.local itself).
      const appMatch = /^\/apps\/([a-z0-9][a-z0-9-]*)\/?(.*)$/.exec(url.pathname);
      if (appMatch) {
        return serveAppFile(config.cacheRoot, appMatch[1]!, appMatch[2]!);
      }

      // 5) Model cache.
      if (url.pathname.startsWith('/models/')) {
        const res = await modelCache.serve(url.pathname.slice('/models/'.length));
        return res ?? new Response('bad model path', { status: 400 });
      }

      // 6) Dashboard JSON.
      if (url.pathname === '/api/rooms') {
        return Response.json(state.stats());
      }

      // 7) Dashboard HTML.
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return new Response(await renderDashboard({ cacheRoot: config.cacheRoot, state }), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }

      return new Response('not found', { status: 404 });
    },
    websocket: {
      open(socket: ServerWebSocket<WsData>) {
        ws.open(socket);
      },
      message(socket: ServerWebSocket<WsData>, message: string | Uint8Array) {
        ws.message(socket, message);
      },
      close(socket: ServerWebSocket<WsData>) {
        ws.close(socket);
      },
    },
  });

  // mDNS broadcast — bonjour-service advertises hub.local on the LAN.
  // Lazy-loaded so tests that disable mDNS don't pay the import cost.
  let mdnsStop: (() => Promise<void>) | null = null;
  if (!config.disableMdns) {
    try {
      const mod: unknown = await import('bonjour-service').catch(() => null);
      if (mod && typeof mod === 'object') {
        const Ctor = (mod as { Bonjour?: new () => BonjourLike } & {
          default?: new () => BonjourLike;
        }).Bonjour ?? (mod as { default?: new () => BonjourLike }).default;
        if (typeof Ctor === 'function') {
          const bonjour = new Ctor();
          bonjour.publish({
            name: config.mdnsName,
            type: 'http',
            port: config.port,
            txt: { service: 'shippie-hub' },
          });
          mdnsStop = async () => {
            await new Promise<void>((res) => bonjour.unpublishAll(() => res()));
            bonjour.destroy();
          };
        }
      }
    } catch (err) {
      console.warn('[hub] mDNS unavailable:', (err as Error).message);
    }
  }

  console.log(
    `[hub] listening on ${config.host}:${config.port} — cache at ${config.cacheRoot}` +
      (mdnsStop ? ' — advertising mDNS' : ''),
  );

  return {
    config,
    state,
    modelCache,
    async stop() {
      if (mdnsStop) await mdnsStop();
      server.stop(true);
    },
  };
}

interface BonjourLike {
  publish(opts: {
    name: string;
    type: string;
    port: number;
    txt?: Record<string, string>;
  }): unknown;
  unpublishAll(cb: () => void): void;
  destroy(): void;
}

// Run as `bun run src/index.ts` for local dev.
if (import.meta.main) {
  const cfg = loadConfig();
  await startHub(cfg);
}
