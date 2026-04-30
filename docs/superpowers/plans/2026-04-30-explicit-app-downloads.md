# 2026-04-30 — Explicit "Download for offline" button per app

> Today: opening a showcase app online caches its assets implicitly via the
> SW's stale-while-revalidate handler. Apps the user has never opened are
> broken offline (entry HTML precached, but assets aren't). The user
> shouldn't have to "open every app once" to make the marketplace usable
> offline. Make it explicit.

---

## Context

The user's framing: *"perhaps we need a download button that fully caches apps and makes them usable offline. Apps are always local (online or offline). When the phone is offline we need a user to be able to access apps still."*

The framing is correct and matches Shippie's local-first ethos. The gap today is real:

- **Today's offline state:** Of the 22 showcase apps in the marketplace, the SW precaches **only the entry HTMLs** (~50KB). Per-app JS/CSS/WASM bundles cache **only after the user opens the app once online** via stale-while-revalidate. A user who installs Shippie, browses the marketplace, then goes offline can only use apps they happened to tap online. Every other app is half-broken (HTML loads, JS fails).
- **Today's UX:** No visible state per card. The user can't tell which apps are offline-ready vs which need a network round-trip. They discover this by tapping and watching things break.
- **Today's mental model:** Closer to "websites" than "apps" — implicit caching, no user agency over storage.

Shippie's promise is "wrap any web app, install it, run it on your device." The "install" step today is essentially **just** the PWA shell + the platform marketplace. The 22 showcase apps inside the marketplace are *not* installed in any meaningful local sense until the user opens each one. That's the gap to close.

The intended outcome: **a user installs Shippie, taps "Save for offline" on the apps they want, and those apps work fully offline forever** — the data is already always-local (OPFS/wa-sqlite), the UI now is too. Storage is visible. Removal is one tap.

---

## Reviewing the proposed approach

### What "download" means technically

The static showcase tree at `apps/platform/static/run/` is **12 MB total** today across 22 showcases (verified with `du -sh`; a handful are big — journal/whiteboard/recipe/live-room ~2 MB each — most are <500 KB). The plan references "measured at build time" and not hardcoded numbers since this fluctuates per deploy and per showcase add.

Each showcase ships: `index.html` + `manifest.webmanifest` + `icon.{svg,png}` + `assets/*.{js,css,wasm}`.

To "fully download" an app means: fetch every asset under `/run/<slug>/*` once, store it in the SW cache, and from then on the app loads from cache. **Plus** the platform shell that the user navigates through to reach the app — see "Platform shell coverage" below.

### Why an explicit button is the right call

1. **User agency over bandwidth.** ~12 MB across 22 apps today is small but non-zero on cellular, and per-showcase ranges from 200 KB to 2 MB (the heavy ones bundle real-time/Yjs/CRDT). Auto-download-all on PWA install would burn data without consent.
2. **User agency over storage.** iOS Safari's Cache Storage quota is generous but not infinite, and PWAs share it with maker apps. Letting the user pick which apps stay resident is the right ergonomic.
3. **Explicit > implicit.** Today's "open once to cache" is a hidden mechanic. Surfacing it ("Save for offline" → "Saved ✓") matches the user's mental model and removes the surprise of "I went offline and Pomodoro doesn't work."
4. **Confidence.** A user about to fly should be able to tap one button and know the apps they'll need are ready. Today, they have to remember to pre-open each one.

### Why NOT auto-download-everything-on-install

- Cellular bandwidth burn (~12 MB silent download on first visit; measured at build time, not hardcoded)
- Storage pressure on devices already low on space
- iOS Safari background fetch is unreliable; install-time precache may stall
- Defeats the user-agency principle Shippie was built on

A middle path — **auto-download a curated "essentials" set** (e.g., 4–5 apps, ~10MB) and leave the rest opt-in — is worth considering as a Phase 2 polish. Default to manual for v1.

### Alternative considered: headless iframe pre-open

Render the app in a 1×1 offscreen iframe to trigger its asset fetches via the browser's normal load path. Stale-while-revalidate caches everything organically.

**Rejected** because Shippie showcases write to OPFS / IndexedDB on first load (e.g., Recipe Saver seeds 5 example recipes). Triggering that in a headless iframe pollutes user data without their intent. The asset-list approach below does the same job without side effects.

### Architecture call: the SW owns caching authority

A naive client-side `caches.open(currentCacheName())` from page code would have to guess the SW's cache name — but the cache name is stamped inside the SW from `CF_VERSION_METADATA.id` (line ~18 of `sw.js/+server.ts`) and isn't reliably exposed to page code. Building on a name guess is fragile.

**Decision:** the SW owns all cache writes. The page-side `download-app.ts` is a thin client that posts messages to the active SW; the SW does the work and reports progress back via `MessageChannel` ports.

Protocol:
- Page → SW: `{ type: 'DOWNLOAD_APP', slug, port: MessagePort }`
- SW → port: `{ type: 'progress', done: 4, total: 9, bytes: 320000 }` (multiple)
- SW → port: `{ type: 'done', state: 'saved' }` or `{ type: 'done', state: 'partial', failedUrls: [...] }`

Same channel for `REMOVE_APP`, `GET_APP_DOWNLOAD_STATUS`, `CLEAR_OFFLINE_APPS`. The SW already has a `message` handler (currently only listens for `SKIP_WAITING`) — extend it.

This keeps the cache-name stamping completely internal to the SW. Page code never touches `caches` directly.

### Platform shell coverage (the path through the app)

When the user taps a saved showcase from the marketplace while offline, the navigation chain is:

```
Marketplace card  →  /apps/<slug> (SvelteKit page)
                  →  "Open" button → /run/<slug>/  (SvelteKit +server.ts:37 → 302)
                  →  /container?app=<slug>&focused=1
                  →  iframe loads /run/<slug>/index.html + assets
                  →  iframe imports /__shippie/wasm/wa-sqlite/* if app uses local-db
```

Every step needs cached HTML + cached JS chunks to work offline. The previously-shipped offline-first work covers `/_app/immutable/*` (cache-first) and `/run/<slug>/*` (stale-while-revalidate after first visit). What's NOT yet guaranteed cached:

- `/apps/<slug>` — only cached if user has visited that detail page before. Stale-while-revalidate via `/apps/*` handler.
- `/container` — only cached if user has been to focused mode at least once.
- The corresponding `/_app/immutable/*` entry chunks for those routes.
- **`/__shippie/wasm/wa-sqlite/*`** — the canonical shared WASM that every local-db-using showcase fetches at runtime. As of the just-landed `prepare-showcases.mjs` optimization, the per-showcase WASM blobs are stripped from each `static/run/<slug>/assets/`; the runtime `locateFile` hook in `@shippie/local-db` redirects to this shared path. Cached **once** for all DB-using apps.

So a "Save for offline" tap should also opportunistically warm the platform shell on the **first** save (gated by a `__shellWarmed` flag in the cache itself — write a sentinel like `cache.put('/__shippie-pwa/.shell-warmed', new Response(buildId))` and check it before warming). Subsequent saves skip this; the shell stays cached across deploys via the migrate-then-delete activate handler whitelisting `/_app/immutable/*` already.

Endpoints to warm (one-time, on first DOWNLOAD_APP):
- `/`, `/apps`, `/container?app=<first-slug>&focused=1` (the live URL that resolves the SSR'd container shell)
- `/__shippie/wasm/wa-sqlite/*` — list of files generated at build time, similar to the per-showcase manifest. The platform-side prepare script can emit `apps/platform/static/__shippie-pwa/shell-assets.json` listing these.

The user has visited the platform online (they had to, to install the PWA), so HTTP cache covers the `/_app/immutable/*` entry chunks for the shell routes — the SW just needs to pull them into Cache Storage where they're durable, since iOS PWA HTTP cache is unreliable.

---

## Recommended approach — three phases, ship in order

### Phase 1 — Per-showcase "Save for offline" button (~3 hours)

The minimum that closes the gap.

**P1.1 — Emit per-showcase asset manifests at build time (~45 min).**

Today's `prepare-showcases.mjs` builds each showcase and copies `dist/` to `static/run/<slug>/`. Extend the `copyDist` helper (line ~97) so after each successful copy, it walks the resulting tree and emits `static/run/<slug>/__shippie-assets.json`:

```json
{
  "slug": "recipe",
  "buildId": "<sha-of-dist-contents>",
  "totalBytes": 1842901,
  "assets": [
    "/run/recipe/index.html",
    "/run/recipe/manifest.webmanifest",
    "/run/recipe/icon.svg",
    "/run/recipe/icon.png",
    "/run/recipe/assets/index-DYP4IpsV.js",
    "/run/recipe/assets/index-ZU7_hyG-.css",
    "/run/recipe/assets/engine-GEZMNJFK-iCC0dZ1j.js"
  ]
}
```

Note: wa-sqlite WASM files are NOT in this manifest. The just-landed strip in `prepare-showcases.mjs` removes them from each showcase's `assets/` and the runtime `locateFile` hook redirects to the canonical shared `/__shippie/wasm/wa-sqlite/*` path. The shared WASM is listed in `static/__shippie-pwa/shell-assets.json` and warmed once on the first DOWNLOAD_APP — see "Platform shell coverage" above.

**Filename:** `__shippie-assets.json` — not a dotfile. Some deploy/static tooling treats dotfiles specially (Vercel-style `.well-known` exceptions, R2 signed-URL handling, build-step ignores). The `__shippie-` prefix matches the existing `__shippie-pwa/` convention used elsewhere in the platform's static tree, so the same allowlist patterns cover it.

Generate by walking the showcase's `dist/` directory after build. The `buildId` is a SHA-256 of the sorted asset filenames + sizes — stable across reproducible builds, changes when any asset changes. Used for "update available" detection in Phase 3.

`totalBytes` is the sum of asset file sizes. Surfaces in the UI for the storage breakdown.

The manifest is naturally CDN-cacheable since it's just a static file under the assets binding. No new SvelteKit route needed.

**P1.2 — SW message handlers + thin client wrapper (~60 min).**

Two pieces:

**SW side (extend `apps/platform/src/routes/__shippie-pwa/sw.js/+server.ts`).** Today's SW message handler at line ~27 only listens for `'SKIP_WAITING'`. Extend it to dispatch on `event.data.type`:

```js
self.addEventListener('message', (e) => {
  // Existing skip-waiting branch stays.
  if (e.data === 'SKIP_WAITING' || e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  const port = e.ports?.[0];
  if (!port) return;
  const msg = e.data;
  if (msg?.type === 'DOWNLOAD_APP')        handleDownloadApp(msg.slug, port);
  else if (msg?.type === 'REMOVE_APP')     handleRemoveApp(msg.slug, port);
  else if (msg?.type === 'GET_APP_STATUS') handleGetStatus(msg.slug, port);
  else if (msg?.type === 'CLEAR_OFFLINE')  handleClearOffline(port);
});
```

`handleDownloadApp(slug, port)`:
1. Fetch `/run/<slug>/__shippie-assets.json` → asset list.
2. Open the SW's own `CACHE`. Read sentinel `/__shippie-pwa/.shell-warmed`; if missing, also include shell endpoints in the URL list.
3. For each URL: skip if `cache.match(url)` already hits (dedupe). Otherwise `fetch + cache.put`. Use `Promise.allSettled` over chunks of 4 (avoid hammering CF rate limits).
4. Post `{ type: 'progress', done, total }` to `port` after each settled batch.
5. On completion: re-validate by `cache.match`-ing every manifest URL. If all hit → `{ type: 'done', state: 'saved' }`. If any miss → `{ type: 'done', state: 'partial', failedUrls }`.
6. On first save, write sentinel `cache.put('/__shippie-pwa/.shell-warmed', new Response(buildId))`.

`handleRemoveApp(slug, port)`: iterate `cache.keys()`, `cache.delete` any whose URL starts with `/run/<slug>/`. Also delete `/run/<slug>/__shippie-assets.json`. Post `{ type: 'done' }`.

`handleGetStatus(slug, port)`: fetch the manifest, check every URL via `cache.match`. State is one of `'idle' | 'partial' | 'saved'`. Post `{ type: 'status', slug, state, done, total }`.

`handleClearOffline(port)`: iterate cache keys, delete every entry whose URL starts with `/run/`. Skip platform shell (`/`, `/apps`, `/_app/immutable/*`, `/__shippie/wasm/*`) — those are infrastructure, not user-saved apps.

**Page side (`apps/platform/src/lib/offline/download-app.ts`).** Pure thin wrapper, no `caches` access:

```ts
export interface AppDownloadProgress {
  slug: string;
  state: 'idle' | 'downloading' | 'partial' | 'saved' | 'error';
  done: number;
  total: number;
  bytesDone?: number;
  bytesTotal?: number;
  failedUrls?: string[];
  error?: string;
}

export async function downloadApp(
  slug: string,
  onProgress: (p: AppDownloadProgress) => void,
): Promise<AppDownloadProgress>;

export async function removeApp(slug: string): Promise<void>;
export async function getAppStatus(slug: string): Promise<AppDownloadProgress>;
export async function clearOfflineApps(): Promise<void>;
```

Implementation: `navigator.serviceWorker.controller.postMessage({...}, [channel.port2])` with a `MessageChannel`; consume `port1.onmessage` events into the `onProgress` callback; resolve promise on `'done'`.

The page never calls `caches.open` directly. SW owns the authority.

**P1.3 — Marketplace card: "Save for offline" button + status (~75 min).**

`apps/platform/src/lib/components/marketplace/AppCard.svelte` line 51 wraps the **entire card** in `<a class="app-card" href={...}>`. A `<button>` inside `<a>` is invalid HTML and click events bubble to the anchor — the user would tap "Save" and immediately navigate to the app detail page. Two valid options:

**Option A (recommended) — restructure to break out of the anchor.**

Move the anchor inside the card so it wraps just the title + meta region. Layout the card as a positioned div with the link covering the icon + name + tagline area, and the new download button positioned absolutely in the top-right corner outside the anchor. Click goes to the button or the link cleanly, no propagation gymnastics.

```svelte
<div class="app-card" class:sealed={showSeal}>
  <a class="app-card-link" href={`/apps/${slug}`}>
    <!-- existing icon + name + tagline + badges -->
  </a>
  <DownloadButton {slug} />
</div>
```

CSS adjusts to give the link the full clickable area minus the button's footprint. Roughly 30 lines of CSS shuffle, no semantic changes to the card payload.

**Option B (cheaper but worse) — keep the anchor, button calls preventDefault + stopPropagation.**

Click handlers wrapping every nested interactive element. Works but breaks accessibility (screen readers announce nested interactives oddly) and is fragile against future card additions.

**Decision: Option A.** Spend the 30 minutes now.

States:

| State | Render |
|---|---|
| Not downloaded | small "↓ Save for offline" button (top-right, sage outline) |
| Downloading | progress ring with "4/9" or percent (replaces the button) |
| Partial (some assets failed) | amber "↻ Retry" button (replaces "Save") |
| Saved | "✓ Offline-ready" pill (replaces button, click → reveals Remove option) |

State derived from `getAppStatus(slug)` on mount via `onMount` (talks to SW). After successful download, swap to "Saved" and write to a Svelte store (`cachedSlugs`) so other surfaces stay in sync.

**Manifest-complete proof, not two-file proof.** "Saved" requires every URL in the manifest to hit `cache.match`, not just the entry HTML + manifest existing. A partial download (network failed mid-way) returns `'partial'` from the SW and the card shows Retry, never Saved. Prevents the "I tapped Save, the badge says Offline-ready, but tapping the app fails offline" failure mode.

**P1.4 — Storage settings panel (~30 min, optional).**

Quick win: extend the existing `Your Data` panel (or add a small section to `/dashboard/settings` if it exists) showing total cached app bytes + a "Clear all offline apps" button.

For v1, skip the per-app size breakdown. Just total + nuke. Per-card "Remove" already exists from P1.3.

**Files (P1):**
- `apps/platform/scripts/prepare-showcases.mjs` — emit `__shippie-assets.json` per showcase (post-strip, so wa-sqlite WASM is excluded — it lives at the canonical shared path).
- `apps/platform/scripts/prepare-shell-assets.mjs` (new) — emit `apps/platform/static/__shippie-pwa/shell-assets.json` listing the shared `/__shippie/wasm/wa-sqlite/*` files. Wire into the build chain alongside `prepare-showcases`.
- `apps/platform/src/routes/__shippie-pwa/sw.js/+server.ts` — extend `message` handler with download/remove/status/clear handlers + manifest-complete verification.
- `apps/platform/src/lib/offline/download-app.ts` — new thin client wrapper using MessageChannel (~80 lines).
- `apps/platform/src/lib/components/marketplace/AppCard.svelte` — restructure (Option A) so the download button is outside the anchor; render state badge.
- `apps/platform/src/lib/components/marketplace/DownloadButton.svelte` — new presentational component for the button + progress + states (~60 lines).
- `apps/platform/src/lib/stores/cached-slugs.ts` — new Svelte store, populated from `getAppStatus` on app mount.

### Phase 2 — Bulk download + opt-in essentials (~1.5 hours)

P1 makes per-app downloads possible. P2 adds the "I'm about to fly, save everything" affordance.

**P2.1 — "Download all showcases" button (~30 min).**

Single button at the top of `/apps` showing the live total measured from manifests (e.g., "Download all 22 showcases (~12 MB)" — number sourced from summing `totalBytes` across the per-app manifests, not hardcoded). Visible only when at least one app isn't downloaded. Tap → iterate all showcases → SW receives a single `DOWNLOAD_ALL` message and processes them sequentially with concurrency cap of 3 to avoid CF rate limits. Shows a single combined progress meter.

**P2.2 — On-install opt-in (~30 min).**

After the user installs the PWA, show a one-shot toast (gated by localStorage):

> *"Save the 5 starter apps for offline use? (10 MB on Wi-Fi only.)"*
> *[Save] [Maybe later]*

On Wi-Fi via `navigator.connection.type !== 'cellular'`, default-suggest. On cellular, show but don't auto-suggest. Save downloads a curated "essentials" subset (5 apps that demo each pillar — Recipe + Journal + Whiteboard + Live Room + Pomodoro). User taps "Save" → calls `downloadApp` × 5.

**P2.3 — Connection-quality awareness (~30 min).**

`download-app.ts` reads `navigator.connection.effectiveType`. On `slow-2g`/`2g`, shows a confirmation: *"This will use ~2 MB on a slow connection. Continue?"* Default: yes. Just makes the bandwidth spend visible.

### Phase 3 — Updates + maker apps (~deferred)

**P3.1 — Update detection.** When a showcase rebuilds, its `buildId` in `__shippie-assets.json` changes. The SW's existing PWA-update-banner pattern can be extended: on platform deploy, also re-fetch each downloaded app's manifest, compare buildIds, surface "Updates available for Recipe Saver" with a "Refresh" tap. Deferred until we have evidence users care about freshness vs. "it just works."

**P3.2 — Maker apps.** Today, maker apps live at `<slug>.shippie.app/*`, served via the wrapper from R2. No `__shippie-assets.json` exists for them. Adding one requires: (a) the deploy pipeline emits a manifest alongside the R2 upload, (b) the wrapper serves it. Then the same `downloadApp` utility works on maker apps. Deferred until showcases have real usage data showing the pattern works.

**P3.4 — Version-safe offline app launcher.** The current migration handler drops platform shell HTML on deploy (deliberate, fixes the stale-HTML-pointing-at-dead-chunks bug). Trade-off: between activation and the user's first online visit, opening a saved app from the marketplace requires a network round-trip for the shell route HTML. Saved app **assets** survive (`/run/*` whitelisted in migration) but the chrome around them does not. A version-safe launcher could be a static `/__shippie-pwa/offline-launcher` page that the SW pre-warms — minimal SvelteKit-free HTML that lists cached apps and opens them directly to `/run/<slug>/`. Defer until we see the cross-deploy offline gap actually bite. Mention in launch notes for honesty.

**P3.3 — AI model pre-cache opt-in.** Already deferred in the prior offline-first plan. Same shape: settings toggle, downloads ~225 MB q8 models, lazy by default.

---

## Cache budget table

Numbers measured at HEAD on 2026-04-30. Plan should re-measure at build time, never hard-code.

| Layer | Size | When | After Phase 1 |
|---|---|---|---|
| Container shell + platform JS chunks | ~2 MB | Cached on first online nav (network-first nav handler + `/_app/immutable/*` cache-first) | Already works |
| 22 showcase entry HTMLs | ~50 KB | SW install precache | Already works |
| **22 showcase asset bundles (post-WASM-strip)** | **~12 MB total** today | **On user tap of "Save for offline"** | New behaviour |
| Shared `/__shippie/wasm/wa-sqlite/*` | ~1.6 MB once | Warmed alongside the first showcase save | New behaviour |
| AI models (6 × q8) | 225 MB | On first AI call | Unchanged (lazy) |
| User data (OPFS/wa-sqlite) | varies | On data write | Unchanged (always-local) |

A user who taps "Save for offline" on all 22 showcases plus the shell warm ends up with ~16 MB total platform cache. Comfortably under iOS Safari's PWA quota and well below the user's typical "free" storage. The 225 MB AI models stay opt-in separately.

Per-showcase the size varies sharply: the four "rich" apps (journal, whiteboard, recipe, live-room) are ~2 MB each; most others are <500 KB. Surfacing the per-app size on the card next to "Save for offline (1.9 MB)" is a small Phase 2 polish that helps the user pick what's worth saving.

---

## What stays online (the honest limit)

Phase 1 + 2 don't change these:

1. **First-time install of a NEW maker app from R2.** Phase 3 closes this gap. Spark phone-to-phone propagation eventually closes it without any internet.
2. **Auth/OAuth flows.**
3. **Marketplace search server-side (FTS).** Cached marketplace listing remains browsable offline; live search needs network.
4. **Push send.**
5. **Live Room signalling.**
6. **Deploy/dashboard.**
7. **Platform shell HTML between a deploy and the user's first online visit.** The migrate-then-delete activate handler deliberately drops platform shell HTML (`/`, `/apps`, `/container`) on every deploy — this prevents the stale-HTML-pointing-at-dead-chunks regression we hit earlier. Saved app **assets** survive (`/run/*` is whitelisted in the migration); their **chrome** does not. So if a deploy lands while the user is offline, opening a saved app via the marketplace fails until the user reconnects to fetch the new shell HTML once. P3.4 above lists the version-safe launcher as the eventual fix — it's a real gap, not a bug; surface it in the launch UX so the user understands.

   Practical impact today: vanishingly small for most users, since deploys tend to coincide with connectivity. Worth naming honestly so we don't claim "saved apps are immortal" — they're durable across deploys when the user goes through the marketplace AT LEAST ONCE online after each deploy.

---

## Critical files

**Changed (Phase 1):**
- `apps/platform/scripts/prepare-showcases.mjs` — emit `__shippie-assets.json` per showcase build (post-WASM-strip).
- `apps/platform/src/lib/components/marketplace/AppCard.svelte` — restructure (Option A) so the download button sits outside the anchor; render Save state.
- `apps/platform/src/routes/__shippie-pwa/sw.js/+server.ts` — extend `message` handler with download/remove/status/clear handlers; **expand the migration allowlist to include `/__shippie/wasm/`** so shared WASM survives deploys; manifest-complete verification.

**New (Phase 1):**
- `apps/platform/src/lib/offline/download-app.ts` — orchestrator + remove + status helpers.
- `apps/platform/src/lib/stores/cached-slugs.ts` — Svelte writable for cross-component state.
- `apps/platform/static/run/<slug>/__shippie-assets.json` — per-showcase asset manifest (gitignored, generated).
- `apps/platform/static/__shippie-pwa/shell-assets.json` — shared WASM + shell-route asset list (gitignored, generated).

**Reused (no changes):**
- Existing SW cache mechanisms (the cache-first `/_app/immutable/*` and stale-while-revalidate `/run/*` handlers from the offline-first plan are exactly what download orchestration writes into).
- Existing toast component (commit `82f44fa`) for download success/error.
- Existing migrate-then-delete activate handler (`2a40f87`) — preserves downloaded apps across deploys (because `/run/*` is whitelisted in migration).

---

## Verification

1. **Pre-flight: `bun run --filter @shippie/platform health`** — green before commit.
2. **Asset manifest sanity:** after `bun run build`, every `static/run/<slug>/__shippie-assets.json` exists and lists every file in the showcase's dist (no missing assets, no phantom entries, no wa-sqlite wasm — those live at `/__shippie/wasm/wa-sqlite/`). Shell-assets manifest at `static/__shippie-pwa/shell-assets.json` lists the shared WASM paths.
3. **Manifest-complete proof:** delete a single asset URL from the cache by hand in DevTools after a successful download. Re-tap the card. Status should read `'partial'` (one URL miss in the manifest-complete check), not `'saved'`. Card shows Retry, not Offline-ready. This is the load-bearing test that prevents partial-failure-marked-as-saved.
4. **Single-app download flow (manual, online):**
   - Cold install Shippie PWA on a fresh device.
   - Visit `/apps`. Confirm every card shows "↓ Save for offline" except entry HTMLs already precached.
   - Tap "Save for offline" on Recipe Saver. Progress fills. Resolves to "✓ Offline-ready."
   - DevTools → Application → Cache Storage → confirm `/run/recipe/*` entries match the manifest. Confirm `/__shippie/wasm/wa-sqlite/*` and `/__shippie-pwa/.shell-warmed` sentinel are present.
5. **Click-propagation regression:** confirm tapping the Save button does NOT navigate to `/apps/<slug>`. Confirm tapping anywhere else on the card DOES navigate.
6. **Airplane-mode test on real iOS Safari + Android Chrome (the load-bearing UX test):**
   - On a real iPhone in installed PWA mode: save Recipe Saver. Force-close. Airplane mode. Reopen.
   - Tap Recipe Saver → opens fully (HTML + JS + WASM all cached, container shell loads).
   - Tap a non-downloaded app (e.g., Pomodoro) → fails gracefully to the branded offline page.
   - Repeat on Android Chrome PWA.
7. **Remove flow:**
   - Tap Remove on Recipe Saver. Cache entries for `/run/recipe/*` cleared.
   - Card resets to "↓ Save for offline." `/__shippie/wasm/wa-sqlite/*` stays cached (other apps may need it).
8. **Persistence across deploys:**
   - With Recipe Saver downloaded, push a deploy.
   - Reopen Shippie online → migrate-then-delete activate copies `/run/*` and `/_app/immutable/*` to the new cache.
   - Recipe Saver still shows "✓ Offline-ready."
   - Go offline → Recipe Saver still opens.
9. **Storage settings sanity:**
   - Five apps downloaded → "Clear all offline apps" → `/run/*` entries purged. Platform shell + WASM + immutable chunks survive (still online-functional). All cards reset to "↓ Save for offline."
10. **Cellular awareness (P2):**
    - Throttle to "Slow 3G" in DevTools.
    - Tap "Download all" → confirmation prompt shows "~12 MB on slow connection." Numbers come from manifest sums, not hardcoded.

---

## Commit-split

P1 split into five commits, P2 into two. P3 deferred entirely.

1. `feat(showcases): emit per-app + shell asset manifests` — P1.1. Extends `prepare-showcases.mjs` to emit `__shippie-assets.json` per showcase + new `prepare-shell-assets.mjs` for the shared WASM list. No platform code change yet. Standalone, revertible.
2. `feat(sw): download/remove/status/clear message handlers` — P1.2 SW side. Extends the existing `message` handler with the new dispatch. SW owns caching authority. Includes manifest-complete verification.
3. `feat(offline): download-app client wrapper + cached-slugs store` — P1.2 page side. MessageChannel-based thin client. Pure logic, no UI.
4. `feat(marketplace): restructure AppCard to host Save button` — P1.3 first half. Option-A restructure (link + button as siblings, card as positioned div). Pure layout change, no behaviour yet.
5. `feat(marketplace): Save for offline button + state ladder` — P1.3 second half. Wires the button into the restructured card. Uses utility from #3.
6. `feat(settings): clear-all-offline-apps + storage total` — P1.4. Optional, can roll into #5 if it stays tiny.
7. `feat(marketplace): Download all showcases + connection awareness` — P2.1 + P2.3.
8. `feat(onboarding): on-install essentials opt-in toast` — P2.2.

Time: P1 ≈ 3.5h (added 30 min for SW extension + manifest-complete verification), P2 ≈ 1.5h, total ≈ 5h.

---

## What this looks like for the user

> "I install Shippie. The marketplace asks if I want to save the 5 starter apps for offline. I tap Save. 30 seconds later they're ready. I scroll the marketplace and see green offline-ready badges on those 5. I tap Save on Pomodoro and Workout Logger because I want them on my run. I check Settings → Storage and see I've used 8 MB of 50 MB allowed. I get on a flight, open Shippie, and every app I saved opens instantly. The data is mine. The apps are on my phone. Nothing's loading from a server."
