/**
 * Minimal offline shell — caches the app shell on install, serves from
 * cache when the network fails. Uses the same patterns as
 * packages/pwa-injector. We deliberately don't try to cache JS chunks
 * (Vite hashes them) — the network-first fall-through gets them, and
 * the shell stays useful offline.
 */
const VERSION = 'shippie-whiteboard-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache successful navigations so the app shell is available offline.
        if (req.mode === 'navigate' && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((m) => m ?? caches.match('/'))),
  );
});
