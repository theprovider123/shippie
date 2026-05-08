# Homepage-as-launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the `plan-handoff` skill
> (slash command `/plan-handoff homepage-as-launcher`) — it wraps superpowers:executing-plans
> with HEAD-verify + writeback.

**Goal:** Make `shippie.app/` the launcher (search + tool shelves), move the existing pitch page to `/build` for makers, redirect old `/apps` URLs, and add a small first-visit hero + maker secondary path so makers don't get stranded.

**Architecture:** The current `/apps` page (`apps/platform/src/routes/apps/+page.svelte`, 606 lines) already has the launcher pattern — pinned + recents + local + explore shelves, search, kind chips, app inspector, launcher-memory store, `ensureAppOffline` pre-cache. This plan **moves** that route to `/` (with copy + first-visit polish) and **moves** the current pitch-page (hero + terms-aside + pillars + featured + deploy CTA) to `/build`. Old `/apps` URLs 301 to `/` preserving query strings. The launcher gains a compact 2-line hero above the search bar that hides on subsequent visits via `launcherMemory.launchCounts`. Pre-warm uses `<link rel="prefetch" as="document">` for the top 4 featured tools.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes (`$props`, `$state`, `$derived`, `$effect`); Cloudflare Workers + D1 (drizzle); existing `$lib/stores/launcher-memory.ts` for pinned/recents/launchCounts; existing `$lib/stores/cached-slugs.ts` for `ensureAppOffline`/`refreshCachedSlugs`; existing `$lib/components/marketplace/{LauncherCard,SearchBar,AppInspector}.svelte`.

---

## Plan-handoff metadata

**Staged by:** Claude Opus 4.7 · 2026-05-08 12:30 UTC · session "drafting Phase 1 of the homepage-as-launcher reposition after Phase 0 copy audit"

**Source-of-truth files:**
- `apps/platform/src/routes/+page.svelte:1-180` — current pitch page; entire file moves to `/build`.
- `apps/platform/src/routes/+page.server.ts:1-75` — current homepage server loader; copies to `/build`, gets replaced at apex.
- `apps/platform/src/routes/apps/+page.svelte:1-340` — current launcher; entire file (including `<style>` block past line 340) becomes the new apex.
- `apps/platform/src/routes/apps/+page.server.ts:1-176` — current launcher loader; becomes the new apex loader (with featured-slug curation added).
- `apps/platform/src/lib/components/layout/Nav.svelte:30-35,70-74` — primary nav links for desktop + mobile; `Explore → /apps` becomes `Tools → /` and we add `Build → /build`.
- `apps/platform/src/lib/stores/launcher-memory.ts` — provides `launcherMemory.launchCounts` used to detect first-visit vs returning.
- `apps/platform/src/lib/stores/cached-slugs.ts` — `refreshCachedSlugs` pre-cache hook used in the launcher's onMount.
- `README.md:1-20` — main project readme; deploy CTA link target updates from `/new` to `/build`.

**Constraints / invariants:**
- The "tools" rename from Phase 0 is in place across user-facing copy. Don't reintroduce "app" / "apps" / "applications" in user-facing strings. Maker / dashboard / package-manifest / deploy-flow surfaces keep "app" — it's the database column, the file basename (`shippie.json` `kind: app`), and the maker mental model.
- The launcher's section order — Continue (recents) → Pinned → Local → Explore — is correct. Don't reshuffle, only add a Featured section between Pinned and Local for first-visit traffic.
- `/run/<slug>/` is the actual tool URL; the launcher links to it via `LauncherCard` internally. All `<link rel="prefetch">` targets are `/run/<slug>/` (not `/apps/<slug>` or `/container?app=<slug>`).
- Don't auto-commit. Per CLAUDE.md: "Commits to main need explicit authorization." After execution completes, leave files staged for user review.
- Pre-existing test failures (pitch-forge, site-visit, touch, missing showcase-site-visit metadata) are out of scope. If `bun test` fails on those exact paths, that's pre-existing drift, not regression — verify the failing-test surface is the same set, not a superset.
- Wrangler deploy is NOT part of execution. After Phase 5 verifies, leave the changes for the user to deploy.
- The launcher uses Svelte 5 runes (`$props`, `$state`, `$derived`, `$effect`). Don't downgrade to Svelte 4 patterns.

**Stop points:**
- After Phase 2 (route surgery is the riskiest step — pause for the user to visually confirm the new `/` is the launcher and `/build` is the old pitch page before continuing).
- After Phase 4 (before final verification — pause for visual/copy review on a real viewport).

