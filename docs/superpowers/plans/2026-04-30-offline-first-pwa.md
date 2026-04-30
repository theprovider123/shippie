# 2026-04-30 — Offline-first PWA: browse + use apps without a connection

> Once Shippie is installed, the user should be able to open it on a plane,
> browse the marketplace, and use any app they've already opened — all
> without a connection. Apps they've never opened still need a one-time
> download. That's the bar.

---

## Context

The user reports: *"Right now it feels like the Shippie PWA only works whilst being online let alone using any of the apps. They should all work locally/offline right as long as Shippie PWA has been installed once?"*

Verified against HEAD — they're correct. Three current gaps:

1. **The marketplace SW skips `/run/*` entirely.** Line 72 of `apps/platform/src/routes/__shippie-pwa/sw.js/+server.ts` returns immediately if the path starts with `/run/`. Reason: commit `8256eca` added this skip to avoid serving a stale shell with a different bridge protocol. Side effect: the 22 showcase apps **never** cache. Going offline → none of them work, even ones the user has used before.
2. **No precache.** The SW's `install` event calls `skipWaiting()` and stops. No `cache.addAll()` to warm the cache with showcase shells, the container, or the marketplace index.
3. **Marketplace data is SSR'd inline, not API-driven.** The `/` and `/apps` routes call `browsePublic` / `searchPublic` against D1 directly inside `+page.server.ts`. The discussion above mentioned a `/api/marketplace` endpoint to cache — that endpoint doesn't exist. Cache must work at the navigation level (cached HTML page with listing data already embedded), not at an API level.

