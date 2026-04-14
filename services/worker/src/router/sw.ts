/**
 * __shippie/sw.js
 *
 * Generated service worker per app. Cache strategy:
 *   - HTML documents  → network-first
 *   - Hashed assets   → cache-first, immutable
 *   - Other           → stale-while-revalidate
 *
 * Cache names include the active version so rollouts are clean.
 *
 * Spec v6 §9.3.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';

const SW_TEMPLATE = (slug: string, version: string) => `// __shippie/sw.js — auto-generated
const CACHE = '${slug}-v${version}';
const SYSTEM_PREFIX = '/__shippie/';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // __shippie/* is always fresh
  if (url.pathname.startsWith(SYSTEM_PREFIX)) return;

  const isDoc = req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html');
  if (isDoc) {
    // network-first for HTML
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
        return res;
      } catch {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        return cached || Response.error();
      }
    })());
    return;
  }

  // cache-first for other GETs (images, js, css)
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

export const swRouter = new Hono<AppBindings>();

swRouter.get('/', async (c) => {
  const slug = c.var.slug;
  const versionStr = (await c.env.APP_CONFIG.get(`apps:${slug}:active`)) ?? '0';

  return new Response(SW_TEMPLATE(slug, versionStr), {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': '/',
    },
  });
});