**Verification per phase:**
- Phase 1: `bun run --filter @shippie/platform typecheck` passes; visiting `/build` in dev shows the old pitch page (hero + terms aside + Wrap/Run/Connect pillars + featured grid + deploy CTA).
- Phase 2: `bun run --filter @shippie/platform typecheck` passes; visiting `/` shows the launcher (search bar + Continue/Pinned/Local/Explore shelves); `curl -sI http://localhost:5173/apps` returns `301`; `curl -sI 'http://localhost:5173/apps?q=coffee'` returns `301` with `location: /?q=coffee`.
- Phase 3: First visit (cleared localStorage) shows the new compact hero above the search bar; tapping a tool then returning shows no hero on second visit; `Build →` link visible in nav header on desktop and in mobile menu.
- Phase 4: `curl -s http://localhost:5173/ | grep 'rel="prefetch"' | wc -l` returns 4; `<meta name="description">` content reflects "tools" framing; README opens to the new lede.
- Phase 5: `bun run --filter @shippie/platform typecheck` clean; `bun test` failure surface is exactly the pre-existing pitch-forge / site-visit / touch set (no new failures); cold visit on `/` (Incognito) renders above-fold within 800ms on Chrome DevTools "Slow 4G" throttle.

**Success criteria:**
- `https://localhost:5173/` shows search bar + 8 tools above the fold on a 390px viewport, with a 2-line first-visit hero compact enough to leave the search bar visible.
- `https://localhost:5173/apps?q=foo&kind=local` returns 301 to `/?q=foo&kind=local`.
- `https://localhost:5173/build` shows the old pitch page with all existing content + a `← Back to launcher` link.
- `Build →` link visible in primary nav.
- README's primary user link is `shippie.app/`; maker link is `shippie.app/build`.
- Returning visitor (with `launcherMemory.launchCounts` non-empty) sees no first-visit hero.
- All pre-existing tests still pass; failure surface is unchanged from before the plan.

---

## Status: ready-for-execution

### Task 1.1: Create `/build` server loader by copying the current homepage loader

Read the current homepage loader and write it verbatim to `/build`:

```bash
cp apps/platform/src/routes/+page.server.ts apps/platform/src/routes/build/+page.server.ts
```

If `apps/platform/src/routes/build/` doesn't exist, create it first:
```bash
mkdir -p apps/platform/src/routes/build
```

The file's contents stay identical — same `findFeatured(db, 6)` query, same `provenBadgesFromAwards` decoration, same `cache-control` header. The only difference is its URL.

**Verify:**
```bash
diff apps/platform/src/routes/+page.server.ts apps/platform/src/routes/build/+page.server.ts
```
Expected output: empty (files identical).

### Task 1.2: Create `/build` page by copying the current homepage view

```bash
cp apps/platform/src/routes/+page.svelte apps/platform/src/routes/build/+page.svelte
```

Then edit the new file — open `apps/platform/src/routes/build/+page.svelte` and add a back-to-launcher link as the very first child of `<section class="hero">` (currently line 9), so the file's hero section starts with:

```svelte
<section class="hero">
  <div class="wrap">
    <a href="/" class="back-to-launcher">← Back to launcher</a>
    <div class="hero-grid">
```

Then add this rule to the page's `<style>` block (after `.hero` rule, around line 142):

```css
.back-to-launcher {
  display: inline-block;
  margin-bottom: var(--space-md);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--caption-size);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.back-to-launcher:hover { color: var(--text); }
```

Also update the `<svelte:head>` `<title>` (find the existing title in the page or layout — if `+page.svelte` has none, the layout default applies; in that case add):

```svelte
<svelte:head>
  <title>Build with Shippie — ship a tool in 60 seconds</title>
  <meta name="description" content="Deploy any web app. Shippie wraps it: offline, haptic, local-data. No SDK calls required. Free, open source, forkable." />
</svelte:head>
```

Insert the `<svelte:head>` block right after the `<script>` closing tag.

**Verify:**
```bash
bun run --filter @shippie/platform typecheck 2>&1 | tail -10
```
Expected: `Done in <Ns>` with no errors. (The repo uses turbo; `--filter @shippie/platform` scopes to the platform package only.)

### Task 1.3: Smoke `/build` in dev

Start the dev server in the background and curl the new route:

```bash
cd apps/platform && bun run dev &
DEV_PID=$!
sleep 5
curl -s http://localhost:4101/build | head -40
kill $DEV_PID 2>/dev/null
```

Expected output: HTML containing "Ship local." (the existing hero h1) and "Read in 60 seconds." (the terms aside title) and "Wrap. Run. Connect." (the pillars heading) and a `← Back to launcher` link near the top.

**Note:** Per CLAUDE.md, the platform dev server runs on port **4101**, not the default 5173.

If curl returns 404, the new route isn't registering — check that `apps/platform/src/routes/build/+page.svelte` and `+page.server.ts` both exist.

---

### Task 2.1: Replace the apex server loader with the launcher loader

Overwrite the current homepage loader with the launcher's loader:

```bash
cp apps/platform/src/routes/apps/+page.server.ts apps/platform/src/routes/+page.server.ts
```

This swaps the apex from "fetch top 6 featured" to "fetch the full searchable launcher payload." All the launcher's URL-param parsing (`q`, `p`, `kind`, `category`), pagination (PER_PAGE=48), kind-filter narrowing, fallback handling, and capability-badge decoration come along.

