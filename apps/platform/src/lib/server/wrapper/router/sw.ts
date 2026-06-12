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

/**
 * Branded-lite recovery / offline page served when neither the network nor
 * the sealed capsule can satisfy a navigation. Dependency-free inline HTML.
 * Retries automatically when connectivity returns; the button covers the
 * "I think I'm back online" case.
 */
function recoveryHtml(appName: string): string {
  const safeName = appName
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${safeName} · Shippie</title>` +
    '<style>html,body{margin:0;min-height:100%;background:#14120f;color:#ede4d3;font-family:system-ui,-apple-system,sans-serif}' +
    '.wrap{min-height:100vh;display:grid;place-items:center;padding:32px;text-align:center}' +
    '.kicker{margin:0 0 10px;font-size:0.72rem;letter-spacing:0.16em;text-transform:uppercase;color:#b8a88f}' +
    'h1{font-size:1.35rem;margin:0 0 8px}p{margin:0 auto;max-width:34ch;color:#b8a88f;line-height:1.5}' +
    'button{margin-top:22px;padding:10px 22px;border:1px solid #3a352d;background:transparent;color:#ede4d3;font:inherit;font-size:0.9rem;cursor:pointer}' +
    'button:hover{border-color:#e8603c;color:#e8603c}' +
    '</style></head><body><div class="wrap"><div>' +
    `<p class="kicker">${safeName}</p>` +
    '<h1>You&rsquo;re offline</h1>' +
    '<p>This tool isn&rsquo;t fully saved on this device. Reconnect once to finish saving.</p>' +
    '<button type="button" onclick="location.reload()">Retry</button>' +
    '</div></div><script>addEventListener("online",function(){location.reload()})</script></body></html>'
  );
}

const SW_TEMPLATE = (slug: string, version: string, appName: string) => `// __shippie/sw.js — auto-generated
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

const RECOVERY_HTML = ${JSON.stringify(recoveryHtml(appName))};

function recoveryResponse() {
  return new Response(RECOVERY_HTML, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// Slow-network budgets for network-first HTML. With the capsule holding a
// copy of the document the network only gets a short head start before we
// serve the saved copy; with nothing cached we wait longer before the
// recovery page.
const DOC_TIMEOUT_WITH_FALLBACK_MS = 3500;
const DOC_TIMEOUT_WITHOUT_FALLBACK_MS = 8000;

async function fetchWithTimeout(req, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(req, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
      // Network-first with a slow-network budget: when the capsule already
      // holds this document the network only gets ~3.5s before we serve the
      // saved copy; with no fallback we wait longer before the recovery page.
      const cache = active && active.cache;
      const cached =
        (cache && ((await cache.match(req)) ||
        (await cache.match('/')) ||
        (await cache.match('/index.html')))) || null;
      const budgetMs = cached ? DOC_TIMEOUT_WITH_FALLBACK_MS : DOC_TIMEOUT_WITHOUT_FALLBACK_MS;
      try {
        const networkReq = repair ? new Request(req, { cache: 'reload' }) : req;
        const res = await fetchWithTimeout(networkReq, budgetMs);
        if (expectedResponse(req, res) && active) active.cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
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
  const [versionStr, metaRaw] = await Promise.all([
    ctx.env.CACHE.get(`apps:${ctx.slug}:active`),
    ctx.env.CACHE.get(`apps:${ctx.slug}:meta`),
  ]);
  let appName = ctx.slug;
  if (metaRaw) {
    try {
      const meta = JSON.parse(metaRaw) as { name?: string };
      if (typeof meta.name === 'string' && meta.name.trim()) appName = meta.name.trim();
    } catch {
      // Bad meta JSON — slug is a fine fallback.
    }
  }
  return new Response(SW_TEMPLATE(ctx.slug, versionStr ?? '0', appName), {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': '/'
    }
  });
}
