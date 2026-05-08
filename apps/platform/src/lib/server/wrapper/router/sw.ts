/**
 * /__shippie/sw.js — generated service worker per app. Ported from
 * services/worker/src/router/sw.ts.
 *
 * Cache strategy:
 *   - install        → best-effort precache from /__shippie/assets.json
 *   - HTML documents → network-first with cache + repair fallback
 *   - Other assets   → cache-first with network fallback
 *   - __shippie/*    → bypass, except manifest/sdk/assets/sw essentials
 */
import type { WrapperContext } from '../env';

const SW_TEMPLATE = (slug: string, version: string) => `// __shippie/sw.js — auto-generated
const CACHE = '${slug}-v${version}';
const SYSTEM_PREFIX = '/__shippie/';
const ESSENTIAL_SYSTEM = new Set([
  '/__shippie/manifest',
  '/__shippie/manifest.json',
  '/__shippie/sdk.js',
  '/__shippie/sw.js',
]);

const RECOVERY_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Refreshing app · Shippie</title><style>html,body{margin:0;min-height:100%;background:#14120f;color:#ede4d3;font-family:system-ui,-apple-system,sans-serif}.wrap{min-height:100vh;display:grid;place-items:center;padding:32px;text-align:center}h1{font-size:1.35rem;margin:0 0 8px}p{margin:0;color:#b8a88f;line-height:1.5}.bar{width:180px;height:3px;background:#3a352d;margin:22px auto 0;overflow:hidden}.bar:before{content:"";display:block;width:42%;height:100%;background:#e8603c;animation:load 1s ease-in-out infinite}@keyframes load{0%{transform:translateX(-100%)}100%{transform:translateX(240%)}}</style></head><body><div class="wrap"><div><h1>Refreshing app package</h1><p>Shippie is repairing this app\\'s local cache.</p><div class="bar"></div></div></div><script>setTimeout(function(){location.reload()},1800)</script></body></html>';

function recoveryResponse() {
  return new Response(RECOVERY_HTML, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function cacheManifestAssets() {
  const cache = await caches.open(CACHE);
  try {
    const manifestRes = await fetch('/__shippie/assets.json', { cache: 'no-store' });
    if (!manifestRes.ok) return;
    const manifest = await manifestRes.json();
    const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
    await Promise.allSettled(
      assets.slice(0, 500).map(async (url) => {
        try {
          const req = new Request(url, { cache: 'reload' });
          const res = await fetch(req);
          if (res.ok) await cache.put(url, res.clone()).catch(() => {});
        } catch {
          /* best effort */
        }
      }),
    );
  } catch {
    /* best effort */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await cacheManifestAssets();
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE && n.startsWith('${slug}-v')).map((n) => caches.delete(n)));
    await clients.claim();
    await cacheManifestAssets();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.pathname.startsWith(SYSTEM_PREFIX) && !ESSENTIAL_SYSTEM.has(url.pathname)) return;

  const isDoc = req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html');
  if (isDoc) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const repair = url.searchParams.get('shippie_repair') === '1';
      if (repair) {
        await cache.delete(req).catch(() => {});
        await cacheManifestAssets();
      }
      try {
        const networkReq = repair ? new Request(req, { cache: 'reload' }) : req;
        const res = await fetch(networkReq);
        if (res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
        const cached =
          (await cache.match(req)) ||
          (await cache.match('/')) ||
          (await cache.match('/index.html'));
        return cached || recoveryResponse();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      if (req.destination === 'script' || req.destination === 'style') {
        await cacheManifestAssets();
      }
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});
`;

export async function handleSw(ctx: WrapperContext): Promise<Response> {
  const versionStr = (await ctx.env.CACHE.get(`apps:${ctx.slug}:active`)) ?? '0';
  return new Response(SW_TEMPLATE(ctx.slug, versionStr), {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': '/'
    }
  });
}
