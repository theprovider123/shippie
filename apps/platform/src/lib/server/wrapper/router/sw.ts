/**
 * /__shippie/sw.js — generated service worker per app. Ported from
 * services/worker/src/router/sw.ts.
 *
 * Cache strategy:
 *   - install        → best-effort precache from /__shippie/assets.json
 *   - HTML documents → network-first with typed cache + repair fallback
 *   - Other assets   → cache-first with typed network fallback
 *   - __shippie/*    → bypass, except manifest/sdk/assets/sw essentials
 */
import type { WrapperContext } from '../env';
import { OFFLINE_CAPSULE_SW_HELPERS } from '@shippie/offline-capsule';

const SW_TEMPLATE = (slug: string, version: string) => `// __shippie/sw.js — auto-generated
const LEGACY_CACHE = '${slug}-v${version}';
const SLUG = '${slug}';
const SYSTEM_PREFIX = '/__shippie/';
const ESSENTIAL_SYSTEM = new Set([
  '/__shippie/manifest',
  '/__shippie/manifest.json',
  '/__shippie/sdk.js',
  '/__shippie/sw.js',
]);
${OFFLINE_CAPSULE_SW_HELPERS}

const RECOVERY_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Refreshing app · Shippie</title><style>html,body{margin:0;min-height:100%;background:#14120f;color:#ede4d3;font-family:system-ui,-apple-system,sans-serif}.wrap{min-height:100vh;display:grid;place-items:center;padding:32px;text-align:center}h1{font-size:1.35rem;margin:0 0 8px}p{margin:0;color:#b8a88f;line-height:1.5}.bar{width:180px;height:3px;background:#3a352d;margin:22px auto 0;overflow:hidden}.bar:before{content:"";display:block;width:42%;height:100%;background:#e8603c;animation:load 1s ease-in-out infinite}@keyframes load{0%{transform:translateX(-100%)}100%{transform:translateX(240%)}}</style></head><body><div class="wrap"><div><h1>Refreshing app package</h1><p>Shippie is repairing this app\\'s local cache.</p><div class="bar"></div></div></div><script>setTimeout(function(){location.reload()},1800)</script></body></html>';

function recoveryResponse() {
  return new Response(RECOVERY_HTML, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function expectedResponse(req, res) {
  if (!res || !res.ok) return false;
  const url = new URL(req.url);
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) return type.includes('text/html');
  if (url.pathname.endsWith('.html')) return type.includes('text/html');
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.mjs')) return type.includes('javascript') || type.includes('ecmascript');
  if (url.pathname.endsWith('.css')) return type.includes('text/css');
  if (url.pathname.endsWith('.wasm')) return type.includes('application/wasm');
  if (url.pathname.endsWith('.json')) return type.includes('json');
  if (url.pathname.endsWith('.svg')) return type.includes('image/svg');
  return !type.includes('text/html');
}

async function cacheManifestAssets() {
  try {
    const manifestRes = await fetch('/__shippie/assets.json', { cache: 'no-store' });
    if (!manifestRes.ok) return;
    const manifest = await ShippieOfflineCapsule.sealManifest(await manifestRes.json(), self.location.origin);
    const cacheName = ShippieOfflineCapsule.cacheName(manifest.slug, manifest.manifestHash);
    const cache = await caches.open(cacheName);
    await ShippieOfflineCapsule.putPointer({
      slug: manifest.slug,
      manifestHash: manifest.manifestHash,
      cacheName,
      entryUrl: manifest.entryUrl,
      state: 'downloading',
      totalBytes: manifest.totalBytes,
      updatedAt: new Date().toISOString(),
    });
    for (const asset of manifest.assets) {
      try {
        const req = new Request(asset.url, { cache: 'reload' });
        const res = await fetch(req);
        if (expectedResponse(req, res)) await cache.put(asset.url, res.clone()).catch(() => {});
      } catch {
        /* verified below */
      }
    }
    const check = await ShippieOfflineCapsule.verifyCacheEntries(cache, manifest);
    const boot = check.complete
      ? await ShippieOfflineCapsule.syntheticBoot(cache, manifest)
      : { ok: false };
    if (!check.complete || !boot.ok) {
      await ShippieOfflineCapsule.putPointer({
        slug: manifest.slug,
        manifestHash: manifest.manifestHash,
        cacheName,
        entryUrl: manifest.entryUrl,
        state: 'partial',
        totalBytes: manifest.totalBytes,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    await cache.put(
      '/__shippie-capsules/' + encodeURIComponent(manifest.slug) + '/' + manifest.manifestHash + '.json',
      new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/json' } }),
    ).catch(() => {});
    await ShippieOfflineCapsule.putPointer({
      slug: manifest.slug,
      manifestHash: manifest.manifestHash,
      cacheName,
      entryUrl: manifest.entryUrl,
      state: 'sealed',
      totalBytes: manifest.totalBytes,
      sealedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const pointer = await ShippieOfflineCapsule.getPointer(SLUG).catch(() => null);
    if (pointer) {
      await ShippieOfflineCapsule.putPointer({
        ...pointer,
        state: pointer.state === 'sealed' ? 'sealed' : 'error',
        error: String(err && err.message || err),
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  }
}

async function activeCapsuleCache() {
  const pointer = await ShippieOfflineCapsule.getPointer(SLUG).catch(() => null);
  if (!pointer || pointer.state !== 'sealed' || !pointer.cacheName) return null;
  const cache = await caches.open(pointer.cacheName).catch(() => null);
  return cache ? { pointer, cache } : null;
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
    await Promise.all(names.filter((n) => n !== LEGACY_CACHE && n.startsWith('${slug}-v')).map((n) => caches.delete(n)));
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
      const active = await activeCapsuleCache();
      const repair = url.searchParams.get('shippie_repair') === '1';
      if (repair) {
        await cacheManifestAssets();
      }
      try {
        const networkReq = repair ? new Request(req, { cache: 'reload' }) : req;
        const res = await fetch(networkReq);
        if (expectedResponse(req, res) && active) active.cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
        const cache = active && active.cache;
        const cached =
          (cache && ((await cache.match(req)) ||
          (await cache.match('/')) ||
          (await cache.match('/index.html'))));
        return cached || recoveryResponse();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const active = await activeCapsuleCache();
    const cache = active && active.cache;
    const cached = cache && (await cache.match(req));
    if (cached && expectedResponse(req, cached)) return cached;
    if (cached && cache) await cache.delete(req).catch(() => {});
    try {
      const res = await fetch(req);
      if (expectedResponse(req, res) && cache) {
        cache.put(req, res.clone());
      } else if (!expectedResponse(req, res)) {
        return ShippieOfflineCapsule.repairResponse(SLUG, url.pathname);
      }
      return res;
    } catch {
      if (req.destination === 'script' || req.destination === 'style') {
        await cacheManifestAssets();
      }
      return ShippieOfflineCapsule.repairResponse(SLUG, url.pathname);
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