What works today:
- Container shell (SvelteKit's hashed `/_app/immutable/*` chunks) gets cached by the browser's HTTP cache via long-lived headers — works fine on second visit even with a basic SW.
- AI models cache on demand at ~225 MB q8 budget with LRU eviction (`ai-cache-budget.ts` already shipped).
- Local-first data layer (wa-sqlite + OPFS) already runs offline by design.

The intended outcome: **after a single online session of Shippie, the user can use the platform fully offline** — open it, browse the marketplace (showing a "cached at: <time>" indicator), open any showcase app, use any AI feature they've already triggered, and access all their local data. Only first-time access to a showcase or a maker app needs connectivity.

---

## Verified ground truth (against HEAD on 2026-04-30)

| Claim from the discussion | Reality |
|---|---|
| "8 showcase apps" | 22 showcase apps in `apps/showcase-*` and `static/run/` |
| "4–8 MB for 8 apps" | **16 MB total** for 22 apps (avg ~720 KB per app, biggest: whiteboard 3.6 MB, mevrouw 2.6 MB) |
| "Service worker should pre-cache showcase apps" | Currently does not — `install` only calls `skipWaiting()` |
| "SW caches `/run/*` cache-first" | **Currently SKIPS** `/run/*` entirely (sw.js:72). Added in commit `8256eca` to avoid stale-shell race. Trade-off needs revisiting. |
| "Cache the marketplace API endpoint" | No such endpoint — `/` and `/apps` are SSR routes calling D1 directly. Cache the navigation, not the API. |
| "5 micro-models, ~500 MB total" | 6 models, **~225 MB q8** (already shipped); 800 MB at full precision. q8 is default. |
| "AI models cache on first use, persist forever" | Correct — `ai-cache-budget.ts` shipped this with LRU eviction on quota error. |
| "100 % of opened apps work offline" | Not true today — `/run/*` skip means shells aren't cached, even after first open. |

---

## Cross-cutting prerequisites (resolve before commit 1)

Two architectural calls + one config tweak that gate the whole plan. ~20 minutes total.

### Per-app service workers — delete

Three of the 22 showcases ship their own service worker:
- `apps/platform/static/run/recipe/sw.js` (cache name: `recipe-saver-v1`)
- `apps/platform/static/run/journal/sw.js`
- `apps/platform/static/run/whiteboard/sw.js`

Each is registered by the showcase's own `src/main.tsx`:
```js
navigator.serviceWorker.register('/sw.js').catch(() => {})
```

**Today on shippie.app:** the absolute path `/sw.js` resolves to `https://shippie.app/sw.js`, which 404s. The registration silently fails, the per-app SW never activates. So they're effectively dead code on shippie.app today.

**On maker subdomains** (e.g., `recipe.shippie.app`): the wrapper-injected runtime SW lives at `/__shippie/sw.js` per the file's own comment. The per-app `/sw.js` would conflict if it ever did register.

**Decision: delete all three** plus the three matching `register('/sw.js')` lines in `apps/showcase-{recipe,journal,whiteboard}/src/main.tsx`. Removes an entire class of dual-SW reasoning. Maker-subdomain offline behaviour stays governed by the wrapper-injected SW (separate concern, not in this plan's scope). Lands as **commit 0** before the rest of P0.

### Bridge-protocol stability — commit to append-only at v1

The original `8256eca` SW skip existed to avoid serving "an old shell with an incompatible bridge protocol." Versioning the cache name (P0.2) handles deploys that change assets, but it doesn't help users on the old SW between deploy and update-banner-tap whose stale shell talks to a different bridge version.

Verified in the showcase bundle: bridge messages already carry a `protocol: 'shippie.bridge.v1'` field on every envelope. That's a forward-compat hook waiting to be used.

**Stance:** the `shippie.bridge.v1` protocol is **append-only**. New capabilities and methods may be added without breaking existing message shapes. Breaking changes bump to `shippie.bridge.v2` with explicit coexistence — both versions stay valid in the container handlers for at least one full release cycle.

Practical consequence: a stale shell never breaks. It might be missing a new feature, but it talks to the container fine. This is the correct local-first guarantee — the user's installed app keeps working even after the platform deploys.

**Document the stance in:**
- `packages/iframe-sdk/README.md` (API contract page).
- The header comment of `apps/platform/src/lib/container/bridge-handlers.ts`.
- This plan (here).

If a future change genuinely requires breaking v1, the `shippie.bridge.v2` migration becomes a deliberate decision with explicit container-side compat code — not a silent regression.

### Confirm `CF_VERSION_METADATA` binding

Verified `apps/platform/wrangler.toml`: **no `[version_metadata]` block today.** P0.2 reads `platform?.env?.CF_VERSION_METADATA?.id` to stamp the cache name; without the binding it falls back to the `'dev'` literal silently, defeating the versioning.

Add this block to `apps/platform/wrangler.toml`:
```toml
[version_metadata]
binding = "CF_VERSION_METADATA"
```

Cloudflare populates `env.CF_VERSION_METADATA.id` automatically with the deployment version ID after this binding exists. No extra config.

---

## Approach — four phases, ship in order

### P0 — Cache showcase apps on first open + on PWA install (~3 hours)

**The single biggest unlock.** Today, opening Recipe Saver while offline fails because the SW returns nothing for `/run/recipe/*`. After P0, every showcase the user has opened works offline forever, and on a fresh PWA install the SW pre-caches all 22 in the background.

**P0.1 — Replace `/run/*` skip with stale-while-revalidate (~60 min).**

Today's behaviour at `sw.js/+server.ts:69–72`:
```js
// Skip /run/<slug>/ — these are 302 redirects into focused-mode...
if (url.pathname.startsWith('/run/')) return;
```

Replace with stale-while-revalidate: serve cached instantly when present, fetch in background to keep the cache fresh, fall back to network on cache miss. Stale-shell race is resolved by versioning the cache name with a build hash (P0.2 below) — old caches drop on activate when the SW updates.

```js
if (url.pathname.startsWith('/run/')) {
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) {
      // Refresh in background; same pattern as /apps/*.
      fetch(req).then((res) => { if (res.ok) cache.put(req, res).catch(() => {}); }).catch(() => {});
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
```

**P0.2 — Version the cache name (~30 min).**

The current cache name is the static string `'shippie-marketplace-v1'`. After a deploy, the new SW activates but the cache name is the same — old entries persist.

Stamp the cache name with the SDK bundle hash that's already uploaded by `scripts/upload-sdk-bundle.mjs`. The deploy script can pass this hash through to the SW route as a build-time environment variable, or simpler: read the timestamp/hash that already lives on the uploaded SDK at `https://shippie.app/sdk/v1.latest.js` and embed it into the SW body via `RequestHandler`.

```ts
// In sw.js/+server.ts — RequestHandler runs at build time effectively
// (the response is no-store but generated on each Worker invocation,
// which means the cache name reflects the current Worker version).
export const GET: RequestHandler = async ({ platform }) => {
  const buildId = platform?.env?.CF_VERSION_METADATA?.id ?? 'dev';
  const body = SW_BODY.replace('__SHIPPIE_BUILD__', buildId);
  return new Response(body, { ... });
};
```

The SW body uses `'shippie-marketplace-__SHIPPIE_BUILD__'` as the cache name. On deploy, the Worker version changes, the SW body changes, the browser registers an update, the existing PWA-update-banner fires, the user taps refresh, the new SW activates with a new cache name, the old cache is purged (the existing `activate` handler at line 33 already deletes any cache name not matching the current). Stale-shell race solved without skipping.

**P0.3 — Precache the 22 showcase shells on `install` (~60 min).**

Extend `apps/platform/scripts/prepare-showcases.mjs` to emit a manifest of showcase entry points. The script already iterates `apps/showcase-*`; add a final step that writes `apps/platform/src/lib/_generated/precache-list.ts`:

```ts
export const SHOWCASE_PRECACHE = [
  '/run/recipe/', '/run/recipe/index.html',
  '/run/journal/', '/run/journal/index.html',
  // ... 22 entries
];
```

Then in `sw.js/+server.ts`, the SW body imports the list (via the same `__PRECACHE_LIST__` substitution pattern as P0.2 or via inlining) and on `install` calls:

```js
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Precache only the entry HTML for each showcase; assets cache
    // on first request (they're hashed under each /run/<slug>/_app/).
    await Promise.allSettled(SHOWCASE_PRECACHE.map((url) =>
      cache.add(url).catch(() => {}) // best-effort; never block install
    ));
    self.skipWaiting();
  })());
});
```

Total precache: 22 × index.html ≈ a few KB. Fingerprinted asset bundles cache on first subsequent fetch via the stale-while-revalidate handler from P0.1. **The 16 MB of total assets does NOT all download on install** — only the 22 entry HTML files. Each app's CSS/JS is fetched and cached when the user actually opens that app (or browses past it).

**P0.4 — Playwright SW tests (~60 min, commits as part of P0.3).**

Vitest at the SW level is the wrong tool — Worker globals (`self`, `caches`, `clients`) aren't available in jsdom and stubbing them fully duplicates the production behaviour anyway. Playwright runs a real browser and gives access to `caches.keys()` / `caches.match()` from the page context. **Commit:** add Playwright tests, even if `tools/recording/` doesn't yet have a runner — adding it is part of P0 and keeps paying back.

Three tests in `apps/platform/tests/sw-offline.spec.ts` (new, with `playwright.config.ts` if not present):

1. **Install precache:** load `https://shippie.app/`, wait for SW activation, assert all 22 `/run/<slug>/` entry HTMLs are in `caches.match()`.
2. **Cache invalidation across deploy:** set up two SW bodies with different `__SHIPPIE_BUILD__` values (mock the registration URL), trigger update, assert old cache is deleted on activate, new cache is fresh.
3. **Offline serve:** load `/`, then `context.setOffline(true)`, navigate to `/run/recipe/`, assert response comes from cache (no network call).

If the harness becomes a meaningful surface, fold related smoke tests into it (offline banner, error boundary, PWA install). Don't ship the offline plan with manual-only SW verification — SW caching is exactly where regressions are silent.

**Files (P0):**
- `apps/platform/src/routes/__shippie-pwa/sw.js/+server.ts` — replace `/run/*` skip, version cache name, add install precache.
- `apps/platform/scripts/prepare-showcases.mjs` — emit `_generated/precache-list.ts`.
- `apps/platform/src/lib/_generated/precache-list.ts` — generated, gitignored (already in the gitignore pattern).
- `apps/platform/.gitignore` — already covers `src/lib/_generated/`.

### P1 — Marketplace browse offline (~1.5 hours)

After P0, the user has app shells. They still need the marketplace listing to browse offline.

The homepage (`/`) and marketplace (`/apps`) are SvelteKit routes that SSR with embedded data. The SW's existing network-first navigation handler (line 86–104 of sw.js/+server.ts) caches navigations and falls back to the cached `/` on offline. Today this works for whichever pages the user has navigated to.

**P1.1 — Strengthen marketplace cache (~30 min).**

Two refinements:
- After serving from network, cache the response with a `Date` header (already there from CF). Small, plays nicely with the existing strategy.
- On the offline cache fallback path (line 96), the cascade today is `match(req) || match('/')`. Add `match('/apps')` between them — explicit ordering: `match(req) || match('/apps') || match('/')`. Deep-links to `/apps?kind=local` fall back to the cached `/apps` first (closer match), then to `/` as the last resort.

**P1.2 — "Cached at <time>" banner when offline (~60 min).**

When the user is browsing offline and the page came from cache, surface a tiny info bar: *"You're viewing a cached marketplace from 4 minutes ago — connect to refresh."* Pure CSS + a `navigator.onLine` check + the SW's `Date` header (read via a small inline script on the page).

**Files (P1):**
- `apps/platform/src/routes/__shippie-pwa/sw.js/+server.ts` — third-tier cache fallback.
- `apps/platform/src/routes/+layout.svelte` (or a new `OfflineBanner.svelte` mounted in the layout) — render the cached-at indicator when `!navigator.onLine`.

### P2 — Per-card offline status indicators (~1.5 hours)

Once apps cache on open, surface that fact. The marketplace cards should show whether each showcase is offline-ready.

**P2.1 — Detect cached state per slug (~45 min).**

Client-side helper that checks `caches.match('/run/<slug>/index.html')` for each card. Runs after hydration on `/apps`; updates a Svelte store with `cachedSlugs: Set<string>`.

**P2.2 — Render an offline badge on AppCard (~30 min).**

Tiny indicator in the existing `AppCard.svelte`:
- Cached: `🟢 Offline-ready` (sage)
- Not cached: `↓ Needs first download` (subtle, only when fully offline)

When online, the badge shows on cached apps as a positive signal. When offline, the not-cached badge changes to `Currently unavailable` with a slightly muted treatment.

**P2.3 — Offline-only filter (~15 min).**

A toggle on `/apps`: *"Show only offline-ready apps."* When enabled, filters the grid client-side to `cachedSlugs`. Helpful when actually offline.

**Files (P2):**
- `apps/platform/src/lib/stores/cached-slugs.ts` (new) — Svelte writable + populate function.
- `apps/platform/src/lib/components/marketplace/AppCard.svelte` — render badge.
- `apps/platform/src/routes/apps/+page.svelte` — wire the filter toggle.

### P3 — AI model pre-cache opt-in (~30 min, deferred)

The discussion mentioned pre-downloading AI models on install. Don't do this by default — 225 MB q8 is too much for cellular users. Add a single toggle in settings:

- **"Pre-download AI models for offline use (~225 MB on Wi-Fi)"** — off by default. When enabled, the AI worker prefetches all 6 models in the background. Reuses existing `ai-cache-budget.ts` LRU eviction.

The container already lazy-loads models on first AI call and caches them. The user already gets full offline AI for any task they've triggered once. The opt-in just shifts the work earlier for users who plan to be offline.

**File:** new settings tile or extend an existing settings page (need to grep — defer location-finding to implementation time).

---

## What stays online (the honest limit)

After P0 + P1 + P2 land, here's what still needs connectivity:

1. **First-time install of a NEW maker app from R2.** A maker subdomain like `cookbook.shippie.app` that the user has never opened isn't in the cache and isn't in the precache list. First open requires network. Subsequent opens cache via the wrapper's own SW (`apps/platform/src/routes/__shippie/sw.js/+server.ts` — separate from the marketplace SW).
2. **Auth flows.** Login, OAuth callbacks. The SW already skips `/auth/*` (line 52).
3. **Marketplace search server-side.** FTS goes to D1. Offline → cached page only, no live search. Could fall back to in-memory filtering of the cached listing as a P3 polish.
4. **Push send.** VAPID send is server-side; subscribe is client-side. Receiving notifications still works offline (the OS handles push delivery).
5. **Live Room signalling for unconnected peers.** WebRTC over Cloudflare Durable Objects needs network. Once connected, peer-to-peer can survive offline-ish conditions but the initial signal goes through `SignalRoom`.
6. **Deploy + dashboard.** Maker tools require connectivity.

The Spark phone-to-phone propagation roadmap (whitepaper § Connect) is the future answer for #1 — a nearby phone shares the app via Bluetooth/local hotspot. Deferred per CLAUDE.md "Phase 6 stays deferred."

---

## Cache budget and trade-offs

| Layer | Size | When | Strategy |
|---|---|---|---|
| Container shell (`/_app/immutable/*`) | ~2 MB | First nav, cached via HTTP `immutable` headers + SW network-first nav | (already works) |
| 22 showcase entry HTMLs | ~50 KB | SW `install` precache | `cache.addAll` |
| 22 showcase asset bundles | 16 MB total, ~720 KB avg | On first visit to each | stale-while-revalidate |
| Marketplace `/` and `/apps` cached HTML | ~30 KB | First nav | network-first nav |
| AI models (6 × q8) | 225 MB | On first AI call per task | ai-cache-budget.ts LRU |
| Per-app local DB (wa-sqlite + OPFS) | varies, user-driven | On data write | (always local) |

**Worst case after one online session:** ~16 MB platform cache + whatever AI models the user has triggered + their own data. iOS Safari's Cache Storage quota is typically generous (50 MB+) but enforces eviction under storage pressure — the LRU pattern in `ai-cache-budget.ts` already handles that for models; the SW's existing `cache.put().catch()` (added in the recent SW commit) handles it for app shells.

**Worst case if AI pre-cache opt-in is enabled:** ~240 MB. Fine on Wi-Fi; offered as an opt-in.

---

## Cross-cutting: deploy invalidation

The biggest design decision is how cached app shells stay in sync with deploys. Options considered:

| Option | Pro | Con |
|---|---|---|
| Skip `/run/*` (today's behaviour) | No staleness | No offline. Defeats the whole goal. |
| Stale-while-revalidate + versioned cache name | Offline works; deploys land on next online visit | First post-deploy visit shows old shell briefly |
| Cache-first + manual cache-bust on update banner | Offline works; explicit refresh | Needs a build-version-stamp mechanism in the SW |

**Decision: stale-while-revalidate + versioned cache name (P0.1 + P0.2).** The PWA-update-banner already shipped (commit `25575b2`) handles the "new version available — tap to refresh" UX. After tapping, the new SW activates, the old cache is purged, the new cache starts populating. Users on the old SW continue to see the old shell until they update, which is the correct local-first behaviour.

---

## Critical files

**Changed:**
- `apps/platform/src/routes/__shippie-pwa/sw.js/+server.ts` — P0.1 (`/run/*` strategy), P0.2 (versioned cache name), P0.3 (precache on install), P1.1 (third-tier nav fallback).
- `apps/platform/scripts/prepare-showcases.mjs` — P0.3 (emit precache list).
- `apps/platform/src/routes/+layout.svelte` — P1.2 (offline banner).
- `apps/platform/src/lib/components/marketplace/AppCard.svelte` — P2.2 (offline badge).
- `apps/platform/src/routes/apps/+page.svelte` — P2.3 (offline-only filter).

**New:**
- `apps/platform/src/lib/_generated/precache-list.ts` — generated, gitignored.
- `apps/platform/src/lib/stores/cached-slugs.ts` — P2.1 (cached-slug store).
- `apps/platform/src/lib/components/ui/OfflineBanner.svelte` — P1.2 (banner).

**Reused:**
- Existing `ai-cache-budget.ts` (P3 hooks into the same LRU).
- Existing PWA-update-banner from `25575b2` (handles deploy invalidation UX).
- Existing `cache.put().catch(() => {})` hardening from `e78ba7c`.

---

## Verification

1. **Cold-install offline test.** Fresh browser context → install Shippie PWA → close → put device in airplane mode → reopen. Expected: container loads from cache, `/apps` shows the marketplace from cache (with offline banner), all 22 showcase cards show `🟢 Offline-ready`. Tap any showcase → shell loads from cache → assets cache on first network attempt (will error gracefully offline, but if the user opened that app previously online the assets are cached too).
2. **First-open while offline test.** With airplane mode on, tap a showcase that was pre-cached but never opened. Expected: the entry HTML loads (it's precached), the iframe srcdoc/runtime falls back to whatever assets are in the cache. May still fail for some assets if not yet fetched — that's the honest limit. The graceful behaviour is the new branded offline page from `e78ba7c`.
3. **Deploy invalidation test.** Open the PWA, browse around (cache populates). Push a deploy. Reopen the PWA online. Expected: PWA-update-banner from `25575b2` fires; tap "refresh" → new SW activates → old cache purged → new cache starts. Browse to a previously-cached showcase → fresh shell from network on the first hit, cached on second.
4. **Cache name versioning test.** `wrangler tail --format pretty` during a deploy, then open the PWA. Expected: the SW body returned from `/__shippie-pwa/sw.js` contains the new build ID; `caches.keys()` in DevTools shows the new cache name; old caches drop on `activate`.
5. **Pre-cache list freshness test.** Edit `apps/showcase-recipe/shippie.json` slug. Run either `bun run --filter @shippie/platform prepare:showcases` (just the regen step) or `bun run --filter @shippie/platform build` (full build chain — `prepare-showcases` runs first per `package.json:10`). Expected: regenerated `_generated/precache-list.ts` reflects the new slug. Old slug doesn't appear.
6. **Bandwidth budget test.** Install on a fresh device with DevTools Network throttled to "Slow 3G". Measure total bytes pulled during install + first browse. Expected: ≤2 MB initial (container + precache list of 22 HTMLs); 16 MB is the long-tail ceiling after opening every showcase.
7. **AI offline test.** Use any AI feature once online (downloads model). Disconnect. Re-trigger same task. Expected: `source: 'local'`, no network. Already works today; this plan doesn't change AI cache behaviour.
8. **`bun run health`** — expect green at every commit boundary. Add Playwright test for the SW install flow if the recording harness exists; otherwise manual.

---

## Commit-split

Eight commits including the prerequisite cleanup and config. P3 deferred entirely.

0. `chore(showcases): delete dead per-app service workers + registrations` — pre-req. Removes `static/run/{recipe,journal,whiteboard}/sw.js` (regenerated by `prepare-showcases.mjs` from the source dist) AND the `register('/sw.js')` call from each showcase's `src/main.tsx`. After this, only the marketplace SW exists on shippie.app.
1. `chore(wrangler): add CF_VERSION_METADATA binding` — pre-req. Adds the `[version_metadata]` block to `apps/platform/wrangler.toml`. Required for P0.2's cache versioning to actually work; without it the binding falls back to `'dev'` silently.
2. `feat(sw): version cache name with deploy build id` — P0.2. Reads `CF_VERSION_METADATA.id` in the SW's `RequestHandler` and stamps the cache name. Breaks nothing on its own — old cache name still works during transition.
3. `feat(sw): stale-while-revalidate /run/<slug>/* with offline fallback` — P0.1. Reverts the `/run/*` skip, replaces with the new strategy. Now any showcase the user opens caches. Document the bridge-protocol-append-only stance in `bridge-handlers.ts` header in this commit.
4. `feat(sw): precache showcase entry HTMLs on install + Playwright tests` — P0.3 + P0.4. Extends `prepare-showcases.mjs`, generates `_generated/precache-list.ts`, wires SW install hook, adds `tests/sw-offline.spec.ts` covering install precache + invalidation + offline serve.
5. `feat(marketplace): offline banner + cached-from indicator` — P1.1 + P1.2. The user sees that they're on a cached page when offline.
6. `feat(marketplace): per-card offline-ready badge` — P2.1 + P2.2. Cards visibly indicate cached state.
7. `feat(marketplace): offline-only filter toggle` — P2.3. Quick way to find usable apps when actually offline.

P0 (commits 0–4) is the minimum to claim "showcase apps work offline once installed." Stop after commit 4, run the cold-install airplane-mode test from verification step 1, then decide whether P1 + P2 ship in the same session or a follow-up. P1 (commit 5) closes the marketplace browse story. P2 (commits 6–7) is the polish that makes offline state visible.

Realistic time: pre-reqs ≈ 30min, P0 ≈ 3.5h, P1 ≈ 1.5h, P2 ≈ 1.5h, total ≈ 7h.

---

## Honest limits to communicate to the user

The whitepaper-grade pitch:

> "Once Shippie is installed, the marketplace and all 22 showcase apps work offline. You can use any app you've opened before — UI from cache, data from your phone's local SQLite, AI from the model cache. Brand-new maker apps from the marketplace need a one-time download. The Spark phone-to-phone propagation roadmap will close that gap; today, the honest limit is 'install once online, then offline forever.' That's still dramatically better than every cloud platform."

---

## What this looks like for the user

> "I'm on a flight with no Wi-Fi. I tap Shippie. The marketplace loads instantly with a small banner saying 'cached 22 minutes ago.' I see 22 showcase apps with green 🟢 dots — all offline-ready. I tap Recipe Saver. It opens immediately, my recipes are right there, the AI suggests meals. I add a recipe, it saves locally. The plane lands; I open Shippie again on Wi-Fi; the green-banner disappears, the marketplace updates in the background, my new recipe waits for the next sync. The whole thing feels like I never lost anything."