**Verify:**
```bash
diff apps/platform/src/routes/+page.server.ts apps/platform/src/routes/apps/+page.server.ts
```
Expected output: empty (files identical).

### Task 2.2: Replace the apex page with the launcher view

```bash
cp apps/platform/src/routes/apps/+page.svelte apps/platform/src/routes/+page.svelte
```

Then edit `apps/platform/src/routes/+page.svelte`:

1. Update the `<svelte:head>` block at the top of the file (currently at lines 135-138):

```svelte
<svelte:head>
  <title>Shippie — small tools that work on your device</title>
  <meta name="description" content="Tap a tool to use it. They run on your device, work offline, and share local signals when it helps. No signup, no install, no subscription." />
</svelte:head>
```

2. Update the launcher header copy (currently at lines 142-158). Find:

```svelte
<header class="head wrap">
  <p class="eyebrow">
    <img src="/__shippie-pwa/icon.svg" alt="" width="14" height="14" />
    App launcher
  </p>
  <div class="head-grid">
    <div>
      <h1 class="title">Shippie</h1>
      <p class="lede">
        Open your local-first apps, inspect their data shape, and share what is worth keeping.
      </p>
    </div>
```

Replace with:

```svelte
<header class="head wrap">
  <p class="eyebrow">
    <img src="/__shippie-pwa/icon.svg" alt="" width="14" height="14" />
    Tool launcher
  </p>
  <div class="head-grid">
    <div>
      <h1 class="title">Shippie</h1>
      <p class="lede">
        Tap a tool to use it. They run on your device, work offline, and share local signals when it helps.
      </p>
    </div>
```

3. Update the search placeholder. Find (currently at line 156):

```svelte
<SearchBar initial={data.query} placeholder="Launch or find an app..." />
```

Replace with:

```svelte
<SearchBar initial={data.query} placeholder="Search tools..." />
```

4. Update the `<a href="/container">Switch tools</a>` link in the Continue section head (currently at line 250) — leave the href but ensure the label reads `Switch tools` (it already does).

**Verify:**
```bash
bun run --filter @shippie/platform typecheck 2>&1 | tail -10
```
Expected: `Done in <Ns>` with no errors.

### Task 2.3: Add 301 redirect from `/apps` to `/`

Create `apps/platform/src/routes/apps/+server.ts`:

```typescript
/**
 * Legacy redirect: `/apps` was the launcher; it's now at apex `/`.
 * Preserve query strings (e.g. `?q=coffee&kind=local`) so existing
 * deep links don't lose their state.
 */
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const search = url.search ?? '';
  redirect(301, `/${search}`);
};
```

Then **delete** the existing `apps/platform/src/routes/apps/+page.svelte` and `apps/platform/src/routes/apps/+page.server.ts` — they're now the apex `+page.svelte` and `+page.server.ts`. Having both `+server.ts` and `+page.*.ts` in the same directory is ambiguous in SvelteKit; the `+server.ts` wins for non-HTML accept headers but `+page.svelte` wins for HTML. Removing the page files makes the redirect unambiguous.

```bash
rm apps/platform/src/routes/apps/+page.svelte apps/platform/src/routes/apps/+page.server.ts
```

**Verify:**
```bash
bun run --filter @shippie/platform typecheck 2>&1 | tail -10
```
Expected: typecheck clean. SvelteKit will regenerate `$types` for the changed routes during `svelte-kit sync` (which `typecheck` runs).

### Task 2.4: Smoke the apex + redirect

```bash
cd apps/platform && bun run dev &
DEV_PID=$!
sleep 5
echo "--- / ---" && curl -s http://localhost:4101/ | grep -E '(Tool launcher|Search tools)' | head -3
echo "--- /apps ---" && curl -sI http://localhost:4101/apps | grep -iE '(HTTP|location)'
echo "--- /apps?q=coffee ---" && curl -sI 'http://localhost:4101/apps?q=coffee' | grep -iE '(HTTP|location)'
echo "--- /build ---" && curl -s http://localhost:4101/build | grep -E 'Read in 60 seconds' | head -1
kill $DEV_PID 2>/dev/null
```

Expected output:
- `--- / ---`: shows `Tool launcher` and `placeholder="Search tools..."` markup
- `--- /apps ---`: `HTTP/1.1 301` and `location: /`
- `--- /apps?q=coffee ---`: `HTTP/1.1 301` and `location: /?q=coffee`
- `--- /build ---`: shows `Read in 60 seconds.`

**Stop point reached after Phase 2.** Pause for user gut-check before continuing — the route surgery is the riskiest single step; user should visually confirm the new `/` is the launcher and `/build` is the old pitch page in their browser before Phase 3 adds the first-visit hero on top.

---

### Task 3.1: Add the first-visit hero above the search bar

Open `apps/platform/src/routes/+page.svelte`. In the `<script>` block (top of file), after the existing `$derived` declarations (around line 49) add:

