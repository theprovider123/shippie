/**
 * Shippie platform service worker.
 *
 * Caching strategy:
 *   - Navigation (HTML): network-first with offline fallback
 *   - Static assets (_next/static): cache-first (immutable hashes)
 *   - API routes: network-only (never cached)
 *   - Images/fonts: cache-first
 *
 * Precaches key routes on install for instant offline access.
 */
const CACHE_NAME = 'shippie-v2';
const PRECACHE_URLS = ['/', '/apps', '/why', '/auth/signin', '/manifest.json'];

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en" style="background:#14120F;color:#EDE4D3">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shippie — Offline</title>
<style>
  body{margin:0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}
  h1{font-size:1.5rem;margin:0 0 0.5rem}
  p{color:#B8A88F;margin:0 0 1.5rem}
  button{background:#E8603C;color:#14120F;border:none;padding:0.75rem 1.5rem;font-size:1rem;font-weight:600;border-radius:4px;cursor:pointer}
</style></head>
<body><div>
  <h1>You're offline</h1>
  <p>Check your connection and try again.</p>
  <button onclick="location.reload()">Retry</button>
</div></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch(() => {
        // Best-effort — don't block install if a precache URL fails
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and API routes
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/__shippie/')) return;

  // Static assets — cache-first (content-hashed, immutable)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation — network-first with branded offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return new Response(OFFLINE_HTML, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          })
        )
    );
    return;
  }

  // Images and fonts — cache-first
  if (/\.(png|jpg|jpeg|svg|gif|webp|woff2?|ttf|otf|ico)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});
