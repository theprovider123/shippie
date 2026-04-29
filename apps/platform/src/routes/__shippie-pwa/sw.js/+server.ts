/**
 * GET /__shippie-pwa/sw.js
 *
 * Phase 9.1 — service worker for the marketplace itself. Distinct from
 * /__shippie/sw.js (which serves maker subdomains via the wrapper).
 *
 * Strategy:
 *   - cache-first for /apps directory listings (small, useful offline)
 *   - network-first for everything else (auth, deploy flows)
 *   - graceful offline fallback — show "you're offline" branded page
 *
 * Tiny on purpose: under 2KB minified. The browser caches it. Updates
 * land naturally on next visit because the body changes when we deploy.
 */
import type { RequestHandler } from './$types';

const SW_BODY = `// shippie-marketplace SW
const CACHE = 'shippie-marketplace-v1';
const APPS_PREFIX = '/apps';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Only same-origin marketplace traffic.
  if (url.origin !== self.location.origin) return;

  // Skip /__shippie-pwa/* (this SW + manifest icons) — let them go straight.
  if (url.pathname.startsWith('/__shippie-pwa/')) return;
  // Skip auth + deploy flows — these need fresh data.
  if (url.pathname.startsWith('/auth/')) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/dashboard/')) return;
  if (url.pathname.startsWith('/admin/')) return;
  // Skip /run/<slug>/ — these are 302 redirects into focused-mode and
  // must always reflect current routing logic. A cached redirect can
  // serve a stale shell with a different bridge protocol.
  if (url.pathname.startsWith('/run/')) return;

  if (url.pathname.startsWith(APPS_PREFIX)) {
    // cache-first for the apps directory
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) {
        // refresh in background
        fetch(req).then((res) => { if (res.ok) cache.put(req, res); }).catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return new Response('You are offline. The marketplace will refresh when you reconnect.', {
          status: 503,
          headers: { 'content-type': 'text/plain' },
        });
      }
    })());
    return;
  }

  // Network-first elsewhere with cache fallback for navigations.
  const isDoc = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isDoc) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req) || await cache.match('/');
        if (cached) return cached;
        return new Response('Shippie is offline. Reconnect to browse.', {
          status: 503,
          headers: { 'content-type': 'text/plain' },
        });
      }
    })());
  }
});
`;

export const GET: RequestHandler = async () => {
  return new Response(SW_BODY, {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'service-worker-allowed': '/',
      'cache-control': 'no-store',
    },
  });
};