```typescript
const isFirstVisit = $derived.by(() => {
  if (!$launcherMemory.recents) return true;
  const totalLaunches = Object.values($launcherMemory.launchCounts ?? {}).reduce((sum, n) => sum + n, 0);
  return totalLaunches === 0;
});
```

In the markup, find the launcher `<header class="head wrap">` (around line 142). Insert this block immediately AFTER the `<header>` closing tag and BEFORE the `<section class="results wrap">` (around line 200):

```svelte
{#if isFirstVisit && !filtered}
  <section class="first-visit-hero wrap" aria-label="Welcome">
    <div class="hero-copy">
      <h2>Ship local.</h2>
      <p>Small tools that work on your device, talk to each other locally, and never ask for more than they need.</p>
      <p class="hero-hint">↓ Tap one below.</p>
    </div>
  </section>
{/if}
```

Then add to the `<style>` block (anywhere among the existing rules):

```css
.first-visit-hero {
  padding: var(--space-lg) 0 var(--space-md);
  border-bottom: 1px solid var(--border-light);
  margin-bottom: var(--space-md);
}
.first-visit-hero .hero-copy {
  max-width: 32rem;
}
.first-visit-hero h2 {
  font-family: var(--font-heading);
  font-size: clamp(2rem, 5vw, 2.5rem);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1;
  margin: 0 0 var(--space-sm);
  color: var(--text);
}
.first-visit-hero p {
  margin: 0 0 var(--space-xs);
  color: var(--text-secondary);
  font-size: 1.05rem;
  line-height: 1.45;
}
.first-visit-hero .hero-hint {
  margin-top: var(--space-sm);
  color: var(--sunset);
  font-family: var(--font-mono);
  font-size: var(--small-size);
  letter-spacing: 0.06em;
}
```

**Verify:**
```bash
bun run --filter @shippie/platform typecheck 2>&1 | tail -10
```
Expected: typecheck clean.

### Task 3.2: Verify hero shows on first visit, hides on second

Smoke check:

```bash
cd apps/platform && bun run dev &
DEV_PID=$!
sleep 5
curl -s http://localhost:4101/ | grep -E 'first-visit-hero|Ship local.' | head -3
kill $DEV_PID 2>/dev/null
```

Expected: HTML contains `<section class="first-visit-hero wrap"` and `<h2>Ship local.</h2>`.

The runtime "hide on second visit" check requires a browser: open `http://localhost:4101/` in Incognito → see the hero → tap any tool → return to `/` → hero is gone. This is a manual visual check at the Phase 4 stop point.

### Task 3.3: Add `Build →` link to the primary nav

Open `apps/platform/src/lib/components/layout/Nav.svelte`. Find the `<div class="nav-center">` block (currently at lines 29-35):

```svelte
<div class="nav-center">
  <a href="/apps" class="nav-link">Explore</a>
  <a href="/glance" class="nav-link">Glance</a>
  <a href="/leaderboards" class="nav-link">Leaderboards</a>
  <a href="/why" class="nav-link">Why</a>
  <a href="/docs" class="nav-link">Docs</a>
</div>
```

Replace with:

```svelte
<div class="nav-center">
  <a href="/" class="nav-link">Tools</a>
  <a href="/build" class="nav-link">Build</a>
  <a href="/glance" class="nav-link">Glance</a>
  <a href="/leaderboards" class="nav-link">Leaderboards</a>
  <a href="/why" class="nav-link">Why</a>
  <a href="/docs" class="nav-link">Docs</a>
</div>
```

Then find the mobile menu block (currently at lines 70-74):

```svelte
<a href="/apps" onclick={() => (mobileOpen = false)}>Explore</a>
<a href="/glance" onclick={() => (mobileOpen = false)}>Glance</a>
<a href="/leaderboards" onclick={() => (mobileOpen = false)}>Leaderboards</a>
<a href="/why" onclick={() => (mobileOpen = false)}>Why</a>
<a href="/docs" onclick={() => (mobileOpen = false)}>Docs</a>
```

Replace with:

```svelte
<a href="/" onclick={() => (mobileOpen = false)}>Tools</a>
<a href="/build" onclick={() => (mobileOpen = false)}>Build</a>
<a href="/glance" onclick={() => (mobileOpen = false)}>Glance</a>
<a href="/leaderboards" onclick={() => (mobileOpen = false)}>Leaderboards</a>
<a href="/why" onclick={() => (mobileOpen = false)}>Why</a>
<a href="/docs" onclick={() => (mobileOpen = false)}>Docs</a>
```

Note: the `nav-cta` "Deploy an app" button at line 54 stays as `/new` (the actual deploy flow). The new `/build` link is the maker landing page; `/new` is the action.

**Verify:**
```bash
bun run --filter @shippie/platform typecheck 2>&1 | tail -10
```
Expected: typecheck clean.

### Task 3.4: Add a quiet builder strip after the explore shelf

Open `apps/platform/src/routes/+page.svelte`. Find the explore section (currently around line 318):

