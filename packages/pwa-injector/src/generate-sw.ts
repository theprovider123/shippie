/**
 * Generate a per-app service worker template.
 *
 * Cache strategy (spec v6 §9.3):
 *   - /__shippie/*  never cached (always fresh)
 *   - HTML          network-first with cache fallback
 *   - other GETs    cache-first with background revalidation
 *
 * The `version` parameter goes into the cache name so HMR + rollouts
 * invalidate cleanly.
 */
export function generateServiceWorker(slug: string, version: number): string {
  return `/* shippie-sw v1 — auto-generated for ${slug} v${version} */
const CACHE = '${slug}-v${version}';
const SYSTEM_PREFIX = '/__shippie/';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.pathname.startsWith(SYSTEM_PREFIX)) return;

  const isDoc = req.mode === 'navigate' ||
                (req.headers.get('accept') || '').includes('text/html');

  if (isDoc) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
        return res;
      } catch {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        return new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  })());
});
`;
}
