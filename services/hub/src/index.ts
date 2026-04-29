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
import { serveAppFile, extractSlugFromHost, listCachedApps } from './static.ts';
import { renderDashboard } from './dashboard.ts';
import { ingestPackageArchive, serveLocalCollection, servePackageArchive, withCors } from './packages.ts';

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
  let actualPort = config.port;

  const server = Bun.serve<WsData, never>({
    port: config.port,
    hostname: config.host,
    async fetch(req, srv) {
      const url = new URL(req.url);
      const host = req.headers.get('host') ?? '';

      if (req.method === 'OPTIONS') {
        return withCors(new Response(null, { status: 204 }));
      }

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

      // 6a) Portable package ingest + local mirror serving. This is the
      //     narrow Hub MVP path: install a verified .shippie archive without
      //     needing the public platform to be online.
      if (url.pathname === '/api/packages' && req.method === 'POST') {
        const bytes = new Uint8Array(await req.arrayBuffer());
        try {
          const result = await ingestPackageArchive({
            cacheRoot: config.cacheRoot,
            archiveBytes: bytes,
            origin: hubOrigin(req, actualPort),
            expectedPackageHash: req.headers.get('x-shippie-package-hash'),
          });
          return withCors(Response.json({ ok: true, ...result }));
        } catch (err) {
          return withCors(Response.json(
            { error: 'invalid_package', message: (err as Error).message },
            { status: 400 },
          ));
        }
      }

      const packageMatch = /^\/packages\/(sha256:[a-f0-9]{64}\.shippie)$/i.exec(url.pathname);
      if (packageMatch) {
        return servePackageArchive(config.cacheRoot, packageMatch[1]!);
      }

      if (url.pathname === '/collections/local-mirror.json') {
        return serveLocalCollection(config.cacheRoot, hubOrigin(req, actualPort));
      }

      // 6b) Phase 9.2 — local marketplace listing.
      if (url.pathname === '/api/hub/marketplace') {
        const apps = await listCachedApps(config.cacheRoot);
        return Response.json({ apps });
      }

      // 6c) Phase 9.2 — privacy-first analytics beacon ingestion. The
      //     wrapper SDK already enforces the schema; we just persist.
      //     Local-only network — no auth required for v1.
      if (url.pathname === '/api/v1/analytics/beacon' && req.method === 'POST') {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response(JSON.stringify({ error: 'invalid_json' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        }
        const beacon = body as {
          appSlug?: unknown;
          period?: unknown;
          sessionHash?: unknown;
          metrics?: unknown;
        };
        if (
          typeof beacon.appSlug !== 'string' ||
          typeof beacon.period !== 'string' ||
          typeof beacon.sessionHash !== 'string'
        ) {
          return new Response(JSON.stringify({ error: 'invalid_beacon' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        }
        state.recordBeacon({
          appSlug: beacon.appSlug,
          period: beacon.period,
          sessionHash: beacon.sessionHash,
          metrics: beacon.metrics,
        });
        return Response.json({ ok: true });
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
  actualPort = server.port ?? config.port;
  const handleConfig = { ...config, port: actualPort };

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
            port: actualPort,
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
    `[hub] listening on ${config.host}:${actualPort} — cache at ${config.cacheRoot}` +
      (mdnsStop ? ' — advertising mDNS' : ''),
  );

  return {
    config: handleConfig,
    state,
    modelCache,
    async stop() {
      if (mdnsStop) await mdnsStop();
      server.stop(true);
    },
  };
}

function hubOrigin(req: Request, fallbackPort: number): string {
  const host = req.headers.get('host') ?? `hub.local:${fallbackPort}`;
  return `http://${host}`;
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