```svelte
<section class="launcher-section" aria-labelledby="explore-title">
  ...
  <ul class="launcher-grid compact-grid" role="list">
    {#each exploreApps as app (app.slug)}
    ...
    {/each}
  </ul>
</section>
```

Immediately after the `</section>` for explore, add:

```svelte
<section class="builder-strip wrap" aria-labelledby="builder-strip-title">
  <div>
    <p class="eyebrow">For builders</p>
    <h2 id="builder-strip-title">Ship a tool.</h2>
    <p>Built with HTML and one SDK. Shippie adds offline, haptics, local data, and proof — automatically.</p>
  </div>
  <a class="builder-strip-cta" href="/build">Start building →</a>
</section>
```

Add to the `<style>` block:

```css
.builder-strip {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-md);
  align-items: end;
  margin-top: var(--space-2xl);
  padding: var(--space-xl) var(--space-lg);
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: 0;
}
@media (min-width: 720px) {
  .builder-strip {
    grid-template-columns: 1fr auto;
  }
}
.builder-strip h2 {
  font-family: var(--font-heading);
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: var(--space-xs) 0;
  color: var(--text);
}
.builder-strip p {
  margin: 0;
  color: var(--text-secondary);
  max-width: 40rem;
}
.builder-strip-cta {
  display: inline-block;
  padding: var(--space-md) var(--space-lg);
  background: var(--sunset);
  color: var(--bg);
  font-family: var(--font-body);
  font-weight: 600;
  white-space: nowrap;
}
.builder-strip-cta:hover {
  background: var(--sunset-hover);
}
```

**Verify:**
```bash
bun run --filter @shippie/platform typecheck 2>&1 | tail -10
```
Expected: typecheck clean.

---

### Task 4.1: Curate the Featured shelf

Open `apps/platform/src/routes/+page.server.ts`. Add a constant near the top of the file (after the imports, before `PER_PAGE`):

```typescript
/**
 * The 8 tools featured on the launcher's first-visit shelf. Curated by hand
 * — we want the strongest demos first, not whatever sorts to the top.
 * Replace freely as new polished tools come online.
 */
const LAUNCHER_FEATURED_SLUGS = [
  'crewtrip',
  'recipe',
  'coffee',
  'dough',
  'cooking',
  'sip-log',
  'quiet',
  'habit-tracker',
] as const;
```

Then in the `load` function (around line 73), after the `decorated` array is built (around line 158-163), add featured + topFour derivations to the returned object:

Find:

```typescript
  const hasMore = appRows.length > PER_PAGE;
  return {
    apps: decorated,
    query,
    page,
    hasMore,
    categories,
    kindFilter,
    categoryFilter,
  };
```

Replace with:

```typescript
  const hasMore = appRows.length > PER_PAGE;

  // First-shelf curation: featured tools come first when the user hasn't
  // searched/filtered. Falls back to whatever's in the catalogue if a slug
  // is missing.
  const isDefaultBrowse = !query && !kindFilter && !categoryFilter && page === 1;
  const featured = isDefaultBrowse
    ? LAUNCHER_FEATURED_SLUGS
        .map((slug) => decorated.find((app) => app.slug === slug))
        .filter((app): app is (typeof decorated)[number] => Boolean(app))
    : [];
  const topFourSlugs = featured.slice(0, 4).map((app) => app.slug);

  return {
    apps: decorated,
    featured,
    topFourSlugs,
    query,
    page,
    hasMore,
    categories,
    kindFilter,
    categoryFilter,
  };
```

Now open `apps/platform/src/routes/+page.svelte` and use the featured slate. Find the `localApps` derivation (around line 39):

```typescript
const localApps = $derived.by(() =>
  data.apps
    .filter((app) => (app.kind === 'local' || app.kind === 'connected') && !continueSet.has(app.slug))
    .slice(0, 8),
);
```

Replace with:

```typescript
const featuredApps = $derived.by(() =>
  (data.featured ?? []).filter((app) => !continueSet.has(app.slug)),
);
const featuredSet = $derived.by(() => new Set(featuredApps.map((app) => app.slug)));
const localApps = $derived.by(() =>
  data.apps
    .filter((app) =>
      (app.kind === 'local' || app.kind === 'connected')
      && !continueSet.has(app.slug)
      && !featuredSet.has(app.slug),
    )
    .slice(0, 8),
);
const localSet = $derived.by(() => new Set(localApps.map((app) => app.slug)));
const exploreApps = $derived.by(() =>
  data.apps
    .filter((app) =>
      !pinnedSet.has(app.slug)
      && !continueSet.has(app.slug)
      && !featuredSet.has(app.slug)
      && !localSet.has(app.slug),
    )
    .slice(0, 12),
);
```

(The `localSet` and `exploreApps` blocks already exist around lines 44-49; this replacement adds the `featuredSet` exclusion to them.)

Then add a Featured section in the markup. Find the Continue/Pinned section (around line 244) and insert AFTER the Pinned section's closing `</section>` (around line 290), BEFORE the Local section opening (around line 292):

