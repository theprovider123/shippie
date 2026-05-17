/**
 * Generate a per-app service worker template.
 *
 * Cache strategy (spec v6 §9.3):
 *   - /__shippie/*  never cached (always fresh)
 *   - HTML          network-first with typed cache fallback
 *   - other GETs    cache-first with typed background revalidation
 *
 * The `version` parameter goes into the cache name so HMR + rollouts
 * invalidate cleanly.
 */
export function generateServiceWorker(slug: string, version: number): string {
  return `/* shippie-sw v1 — auto-generated for ${slug} v${version} */
const CACHE = '${slug}-v${version}';
const SYSTEM_PREFIX = '/__shippie/';

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
        if (expectedResponse(req, res)) cache.put(req, res.clone());
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
    if (expectedResponse(req, res)) cache.put(req, res.clone());
    return res;
  })());
});

// Ambient: react to scheduled periodic sync. Cannot run analysers here
// (no module imports), so just drop a marker that the document side will
// see on next app open.
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'shippie-ambient') return;
  event.waitUntil((async () => {
    try {
      const req = indexedDB.open('shippie-ambient-scheduler', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('meta')) {
          req.result.createObjectStore('meta');
        }
        if (!req.result.objectStoreNames.contains('sweep-markers')) {
          req.result.createObjectStore('sweep-markers', { autoIncrement: true });
        }
      };
      const db = await new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('sweep-markers', 'readwrite');
        tx.objectStore('sweep-markers').add({ ts: Date.now(), tag: event.tag });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      /* SW must never throw — periodic sync would be cancelled */
    }
  })());
});
`;
}
