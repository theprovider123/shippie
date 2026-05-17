/**
 * GET /__shippie-pwa/sw.js
 *
 * Phase 9.1 — service worker for the marketplace itself. Distinct from
 * /__shippie/sw.js (which serves maker subdomains via the wrapper).
 *
 * Strategy:
 *   - cache-first only for immutable assets and raw showcase bundles
 *   - network-first for app shell documents (never stored in Cache API)
 *   - graceful offline fallback — show "you're offline" branded page
 *
 * Tiny on purpose: under 2KB minified. The browser caches it. Updates
 * land naturally on next visit because the body changes when we deploy.
 */
import type { RequestHandler } from './$types';
import { SHOWCASE_PRECACHE } from '$lib/_generated/precache-list';
import { RUNTIME_PRECACHE } from '$lib/_generated/runtime-precache';
import { AI_RUNTIME_URLS } from '$lib/container/ai-runtime';

const SW_BODY = `// shippie-marketplace SW
const CACHE = 'shippie-marketplace-__SHIPPIE_BUILD__';
const MODEL_CACHE = 'shippie.models.v1';
const APPS_PREFIX = '/apps';
const RUNTIME_PREFIX = '/__shippie-run';
// Phase 2: same-origin /__esm/<pkg> proxy serves the pinned
// Transformers runtime + its transitive graph through our own zone.
// The proxy rewrites every absolute import in the JS bodies back into
// the same /__esm/ namespace, so once we warm the entry URL the rest
// of the closure is also same-origin and cacheable here.
const AI_RUNTIME_URLS = __AI_RUNTIME_URLS__;
const AI_RUNTIME_PATH_PREFIX = '/__esm/';

// Branded offline response — used when network fails and there is no
// usable cached document. Inline rocket + system fonts (no remote font
// fetch when offline) + 10s auto-retry. Beats the prior text/plain
// 503 which iOS Safari sometimes rendered as nothing inside a PWA.
const OFFLINE_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Shippie</title><style>html,body{margin:0;background:#14120F;color:#EDE4D3;height:100%;font-family:system-ui,-apple-system,sans-serif}.wrap{min-height:100vh;display:grid;place-items:center;padding:32px;text-align:center}.r{width:96px;height:96px;margin-bottom:24px}h1{font-size:1.6rem;font-weight:600;margin:0 0 8px;color:#EDE4D3}p{color:#B8A88F;margin:0 0 24px;line-height:1.5}small{color:#7A6B58;font-size:.8rem;letter-spacing:.05em}</style></head><body><div class="wrap"><div><svg class="r" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><g transform="translate(0,10)"><path d="M512 180 L442 250 H582 Z" fill="#EDE4D3"/><rect x="440" y="260" width="64" height="64" fill="#3A4D35"/><rect x="520" y="260" width="64" height="64" fill="#E8603C"/><rect x="440" y="340" width="64" height="64" fill="#5E7B5C"/><rect x="520" y="340" width="64" height="64" fill="#A8C491"/><rect x="440" y="420" width="64" height="64" fill="#5E7B5C"/><rect x="520" y="420" width="64" height="64" fill="#A8C491"/><rect x="440" y="500" width="64" height="64" fill="#3A4D35"/><rect x="520" y="500" width="64" height="64" fill="#7A9A6E"/><rect x="440" y="580" width="64" height="64" fill="#7A9A6E"/><rect x="520" y="580" width="64" height="64" fill="#5E7B5C"/><path d="M356 516 L430 590 L430 676 L356 603 Z" fill="#5E7B5C"/><path d="M668 516 L594 590 L594 676 L668 603 Z" fill="#A8C491"/><path d="M512 652 C530 690 550 717 552 757 C537 742 522 746 512 780 C502 746 487 742 472 757 C474 717 494 690 512 652 Z" fill="#E8603C"/></g></svg><h1>You are offline</h1><p>Reconnect to browse the marketplace.</p><small>Auto-retrying every 10s</small></div></div><script>setTimeout(function(){location.reload()},10000)</script></body></html>';

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    // A PWA navigation should never become the generic SvelteKit 500/503
    // error surface just because the device is briefly offline. This is a
    // real app state, so serve the branded offline shell as a successful
    // document and let it auto-retry.
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function expectedAssetResponse(req, res) {
  if (!res || !res.ok) return false;
  const path = new URL(req.url).pathname;
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (path.endsWith('.js') || path.endsWith('.mjs')) return type.includes('javascript') || type.includes('ecmascript');
  if (path.endsWith('.css')) return type.includes('text/css');
  if (path.endsWith('.wasm')) return type.includes('application/wasm');
  if (path.endsWith('.json')) return type.includes('json');
  if (path.endsWith('.svg')) return type.includes('image/svg');
  return !type.includes('text/html');
}

function expectedRuntimeResponse(req, res) {
  if (!res || !res.ok) return false;
  const url = new URL(req.url);
  const type = (res.headers.get('content-type') || '').toLowerCase();
  const isEntryDocument =
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html') ||
    url.searchParams.get('shippie_embed') === '1';
  if (isEntryDocument) return type.includes('text/html');
  return expectedAssetResponse(req, res);
}

async function purgeShellDocuments(cache) {
  const reqs = await cache.keys();
  await Promise.allSettled(
    reqs.map(async (req) => {
      const path = new URL(req.url).pathname;
      const keep =
        path.startsWith(RUNTIME_PREFIX + '/') ||
        path.startsWith('/_app/immutable/') ||
        path.startsWith('/__shippie/wasm/') ||
        path.startsWith(AI_RUNTIME_PATH_PREFIX) ||
        path === '/__shippie-pwa/.shell-warmed';
      if (!keep) await cache.delete(req);
    }),
  );
}

async function warmAiRuntime(urls = AI_RUNTIME_URLS) {
  if (!Array.isArray(urls) || urls.length === 0) return;
  try {
    const cache = await caches.open(MODEL_CACHE);
    await Promise.allSettled(
      urls.map(async (url) => {
        const cached = await cache.match(url);
        if (cached) return;
        const res = await fetch(url);
        if (expectedAssetResponse(new Request(url), res)) await cache.put(url, res.clone()).catch(() => {});
      }),
    );
  } catch {
    /* best effort — first AI use can still fetch and cache the runtime */
  }
}

// Precache the raw showcase entry HTMLs so a fresh PWA install can open
// any showcase iframe offline without first having visited it. These live
// under /__shippie-run so bare /run/<slug>/ stays the focused shell. The list is
// substituted at request time from the build-time-generated
// SHOWCASE_PRECACHE constant. Caching is best-effort per entry; a network,
// 404, or wrong content-type on one slug never blocks install.
const SHOWCASE_PRECACHE = __SHOWCASE_PRECACHE__;
// Heavy bundled runtimes (Stockfish.wasm, word banks, puzzle PGNs).
// Empty unless an arcade showcase declares shippie.json#runtime_assets.
// Precached at install time — NOT lazy on first fetch — so the
// "100% offline" arcade gate holds up. A first-visit airplane-mode
// open of e.g. Chess will find Stockfish in the cache.
const RUNTIME_PRECACHE = __RUNTIME_PRECACHE__;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cacheAddAll(cache, SHOWCASE_PRECACHE, () => {});
    if (RUNTIME_PRECACHE.length > 0) {
      // Same best-effort path as SHOWCASE_PRECACHE — failures land in
      // the failed[] return value but don't block install. Heavy
      // assets that miss precache will still warm on first request
      // via the existing stale-while-revalidate fetch handler.
      await cacheAddAll(cache, RUNTIME_PRECACHE, () => {});
    }
    await warmAiRuntime();
    self.skipWaiting();
  })());
});

// ── Save-for-offline orchestration ───────────────────────────────────
// The page-side download utility posts MessageChannel-port messages to
// the active SW; the SW does all cache work and reports back via the
// port. This keeps the cache name (which is stamped here from
// CF_VERSION_METADATA) entirely internal — page code never has to guess.

async function cacheAddAll(cache, urls, onProgress) {
  // 3-at-a-time avoids hammering CF rate limits on bulk downloads.
  // Each fetch is best-effort; on failure the URL ends up in failed[].
  let done = 0;
  const total = urls.length;
  const failed = [];
  for (let i = 0; i < urls.length; i += 3) {
    const chunk = urls.slice(i, i + 3);
    await Promise.allSettled(chunk.map(async (url) => {
      try {
        const res = await fetch(url);
        const req = new Request(url);
        const shouldStore = url.startsWith(RUNTIME_PREFIX + '/')
          ? expectedRuntimeResponse(req, res)
          : expectedAssetResponse(req, res);
        if (shouldStore) {
          await cache.put(url, res.clone()).catch(() => {});
        } else {
          failed.push(url);
        }
      } catch {
        failed.push(url);
      } finally {
        done += 1;
        try { onProgress(done, total); } catch { /* progress is best-effort */ }
      }
    }));
  }
  return failed;
}

async function checkManifestComplete(cache, assets) {
  // Verify every URL in the manifest is in the cache. Catches partial
  // downloads where the network failed mid-way; saved-state should
  // never be claimed without this proof.
  let done = 0;
  for (const url of assets) {
    if (await cache.match(url)) done += 1;
  }
  return { complete: done === assets.length, done, total: assets.length };
}

async function warmShell(cache) {
  // First DOWNLOAD_APP per SW activation warms only shared, deploy-safe
  // runtime files. We intentionally do not cache SvelteKit route HTML
  // here: shell documents include current chunk hashes and are the main
  // source of random white screens after a deploy or hard PWA resume.
  const SENTINEL = '/__shippie-pwa/.shell-warmed';
  if (await cache.match(SENTINEL)) return;
  try {
    const res = await fetch('/__shippie-pwa/shell-assets.json');
    if (!res.ok) return;
    const shell = await res.json();
    const urls = [
      ...(Array.isArray(shell.wasm) ? shell.wasm : []),
    ];
    await cacheAddAll(cache, urls, () => {});
    await warmAiRuntime(Array.isArray(shell.aiRuntime) ? shell.aiRuntime : AI_RUNTIME_URLS);
    await cache.put(
      new Request(SENTINEL),
      new Response('1', { headers: { 'content-type': 'text/plain' } }),
    ).catch(() => {});
  } catch {
    /* best effort — shell will warm on next attempt */
  }
}

async function handleDownloadApp(slug, port) {
  try {
    const cache = await caches.open(CACHE);
    const res = await fetch(RUNTIME_PREFIX + '/' + slug + '/__shippie-assets.json');
    if (!res.ok) throw new Error('manifest_fetch_failed_' + res.status);
    const manifest = await res.json();
    const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
    if (assets.length === 0) throw new Error('manifest_empty');
    await warmShell(cache);
    await cacheAddAll(cache, assets, (done, total) => {
      port.postMessage({ type: 'progress', slug, done, total });
    });
    const check = await checkManifestComplete(cache, assets);
    if (check.complete) {
      port.postMessage({ type: 'done', state: 'saved', slug, total: check.total });
    } else {
      port.postMessage({
        type: 'done', state: 'partial', slug,
        done: check.done, total: check.total,
      });
    }
  } catch (err) {
    port.postMessage({ type: 'done', state: 'error', slug, error: String(err && err.message || err) });
  }
}

async function handleRemoveApp(slug, port) {
  try {
    const cache = await caches.open(CACHE);
    const reqs = await cache.keys();
    const runtimePrefix = RUNTIME_PREFIX + '/' + slug + '/';
    const shellPrefix = '/run/' + slug + '/';
    let count = 0;
    for (const req of reqs) {
      const path = new URL(req.url).pathname;
      if (path.startsWith(runtimePrefix) || path.startsWith(shellPrefix)) {
        await cache.delete(req);
        count += 1;
      }
    }
    port.postMessage({ type: 'done', state: 'removed', slug, count });
  } catch (err) {
    port.postMessage({ type: 'done', state: 'error', slug, error: String(err && err.message || err) });
  }
}

async function handleGetStatus(slug, port) {
  try {
    const cache = await caches.open(CACHE);
    const res = await fetch(RUNTIME_PREFIX + '/' + slug + '/__shippie-assets.json');
    if (!res.ok) {
      port.postMessage({ type: 'status', slug, state: 'idle', done: 0, total: 0 });
      return;
    }
    const manifest = await res.json();
    const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
    const check = await checkManifestComplete(cache, assets);
    let state = 'idle';
    if (check.done === check.total && check.total > 0) state = 'saved';
    else if (check.done > 0) state = 'partial';
    port.postMessage({
      type: 'status', slug, state,
      done: check.done, total: check.total,
    });
  } catch {
    port.postMessage({ type: 'status', slug, state: 'idle', done: 0, total: 0 });
  }
}

async function handleClearOffline(port) {
  // Delete user-saved app bundles only. Keep deploy-safe platform assets:
  // /_app/immutable/* (chunks), /__shippie/wasm/* (shared WASM),
  // /__shippie-pwa/* (sentinel + shell-assets manifest).
  try {
    const cache = await caches.open(CACHE);
    const reqs = await cache.keys();
    let count = 0;
    for (const req of reqs) {
      const path = new URL(req.url).pathname;
      if (path.startsWith(RUNTIME_PREFIX + '/')) {
        await cache.delete(req);
        count += 1;
      }
    }
    port.postMessage({ type: 'done', state: 'cleared', count });
  } catch (err) {
    port.postMessage({ type: 'done', state: 'error', error: String(err && err.message || err) });
  }
}

self.addEventListener('message', (e) => {
  // Existing skip-waiting trigger (page → SW after user taps "Refresh"
  // on the new-version-available toast).
  if (e.data === 'SKIP_WAITING' || (e.data && e.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
    return;
  }
  // Version probe — the page asks the WAITING worker for its build id
  // so the SwUpdateToast can use that as the suppression key for
  // "skip this version" (instead of a 24h timestamp, which would
  // suppress unrelated future updates). Replies via the MessageChannel
  // port if provided; otherwise via the message source.
  if (e.data && e.data.t === 'version') {
    const port = e.ports && e.ports[0];
    const reply = { versionId: '__SHIPPIE_BUILD__' };
    if (port) port.postMessage(reply);
    else if (e.source && 'postMessage' in e.source) e.source.postMessage(reply);
    return;
  }
  // Save-for-offline messages always carry a MessageChannel port so
  // the SW can stream progress + a final state.
  const port = e.ports && e.ports[0];
  if (!port) return;
  const msg = e.data || {};
  if (msg.type === 'DOWNLOAD_APP' && typeof msg.slug === 'string') {
    handleDownloadApp(msg.slug, port);
  } else if (msg.type === 'REMOVE_APP' && typeof msg.slug === 'string') {
    handleRemoveApp(msg.slug, port);
  } else if (msg.type === 'GET_APP_STATUS' && typeof msg.slug === 'string') {
    handleGetStatus(msg.slug, port);
  } else if (msg.type === 'CLEAR_OFFLINE') {
    handleClearOffline(port);
  } else {
    port.postMessage({ type: 'done', state: 'error', error: 'unknown_message' });
  }
});

// Migrate-then-delete: when a new versioned SW activates, copy ONLY
// content-addressed entries (/_app/immutable/* and /__shippie-run/* assets) from any
// prior 'shippie-marketplace-*' cache into the new cache, then delete
// the old caches.
//
// Why selective: platform HTML pages (/, /apps, /apps/<slug>) reference
// the current deploy's chunk hashes inside their <script> tags. After a
// deploy, those hashes change. A migrated stale HTML page references
// hashes that 404 on the server — SvelteKit's client tries to load
// them, fails, and +error.svelte fires ("Something went wrong" while
// browsing).
//
// /__shippie-run/<slug>/?shippie_embed=1 and nested app assets are
// self-consistent — the showcase HTML and its hashed chunks build together,
// so caching the bundle is safe across platform deploys. The bare /run/<slug>/
// route is platform shell HTML and must not migrate across deploys.
//
// Stale platform HTML is never warmed or migrated. If a prior worker
// already cached it under the current cache name, purge it on activation.
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
        await Promise.allSettled(
          reqs.map(async (req) => {
            const path = new URL(req.url).pathname;
            const safeToMigrate =
              path.startsWith(RUNTIME_PREFIX + '/') ||
              path.startsWith('/_app/immutable/') ||
              path.startsWith('/__shippie/wasm/');
            if (!safeToMigrate) return;
            const hit = await old.match(req);
            if (hit) await newCache.put(req, hit).catch(() => {});
          }),
        );
      } catch {
        /* best effort */
      }
      await caches.delete(name);
    }
    await purgeShellDocuments(newCache);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // AI runtime — same-origin /__esm/* proxy. Cache-first against the
  // dedicated MODEL_CACHE because the proxy serves immutable artifacts
  // (pinned versions, content-addressed transitive paths) and this
  // cache survives platform deploys via its separate name. Covers both
  // the entry URLs from AI_RUNTIME_URLS and any rewritten transitive
  // import the runtime pulls in at parse time.
  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith(AI_RUNTIME_PATH_PREFIX)
  ) {
    e.respondWith((async () => {
      const cache = await caches.open(MODEL_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (expectedAssetResponse(req, res)) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

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
        if (expectedAssetResponse(req, res)) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // /__shippie-run/<slug>/* — stale-while-revalidate for raw showcase
  // runtime assets. These are content-addressed by the showcase build and
  // are safe to keep offline across platform shell deploys.
  if (url.pathname.startsWith(RUNTIME_PREFIX + '/')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) {
        // Refresh in background. Only keep complete app package entries
        // or typed assets, never accidental HTML error documents.
        fetch(req).then((res) => {
          if (expectedRuntimeResponse(req, res)) cache.put(req, res.clone()).catch(() => {});
        }).catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (expectedRuntimeResponse(req, res)) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
        const nestedMatch = url.pathname.match(/^\\/__shippie-run\\/([^/]+)\\/.+/);
        if (nestedMatch) {
          const entry =
            (await cache.match(RUNTIME_PREFIX + '/' + nestedMatch[1] + '/?shippie_embed=1')) ||
            (await cache.match(RUNTIME_PREFIX + '/' + nestedMatch[1] + '/index.html')) ||
            (await cache.match(RUNTIME_PREFIX + '/' + nestedMatch[1] + '/'));
          if (entry) return entry;
        }
        return offlineResponse();
      }
    })());
    return;
  }

  // /run/<slug>/ — public focused shell. Network-only for route HTML so
  // hashed SvelteKit chunks stay fresh; offline gets the branded shell
  // instead of a stale route document.
  if (url.pathname.startsWith('/run/')) {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        return offlineResponse();
      }
    })());
    return;
  }

  if (url.pathname.startsWith(APPS_PREFIX)) {
    // Legacy marketplace route. Route HTML is network-only; app assets
    // are handled by the immutable/runtime branches above.
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        return offlineResponse();
      }
    })());
    return;
  }

  // Network-first elsewhere for route documents. Do not cache these in
  // Cache API; SvelteKit HTML is deploy-coupled to current chunk hashes.
  const isDoc = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isDoc) {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
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
    .replace('__AI_RUNTIME_URLS__', JSON.stringify(AI_RUNTIME_URLS))
    .replace('__SHOWCASE_PRECACHE__', JSON.stringify(SHOWCASE_PRECACHE))
    .replace('__RUNTIME_PRECACHE__', JSON.stringify(RUNTIME_PRECACHE));
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'service-worker-allowed': '/',
      'cache-control': 'no-store',
    },
  });
};