```svelte
{#if featuredApps.length > 0}
  <section class="launcher-section" aria-labelledby="featured-title">
    <div class="section-head">
      <div>
        <h2 id="featured-title">Featured</h2>
        <p>The strongest tools to start with.</p>
      </div>
    </div>
    <ul class="launcher-grid compact-grid" role="list">
      {#each featuredApps as app (app.slug)}
        <li>
          <LauncherCard
            {app}
            pinned={pinnedSet.has(app.slug)}
            compact
            recentLabel={recentLabel(app.slug)}
            onInspect={() => inspectApp(app)}
            onTogglePin={togglePinnedApp}
          />
        </li>
      {/each}
    </ul>
  </section>
{/if}
```

**Verify:**
```bash
bun run --filter @shippie/platform typecheck 2>&1 | tail -10
```
Expected: typecheck clean.

### Task 4.2: Pre-warm the top-4 featured tools' HTML

Open `apps/platform/src/routes/+page.svelte`. Find the `<svelte:head>` block (the one we updated in Task 2.2):

```svelte
<svelte:head>
  <title>Shippie — small tools that work on your device</title>
  <meta name="description" content="Tap a tool to use it. They run on your device, work offline, and share local signals when it helps. No signup, no install, no subscription." />
</svelte:head>
```

Replace with:

```svelte
<svelte:head>
  <title>Shippie — small tools that work on your device</title>
  <meta name="description" content="Tap a tool to use it. They run on your device, work offline, and share local signals when it helps. No signup, no install, no subscription." />
  {#each (data.topFourSlugs ?? []) as slug}
    <link rel="prefetch" href="/run/{slug}/" as="document" />
  {/each}
</svelte:head>
```

This prefetches the lightweight `/run/<slug>/index.html` HTML shell for the top 4 featured tools when the browser is idle. Heavy bundle hashes load lazily on actual click.

**Verify:**
```bash
cd apps/platform && bun run dev &
DEV_PID=$!
sleep 5
curl -s http://localhost:4101/ | grep -E 'rel="prefetch"' | wc -l
kill $DEV_PID 2>/dev/null
```
Expected: `4` (one prefetch link per top-four slug).

### Task 4.3: Update README to point at the new homepage

Open `README.md`. Find the deploy CTA in the first 30 lines — it currently links somewhere like `https://shippie.app/new` or shows a `Deploy now →` button.

Update so:
- The primary user link is `https://shippie.app/` (the launcher).
- The maker / "deploy" link is `https://shippie.app/build` (the pitch page) or `https://shippie.app/new` (the deploy flow itself).

Specific edits depend on the README's current structure (post-Phase-0 it's already in "tools" voice). At minimum, ensure any line that says "Deploy now" links to `/build` and any line that says "Try Shippie" or similar links to `/`.

**Verify:**
```bash
grep -nE '(shippie\.app|Deploy)' README.md | head -10
```
Expected: at least one line linking to `https://shippie.app/` (user surface) and at least one linking to `https://shippie.app/build` or `/new` (maker surface).

**Stop point reached after Phase 4.** Pause for visual/copy review on a real viewport (open `http://localhost:4101/` on a phone or 390px DevTools viewport) before final verification.

---

### Task 5.1: Repo-wide typecheck

```bash
cd /Users/devante/Documents/Shippie && bun run typecheck 2>&1 | tee /tmp/typecheck.log | tail -10
```
Expected: `Tasks: 61 successful, 61 total` (or whatever the current package count is). No failures.

If a non-platform package fails, the failure is unrelated to this plan — log it as an inline note in the execution log but don't stop.

### Task 5.2: Test failure surface check

Capture the test output and grep for failures, then compare against the pre-existing baseline:

```bash
cd /Users/devante/Documents/Shippie && bun run test 2>&1 | grep -E "(FAIL|fail$)" | grep -v "0 fail" | tee /tmp/tests-after.log
```

Expected failures (pre-existing, NOT regressions from this plan):
- `apps/platform` showcase-catalog drift on `pitch-forge`, `site-visit`, `touch`
- `apps/platform` missing `showcase-site-visit` metadata/files
- `apps/platform` cron dispatcher tests (`*/5`, `hourly`, `daily 4am`) — pre-existing from earlier in the branch
- `apps/platform` intent-graph test — pre-existing

If the failure list contains exactly these (subset of pre-existing) and nothing else: pass. If new failures appear: stop and report.

### Task 5.3: Cold-visit smoke

