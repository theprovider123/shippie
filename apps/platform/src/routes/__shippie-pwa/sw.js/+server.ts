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
import { SHOWCASE_PRECACHE } from '$lib/_generated/precache-list';

const SW_BODY = `// shippie-marketplace SW
const CACHE = 'shippie-marketplace-__SHIPPIE_BUILD__';
const APPS_PREFIX = '/apps';

// Branded offline response — used when network fails and there is no
// usable cached document. Inline rocket + system fonts (no remote font
// fetch when offline) + 10s auto-retry. Beats the prior text/plain
// 503 which iOS Safari sometimes rendered as nothing inside a PWA.
const OFFLINE_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Shippie</title><style>html,body{margin:0;background:#14120F;color:#EDE4D3;height:100%;font-family:system-ui,-apple-system,sans-serif}.wrap{min-height:100vh;display:grid;place-items:center;padding:32px;text-align:center}.r{width:96px;height:96px;margin-bottom:24px}h1{font-size:1.6rem;font-weight:600;margin:0 0 8px;color:#EDE4D3}p{color:#B8A88F;margin:0 0 24px;line-height:1.5}small{color:#7A6B58;font-size:.8rem;letter-spacing:.05em}</style></head><body><div class="wrap"><div><svg class="r" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><g transform="translate(0,10)"><path d="M512 180 L442 250 H582 Z" fill="#EDE4D3"/><rect x="440" y="260" width="64" height="64" fill="#3A4D35"/><rect x="520" y="260" width="64" height="64" fill="#E8603C"/><rect x="440" y="340" width="64" height="64" fill="#5E7B5C"/><rect x="520" y="340" width="64" height="64" fill="#A8C491"/><rect x="440" y="420" width="64" height="64" fill="#5E7B5C"/><rect x="520" y="420" width="64" height="64" fill="#A8C491"/><rect x="440" y="500" width="64" height="64" fill="#3A4D35"/><rect x="520" y="500" width="64" height="64" fill="#7A9A6E"/><rect x="440" y="580" width="64" height="64" fill="#7A9A6E"/><rect x="520" y="580" width="64" height="64" fill="#5E7B5C"/><path d="M356 516 L430 590 L430 676 L356 603 Z" fill="#5E7B5C"/><path d="M668 516 L594 590 L594 676 L668 603 Z" fill="#A8C491"/><path d="M512 652 C530 690 550 717 552 757 C537 742 522 746 512 780 C502 746 487 742 472 757 C474 717 494 690 512 652 Z" fill="#E8603C"/></g></svg><h1>You are offline</h1><p>Reconnect to browse the marketplace.</p><small>Auto-retrying every 10s</small></div></div><script>setTimeout(function(){location.reload()},10000)</script></body></html>';

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

// Precache the showcase entry HTMLs so a fresh PWA install can open
// any showcase offline without first having visited it. The list is
// substituted at request time from the build-time-generated
// SHOWCASE_PRECACHE constant. cache.add is best-effort per entry; a
// network or 404 failure on one slug never blocks install.
const SHOWCASE_PRECACHE = __SHOWCASE_PRECACHE__;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(
      SHOWCASE_PRECACHE.map((url) => cache.add(url).catch(() => {})),
    );
    self.skipWaiting();
  })());
});

// Page can postMessage('SKIP_WAITING') to flip to the new SW immediately
// after the user taps "Refresh" on the new-version-available toast.
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING' || (e.data && e.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

// Migrate-then-delete: when a new versioned SW activates, copy entries
// from any prior 'shippie-marketplace-*' cache into the new cache before
// deletion, then delete the old caches. Preserves the user's cached app
// shells across deploys. Safe because the bridge protocol is append-only
// at shippie.bridge.v1 (see lib/container/bridge-handlers.ts) — a stale
// shell can't break against a newer container.
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const newCache = await caches.open(CACHE);
    const oldNames = (await caches.keys()).filter(
      (n) => n !== CACHE && n.startsWith('shippie-marketplace-'),
    );
    for (const name of oldNames) {
      try {
        const old = await caches.open(name);
        const reqs = await old.keys();
        // Parallel migration — sequential put would block activate for
        // seconds on a populated cache. allSettled + per-entry catch
        // keeps activate snappy and survives quota errors per entry.
        await Promise.allSettled(
          reqs.map(async (req) => {
            const hit = await old.match(req);
            if (hit) await newCache.put(req, hit).catch(() => {});
          }),
        );
      } catch {
        /* best effort */
      }
      await caches.delete(name);
    }
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

  // /_app/immutable/* — SvelteKit's hashed JS + CSS chunks. Different
  // deploys produce different hashes (= different URLs), so cache-first
  // is safe: a cached hit always matches its content. Without this
  // handler, iOS PWAs lose JS chunks under storage pressure and pages
  // stop hydrating offline — the page looks like only the boot loader
  // rendered (rocket forever, no marketplace). 504 fallback when cache
  // miss + offline; modern SvelteKit's import-on-demand makes that
  // rare once entry chunks are warm.
  if (url.pathname.startsWith('/_app/immutable/')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // /run/<slug>/* — stale-while-revalidate. Showcase apps the user has
  // opened cache here and continue working offline. Stale-shell-vs-new-
  // container risk is mitigated two ways: (a) cache name carries the
  // deploy version ID so old caches drop on activate, (b) the bridge
  // protocol is append-only at shippie.bridge.v1 (see
  // packages/iframe-sdk and lib/container/bridge-handlers.ts) so a
  // stale shell never breaks against a newer container — it might be
  // missing a new feature, but the existing message shapes still work.
  if (url.pathname.startsWith('/run/')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) {
        // Refresh in background; same defensive pattern as /apps/*.
        fetch(req).then((res) => {
          if (res.ok) cache.put(req, res.clone()).catch(() => {});
        }).catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
        return offlineResponse();
      }
    })());
    return;
  }

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
        if (res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
        return offlineResponse();
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
        if (res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req) || await cache.match('/');
        if (cached) return cached;
        return offlineResponse();
      }
    })());
  }
});
`;

export const GET: RequestHandler = async ({ platform }) => {
  // Stamp the cache name with the deployment version ID so old caches
  // drop on activate when the worker version changes. Falls back to
  // 'dev' locally where the binding doesn't exist; the literal makes
  // every dev session share one cache, which matches dev expectations.
  const buildId =
    (platform?.env as { CF_VERSION_METADATA?: { id?: string } } | undefined)?.CF_VERSION_METADATA?.id ?? 'dev';
  const body = SW_BODY
    .replace(/__SHIPPIE_BUILD__/g, buildId)
    .replace('__SHOWCASE_PRECACHE__', JSON.stringify(SHOWCASE_PRECACHE));
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'service-worker-allowed': '/',
      'cache-control': 'no-store',
    },
  });
};