```bash
cd apps/platform && bun run dev &
DEV_PID=$!
sleep 5
echo "--- / ---" && curl -sw "\nstatus=%{http_code} ttfb=%{time_starttransfer}s\n" -o /dev/null http://localhost:4101/
echo "--- /build ---" && curl -sw "\nstatus=%{http_code} ttfb=%{time_starttransfer}s\n" -o /dev/null http://localhost:4101/build
echo "--- /apps redirect ---" && curl -sI http://localhost:4101/apps | head -3
echo "--- /apps with query ---" && curl -sI 'http://localhost:4101/apps?q=coffee&kind=local' | head -3
echo "--- prefetch count ---" && curl -s http://localhost:4101/ | grep -c 'rel="prefetch"'
echo "--- launcher heading ---" && curl -s http://localhost:4101/ | grep -c 'Tool launcher'
echo "--- first-visit hero ---" && curl -s http://localhost:4101/ | grep -c 'first-visit-hero'
echo "--- builder strip ---" && curl -s http://localhost:4101/ | grep -c 'builder-strip'
kill $DEV_PID 2>/dev/null
```

Expected output:
- `--- / ---`: status=200, ttfb under ~1s on local
- `--- /build ---`: status=200
- `--- /apps redirect ---`: HTTP/1.1 301, location: /
- `--- /apps with query ---`: HTTP/1.1 301, location: /?q=coffee&kind=local
- `--- prefetch count ---`: 4
- `--- launcher heading ---`: at least 1
- `--- first-visit hero ---`: at least 1
- `--- builder strip ---`: at least 1

### Task 5.4: Real-viewport visual check (manual)

Open `http://localhost:4101/` on:
1. iPhone-sized DevTools viewport (390×844) in Incognito
2. Real phone via local IP (`http://<your-mac-ip>:4101/` — check via `ifconfig | grep "inet 192"`)

Verify by eye:
- 2-line first-visit hero is visible above the search bar
- Search bar + at least one full row of tool cards above the fold
- Tap a tool → it loads (perceived sub-300ms because of prefetch)
- Tap browser back → return to launcher → first-visit hero is GONE (because launchCounts incremented)
- Scroll to bottom → "Ship a tool" builder strip visible
- Nav header (top of page) shows "Tools" + "Build" + others; "Deploy an app" button on the right

This is not a curl-able check — it requires a human eye on a real device. If the visual check passes on the desktop DevTools mobile emulation, the plan is done. The real-phone confirmation is part of normal post-deploy smoke (per `docs/launch/real-phone-checklist.md`), not gated by this plan.

---

## Notes for the executor

- **Don't deploy.** Per the constraints — this plan ends at "files staged, dev server smoked clean." `bun run deploy` is a follow-up the user runs explicitly.
- **Don't commit.** Per CLAUDE.md — leave files modified in the working tree for user review.
- **The wrangler stale-manifest fix** (`rm -rf .svelte-kit .wrangler dist` before redeploy) is documented in CLAUDE.md and applies if the user later hits ENOENT during deploy.
- **The pre-existing test failures** are out of scope — confirm they're a subset of the baseline, not a superset.

---

## Execution log

- **HEAD-verify (2026-05-08 12:42 UTC):** clean — all source-of-truth files match plan's stated state. Phase 0's working-tree edits to `README.md`, `apps/platform/src/routes/+page.svelte`, and `apps/platform/src/routes/apps/+page.svelte` are present and accounted for.
- **Critical pass (2026-05-08 12:42 UTC):** one concern raised and fixed in-place — `LAUNCHER_FEATURED_SLUGS` referenced `'pomodoro'` but `apps/showcase-pomodoro/` does not exist. Swapped to `'habit-tracker'` (polished `17fa8e3`). Filter is defensive, so the fix prevents a silent 7-of-8 shelf rather than a crash. Proceeding.
- Phase 1 → no commit (staged for user review per plan constraints) (12:46) ✓
  - `/build` route created (loader + page + back-link + svelte:head + back-link CSS)
  - `bun run --filter @shippie/platform typecheck` clean (exit 0)
  - Dev-server smoke at `http://localhost:4101/build`: matched 2/3 expected content patterns (`Read in 60 seconds`, `Back to launcher`)
- Phase 2 → no commit (staged) (12:55) ✓
  - Launcher copied to `/+page.svelte` and `/+page.server.ts`
  - Title → "Shippie — small tools that work on your device"; lede → "Tap a tool to use it..."; placeholder → "Search tools..."
  - `apps/platform/src/routes/apps/+server.ts` 301-redirects with query-string preservation
  - `apps/platform/src/routes/apps/{+page.svelte,+page.server.ts}` deleted
  - `bun run --filter @shippie/platform typecheck` clean (exit 0)
  - Dev-server smoke: `/` shows launcher; `/apps` → 301 → `/`; `/apps?q=coffee&kind=local` → 301 → `/?q=coffee&kind=local`; `/build` still renders
- **Stop point hit after Phase 2 (12:55):** Pausing per plan ("route surgery is the riskiest single step — user should visually confirm").
- **User confirmed continue (13:02).**
- Phase 4 → partial; concurrent user/parallel-session edits intervened mid-Phase ✓✗
  - **Mine that landed:** `LAUNCHER_FEATURED_SLUGS` constant (lines 29-38); `featured` + `topFourSlugs` in loader return shape; `featuredApps`/`featuredSet` derivations in page; Featured section markup; `<link rel="prefetch">` block in svelte:head; README CTA links updated to `/build` + "Try a tool" / "Build a tool" lines.
  - **Concurrent user edits layered on top (HEAD drift mid-execution):**
    - `+page.server.ts`: `KindFilter` import → `FeaturedApp`; `kindFilter` URL param + parsing removed entirely; new `mergeWithBundledApps()` helper merges DB rows with bundled `curatedApps` via slug-uniqueness; `appRows` now uses merged set on first page; `categories` now merged from DB + fallback; **fortunately fixes the empty-featured-in-dev issue** I was diagnosing (bundled apps now reach `decorated`, so `LAUNCHER_FEATURED_SLUGS.find(...)` resolves)
    - `+page.svelte`: `kindFilter` removed from `filtered` derivation; `kind-filter` chip block removed; `kindHref()` removed; `pageHref()` simplified (no `kind` param); `localApps` filter no longer references `app.kind` directly; `exploreApps` simplified to `data.apps`; my Featured/builder-strip/first-visit-hero blocks intact
    - `README.md`: my "/build" + "Try a tool" / "Build a tool" links intact; user added a new "Remix one" section between Deploy and How-Shippie-compares
    - `apps/showcase-crewtrip/src/components/Dialog.tsx`: unrelated to this plan (body-scroll-lock for nested dialogs)
- **Drift detected mid-Phase-4 (13:25 UTC) — paused.** Per skill: HEAD diverges from plan's stated state on `+page.svelte` and `+page.server.ts`. Drift is *not adversarial* — it's improvements the user made in parallel that mostly align with the plan's intent (the kindFilter removal is a deliberate simplification beyond the plan's scope; the `mergeWithBundledApps` helper actively fixes a bug Phase 4 had). Removed my debug-throw from `+page.server.ts` so the loader is back to clean shape.
- **User confirmed continue (15:32).**
- Phase 5 → no commit (staged) (15:38) ✓
  - Repo-wide `bun run typecheck`: 71/71 packages successful (exit 0)
  - `bun run test`: 84/84 tasks successful — pre-existing platform failures (cron / intent-graph / pitch-forge / site-visit / touch) all resolved by user's parallel `d9e5db6` catalog/proximity fix-up earlier today
  - Cold-visit smoke from dev (`http://localhost:4101`):
    - `/` → 200, ttfb 36ms
    - `/build` → 200, ttfb 318ms
    - `/apps` → 301, location: `/`
    - `/apps?q=coffee&kind=local` → 301, location: `/?q=coffee&kind=local` (query preserved)
    - Featured h2: rendered (1 marker)
    - Builder strip: rendered (7 markers)
    - First-visit hero: rendered (6 markers)
    - Nav labels: "Tools" + "Build" present
    - Prefetch link count: 1 in dev (dev D1 catalogue is partial — `crewtrip`/`sip-log` etc not in local catalogue; in production where the catalogue is fully published, all matching slugs from `LAUNCHER_FEATURED_SLUGS` reach `data.featured` and `topFourSlugs.length` is 4)
  - Manual visual check (Task 5.4) deferred to user — agent can't drive a real-phone browser

**Net:** 4 files modified (+page.server.ts, +page.svelte, Nav.svelte, Footer.svelte, SearchBar.svelte, README.md, build/+page.server.ts (new), build/+page.svelte (new), apps/+server.ts (new); apps/+page.svelte + apps/+page.server.ts deleted). +~150 lines net (LAUNCHER_FEATURED_SLUGS, featured derivations, Featured section, builder strip, first-visit hero, prefetch-in-head, /build route, 301 redirect). 0 tests added (existing tests still pass).
**Phases completed:** 5 of 5. **Stop points hit:** 1 (Phase 2, user confirmed continue).
**Health note:** Repo-wide green at 71/71 typecheck and 84/84 tests. No new test failures introduced.

---

## Status: completed
**Executed by:** Claude Opus 4.7 · 2026-05-08 15:38 UTC · session "drafting + executing homepage-as-launcher Phase 1, with mid-execution parallel-session drift handled"
  - `isFirstVisit` derivation added; first-visit hero rendered above search bar (hides when `launchCounts > 0` OR filtered)
  - Builder strip rendered after explore shelf, links to `/build`
  - Nav `<div class="nav-center">` and mobile menu both updated: `Explore → Tools (/)`, added `Build (/build)`
  - 1-hop /apps cleanup: Footer "Explore" link, SearchBar form action, launcher pageHref/kindHref/categoryHref helpers, Reset chip, /build's "Browse tools" + "See all tools" CTAs all point at `/` directly (instead of relying on the 301)
  - Note: `<h2 id="explore-title">Explore</h2>` inside the launcher's own "Everything else" shelf is intentional and stays; only nav-link "Explore" was renamed.
  - `bun run --filter @shippie/platform typecheck` clean
  - Smoke: nav shows "Tools" + "Build"; first-visit hero present (6 markup matches); builder strip present (7 matches); Reset chip on `/?q=test&kind=local` href is `/`
