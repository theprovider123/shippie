# Workspace Phase 1 — Front Door + Rail Spine + PWA Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip Shippie's front door so the app opens into the **Workspace** (`/workspace`) instead of the tool catalog, relocate the catalog to `/tools`, turn the workspace sidebar into an adaptive Open/Pinned/Recent tool switcher, and teach the installed PWA + service worker the new routes — all in one shippable change.

**Architecture:** SvelteKit route moves (`git mv` + redirects), one pure/testable rail-grouping selector wired into the existing container shell's sidebar, and coordinated edits to the manifest, service worker, and the shell-asset generator so the installed/offline app launches at `/workspace`. No new design language; reuses `tokens.css`.

**Tech Stack:** SvelteKit + Cloudflare Workers, Svelte 5 runes, **vitest** (apps/platform is vitest-only — never `bun:test`), Workbox-style hand-rolled SW.

**Source spec:** `docs/superpowers/specs/2026-06-01-workspace-redesign-design.md`

---

## Pre-flight (read before starting)

- **This is a multi-agent repo.** Concurrent codex sessions run `git clean -fd` / `git reset` on `review-implementation-2026-05-23` and edit shared files (`state.ts`, routes). **Execute this plan in an isolated git worktree on a dedicated branch** (`git worktree add -b workspace-phase1 ../Shippie-ws-wt HEAD`, symlink `node_modules`). Hand the merge to the user. Before any commit: `git reset -q` then `git add` only your explicit paths.
- **Verify green per task** with `bun run typecheck` and the targeted test. Full `bun run health` (typecheck + test + build) at the end. `bun run build` / deploy are user-run (sandbox blocks them) — never block on them.
- **Scope note (resolves a spec sequencing nuance):** the catalog currently lives at `/` (`src/routes/+page.{svelte,server.ts}`). You cannot point `/ → /workspace` without giving the catalog a home, so **the catalog route relocation to `/tools` happens here in Phase 1.** Phase 3 later adds the empty-state onboarding hero + curated starters; Phase 1 just moves the existing catalog UI verbatim.

## File structure

| File | Responsibility | Action |
|---|---|---|
| `src/lib/container/rail-groups.ts` | Pure adaptive Open/Pinned/Recent grouping | **Create** |
| `src/lib/container/rail-groups.test.ts` | Unit tests for the selector | **Create** |
| `src/routes/tools/+page.svelte` | Catalog UI (moved from root) | **Move** from `src/routes/+page.svelte` |
| `src/routes/tools/+page.server.ts` | Catalog loader (moved from root) | **Move** from `src/routes/+page.server.ts` |
| `src/routes/+page.server.ts` | Root → `/workspace` redirect | **Create** (after move) |
| `src/routes/+page.svelte` | Stub (never renders; redirect runs first) | **Create** (after move) |
| `src/routes/workspace/+page.svelte` | Workspace shell (moved from container) | **Move** from `src/routes/container/+page.svelte` |
| `src/routes/workspace/+page.server.ts` | Workspace loader (no bare-redirect) | **Move** from `src/routes/container/+page.server.ts` |
| `src/routes/container/+page.server.ts` | `/container` → `/workspace` back-compat | **Create** (after move) |
| `src/routes/apps/+server.ts` | `/apps` → `/tools` redirect | **Modify** |
| `src/lib/components/marketplace/SearchBar.svelte` | Catalog search posts to `/tools` | **Modify** |
| `src/routes/manifest.webmanifest/+server.ts` | start_url/scope/shortcuts/protocol → `/workspace` | **Modify** |
| `src/routes/__shippie-pwa/sw.js/+server.ts` | Shell docs + shell-key maps know `/workspace`,`/tools` | **Modify** |
| `scripts/prepare-showcases.mjs` | Shell-assets precache `routes` | **Modify** |

---

### Task 1: Pure adaptive rail-grouping selector

**Files:**
- Create: `src/lib/container/rail-groups.ts`
- Test: `src/lib/container/rail-groups.test.ts`

The rail's groups come from three distinct sources (per spec §4): **Open** = running tools, **Pinned** = `launcher-memory.pinned`, **Recent** = unpinned recents. `cached-slugs` is NOT a source. A tool appears in at most one group (Open > Pinned > Recent). This selector is pure so it's unit-testable; the Svelte sidebar (Task 11) just renders its output.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/container/rail-groups.test.ts
import { describe, expect, it } from 'vitest';
import { buildRailGroups, type RailTool } from './rail-groups';

const tool = (slug: string): RailTool => ({
  slug,
  name: slug[0]!.toUpperCase() + slug.slice(1),
  icon: slug.slice(0, 2).toUpperCase(),
  accent: '#E8603C',
});
const catalog: RailTool[] = ['palate', 'chiwit', 'lift', 'golazo', 'tab'].map(tool);

describe('buildRailGroups', () => {
  it('hides Open when nothing is running', () => {
    const g = buildRailGroups({ catalog, openSlugs: [], pinned: ['palate'], recents: [] });
    expect(g.open).toEqual([]);
    expect(g.pinned.map((t) => t.slug)).toEqual(['palate']);
  });

  it('orders Open by openSlugs order and keeps Pinned/Recent disjoint from Open', () => {
    const g = buildRailGroups({
      catalog,
      openSlugs: ['chiwit', 'palate'],
      pinned: ['palate', 'lift'],
      recents: [{ slug: 'chiwit', lastOpened: '2026-06-01T09:00:00Z' }],
    });
    expect(g.open.map((t) => t.slug)).toEqual(['chiwit', 'palate']);
    // palate is open, so it must NOT also appear under pinned
    expect(g.pinned.map((t) => t.slug)).toEqual(['lift']);
    expect(g.recent).toEqual([]);
  });

  it('Recent excludes pinned + open, sorts newest-first, caps at 5', () => {
    const recents = [
      { slug: 'palate', lastOpened: '2026-06-01T08:00:00Z' }, // pinned -> excluded
      { slug: 'chiwit', lastOpened: '2026-06-01T07:00:00Z' },
      { slug: 'lift', lastOpened: '2026-06-01T09:00:00Z' },
      { slug: 'golazo', lastOpened: '2026-06-01T06:00:00Z' },
    ];
    const g = buildRailGroups({ catalog, openSlugs: [], pinned: ['palate'], recents, recentCap: 2 });
    expect(g.recent.map((t) => t.slug)).toEqual(['lift', 'chiwit']); // newest first, capped at 2
  });

  it('ignores slugs not present in the catalog', () => {
    const g = buildRailGroups({ catalog, openSlugs: ['ghost'], pinned: ['nope'], recents: [{ slug: 'x', lastOpened: 'z' }] });
    expect(g.open).toEqual([]);
    expect(g.pinned).toEqual([]);
    expect(g.recent).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/platform && bunx vitest run src/lib/container/rail-groups.test.ts`
Expected: FAIL — `Cannot find module './rail-groups'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/container/rail-groups.ts
/**
 * Adaptive workspace-rail grouping (spec §4/§5). Pure + framework-free so
 * it can be unit-tested. Sources are kept distinct: Open = running tools,
 * Pinned = launcher-memory.pinned, Recent = unpinned/un-open recents.
 * `cached-slugs` (offline state) is deliberately NOT an input.
 */
export interface RailTool {
  slug: string;
  name: string;
  icon: string;
  accent: string;
  category?: string;
}

export interface RailGroups {
  open: RailTool[];
  pinned: RailTool[];
  recent: RailTool[];
}

export function buildRailGroups(input: {
  catalog: RailTool[];
  openSlugs: string[];
  pinned: string[];
  recents: { slug: string; lastOpened: string }[];
  recentCap?: number;
}): RailGroups {
  const cap = input.recentCap ?? 5;
  const bySlug = new Map(input.catalog.map((t) => [t.slug, t]));
  const pick = (slug: string) => bySlug.get(slug);

  const open = input.openSlugs.map(pick).filter((t): t is RailTool => Boolean(t));
  const openSet = new Set(open.map((t) => t.slug));

  const pinned = input.pinned
    .map(pick)
    .filter((t): t is RailTool => Boolean(t) && !openSet.has(t!.slug));
  const pinnedSet = new Set(pinned.map((t) => t.slug));

  const recent = [...input.recents]
    .sort((a, b) => (a.lastOpened < b.lastOpened ? 1 : -1)) // newest first
    .map((r) => pick(r.slug))
    .filter((t): t is RailTool => Boolean(t) && !openSet.has(t!.slug) && !pinnedSet.has(t!.slug))
    .slice(0, cap);

  return { open, pinned, recent };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/platform && bunx vitest run src/lib/container/rail-groups.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/container/rail-groups.ts apps/platform/src/lib/container/rail-groups.test.ts
git commit -m "feat(workspace): pure adaptive rail-grouping selector"
```

---

### Task 2: Relocate the catalog to `/tools`

**Files:**
- Move: `src/routes/+page.svelte` → `src/routes/tools/+page.svelte`
- Move: `src/routes/+page.server.ts` → `src/routes/tools/+page.server.ts`

The root page IS the catalog ("Marketplace browse"). Move it wholesale. SvelteKit resolves `./$types` and `$lib/...` imports identically at the new depth, so no import edits are needed; only the doc-comment route references are cosmetic.

- [ ] **Step 1: Move the files**

```bash
cd apps/platform
mkdir -p src/routes/tools
git mv src/routes/+page.svelte src/routes/tools/+page.svelte
git mv src/routes/+page.server.ts src/routes/tools/+page.server.ts
```

- [ ] **Step 2: Fix the stale eyebrow label in the moved page**

The catalog page renders an eyebrow reading "TOOL LAUNCHER". In `src/routes/tools/+page.svelte`, find the hero eyebrow text and change it to `Browse tools` (search the file for `TOOL LAUNCHER` / `Tool launcher`, case-insensitive, and replace the visible label only).

- [ ] **Step 3: Typecheck**

Run: `cd apps/platform && bun run typecheck`
Expected: PASS (no import breakage from the move). If `svelte-kit sync` complains the root route is missing a page, that is expected and resolved in Task 6.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/src/routes/tools
git commit -m "refactor(workspace): relocate catalog from / to /tools"
```

---

### Task 3: `/apps` redirects to `/tools`

**Files:**
- Modify: `src/routes/apps/+server.ts`

- [ ] **Step 1: Replace the redirect target**

Current body redirects to `/${search}`. Replace the file with:

```ts
/**
 * Legacy redirect: `/apps` was the launcher, then the apex `/`; the catalog
 * now lives at `/tools`. Preserve query strings (e.g. `?q=coffee&kind=local`)
 * so existing deep links keep their state.
 */
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const search = url.search ?? '';
  redirect(301, `/tools${search}`);
};
```

- [ ] **Step 2: Verify by running the dev server**

Run: `cd apps/platform && bun run dev` (background), then `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:4101/apps?q=coffee"`
Expected: `301 http://localhost:4101/tools?q=coffee`

- [ ] **Step 3: Commit**

```bash
git add apps/platform/src/routes/apps/+server.ts
git commit -m "refactor(workspace): /apps -> /tools (preserve query)"
```

---

### Task 4: Catalog search form posts to `/tools`

**Files:**
- Modify: `src/lib/components/marketplace/SearchBar.svelte:20`

- [ ] **Step 1: Repoint the form action**

Change the form tag from:

```svelte
<form action="/" method="get" class="search-form" role="search">
```

to:

```svelte
<form action="/tools" method="get" class="search-form" role="search">
```

Also update the doc comment at the top of the file ("posts back to /apps?q=") to read `posts back to /tools?q=`.

- [ ] **Step 2: Typecheck**

Run: `cd apps/platform && bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/platform/src/lib/components/marketplace/SearchBar.svelte
git commit -m "refactor(workspace): catalog search submits to /tools"
```

---

### Task 5: Rename the workspace route `/container` → `/workspace`

**Files:**
- Move: `src/routes/container/+page.svelte` → `src/routes/workspace/+page.svelte`
- Move: `src/routes/container/+page.server.ts` → `src/routes/workspace/+page.server.ts`

- [ ] **Step 1: Move the files**

```bash
cd apps/platform
mkdir -p src/routes/workspace
git mv src/routes/container/+page.svelte src/routes/workspace/+page.svelte
git mv src/routes/container/+page.server.ts src/routes/workspace/+page.server.ts
```

- [ ] **Step 2: Remove the bare-redirect in the moved loader**

In `src/routes/workspace/+page.server.ts`, delete these lines (they bounced `/container` to the catalog — the exact bug we're fixing):

```ts
  if (!url.search && url.pathname === '/container') {
    throw redirect(307, '/');
  }
```

If `redirect` is now unused, remove it from the `@sveltejs/kit` import. Keep `setHeaders({ 'cache-control': 'no-store' })` and the `loadContainerPageData(...)` call.

- [ ] **Step 3: Fix internal `/container` self-references in the moved page**

In `src/routes/workspace/+page.svelte`, replace `/container` path literals that refer to this route with `/workspace` (the `goHome` handler, any `href`/`goto('/container...')`, `?section=`/`?app=` self-links). Find them:

Run: `grep -n "/container" src/routes/workspace/+page.svelte`
Replace each self-navigation occurrence with `/workspace`. (Leave any string that is a *storage key* or *comment* unless it is a live route.) Re-grep until only non-route uses remain.

- [ ] **Step 4: Typecheck**

Run: `cd apps/platform && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/routes/workspace
git commit -m "refactor(workspace): rename /container route to /workspace, drop bare-redirect"
```

---

### Task 6: Root `/` redirects to `/workspace`

**Files:**
- Create: `src/routes/+page.server.ts`
- Create: `src/routes/+page.svelte`

- [ ] **Step 1: Create the redirect loader**

```ts
// src/routes/+page.server.ts
/**
 * The Workspace is the front door. Root always lands there; the catalog
 * lives at /tools. (Reverses the old /container -> / bounce.)
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  redirect(307, `/workspace${url.search ?? ''}`);
};
```

- [ ] **Step 2: Create the stub page (never renders — redirect runs first)**

```svelte
<!-- src/routes/+page.svelte -->
<!-- Intentionally empty: +page.server.ts always redirects to /workspace. -->
```

- [ ] **Step 3: Verify both redirects**

With `bun run dev` running:
Run:
```bash
curl -s -o /dev/null -w "root: %{http_code} %{redirect_url}\n" "http://localhost:4101/"
curl -s -o /dev/null -w "workspace: %{http_code}\n" "http://localhost:4101/workspace?section=home"
curl -s -o /dev/null -w "tools: %{http_code}\n" "http://localhost:4101/tools"
```
Expected: `root: 307 http://localhost:4101/workspace`, `workspace: 200`, `tools: 200`.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/src/routes/+page.server.ts apps/platform/src/routes/+page.svelte
git commit -m "feat(workspace): / redirects to /workspace (front door flip)"
```

---

### Task 7: `/container` back-compat redirect to `/workspace`

**Files:**
- Create: `src/routes/container/+page.server.ts`
- Create: `src/routes/container/+page.svelte`

Installed apps, the `web+shippie` protocol handler, and SW deep-links still emit `/container?...`. Keep the path alive as a redirect that preserves the query.

- [ ] **Step 1: Create the redirect loader**

```ts
// src/routes/container/+page.server.ts
/**
 * Back-compat: the workspace moved to /workspace. Preserve the query so
 * deep-links (?app=…&focused=1, ?section=data, ?open=…, ?import=package)
 * still resolve.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  redirect(308, `/workspace${url.search ?? ''}`);
};
```

- [ ] **Step 2: Create the stub page**

```svelte
<!-- src/routes/container/+page.svelte -->
<!-- Intentionally empty: +page.server.ts redirects to /workspace. -->
```

- [ ] **Step 3: Verify**

Run: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:4101/container?app=palate&focused=1"`
Expected: `308 http://localhost:4101/workspace?app=palate&focused=1`

- [ ] **Step 4: Commit**

```bash
git add apps/platform/src/routes/container
git commit -m "feat(workspace): /container -> /workspace back-compat redirect"
```

---

### Task 8: PWA manifest points at `/workspace`

**Files:**
- Modify: `src/routes/manifest.webmanifest/+server.ts`

- [ ] **Step 1: Update start_url, scope, shortcuts, protocol handler**

In the manifest object, make these exact replacements:

```ts
    start_url: '/workspace',
    scope: '/',
```
(Keep `scope: '/'` — the workspace is at root level and `/run/...` must stay in scope.)

Shortcuts and protocol handler — replace `/container` with `/workspace`:

```ts
      { name: 'Saved data', url: '/workspace?section=data', short_name: 'Data' },
```
```ts
        action: '/workspace?import=package',
```
```ts
    protocol_handlers: [{ protocol: 'web+shippie', url: '/workspace?open=%s' }],
```

- [ ] **Step 2: Verify served manifest**

Run: `curl -s http://localhost:4101/manifest.webmanifest | grep -E "start_url|workspace"`
Expected: `"start_url": "/workspace"` and the shortcut/protocol URLs show `/workspace`.

- [ ] **Step 3: Commit**

```bash
git add apps/platform/src/routes/manifest.webmanifest/+server.ts
git commit -m "feat(workspace): PWA manifest start_url + shortcuts -> /workspace"
```

---

### Task 9: Service worker shell knows `/workspace` and `/tools`

**Files:**
- Modify: `src/routes/__shippie-pwa/sw.js/+server.ts`

The SW network-first-caches "shell documents" and maps requests to shell cache keys. Today it knows `/`, `/container`, `/you`, and `APPS_PREFIX='/apps'`. A stale install must still resolve, but new installs must precache `/workspace` + `/tools`.

- [ ] **Step 1: Add the new shell documents (keep old ones for stale installs)**

Change line 28 from:

```js
const SHELL_DOCUMENTS = ['/', '/container', '/you'];
```

to:

```js
// '/workspace' is the front door; '/tools' is the catalog. '/' and
// '/container' remain so already-installed clients still resolve while
// they pick up the new shell.
const SHELL_DOCUMENTS = ['/workspace', '/tools', '/you', '/', '/container'];
```

- [ ] **Step 2: Teach the shell-key maps the new routes**

In `shellKeysForRequest` (≈L364) and `shellDocumentUrls` (≈L379), wherever the code special-cases `url.pathname === '/'` or `'/container'` or pushes `absoluteUrl('/container?app=' + slug + '&focused=1')`, add the `/workspace` equivalents so a focused-tool offline launch resolves under the new route. Concretely, in `shellKeysForRequest` add alongside the existing pushes:

```js
  if (url.pathname === '/workspace') keys.push(absoluteUrl('/workspace'));
  if (slug) {
    keys.push(absoluteUrl('/workspace?app=' + encodeURIComponent(slug) + '&focused=1'));
  }
  keys.push(absoluteUrl('/workspace'));
```

and in `shellDocumentUrls`, alongside the existing `/container?app=…` push:

```js
    urls.push('/workspace?app=' + encodeURIComponent(slug) + '&focused=1');
```

Leave the existing `/container` and `/` pushes in place (harmless redundancy that protects stale clients).

- [ ] **Step 3: Typecheck (the SW is generated as a JS string but the module is TS)**

Run: `cd apps/platform && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/src/routes/__shippie-pwa/sw.js/+server.ts
git commit -m "feat(workspace): SW shell precache + key maps include /workspace and /tools"
```

---

### Task 10: Shell-asset generator precaches the new routes

**Files:**
- Modify: `scripts/prepare-showcases.mjs` (≈L567)

- [ ] **Step 1: Update the precache route list**

Change:

```js
    routes: ['/', '/apps'],
```

to:

```js
    routes: ['/workspace', '/tools', '/'],
```

(`/` stays so the redirect document itself is cached; `/apps` drops — it is a server redirect with no shell.)

- [ ] **Step 2: Regenerate and verify**

Run: `cd apps/platform && bun run prepare:generated && grep -A4 '"routes"' src/lib/_generated/shell-assets.json 2>/dev/null || bun scripts/prepare-showcases.mjs`
Expected: the written shell-assets manifest lists `/workspace`, `/tools`, `/`.

- [ ] **Step 3: Commit**

```bash
git add apps/platform/scripts/prepare-showcases.mjs apps/platform/src/lib/_generated/shell-assets.json
git commit -m "feat(workspace): shell-asset precache routes -> /workspace,/tools"
```

---

### Task 11: Rewrite the workspace sidebar as the adaptive switcher

**Files:**
- Modify: `src/routes/workspace/+page.svelte` (the `<aside class="sidebar">` block, formerly ≈L3189–3213)

Replace the marketing headline + status panel + tabs-only nav with: a header ("Workspace"), the adaptive Open/Pinned/Recent switcher (from Task 1), and a rail foot (Add tools / Data·Access / Sign in). The section tabs (Home/Create/Your Data/Access) move into the foot as compact secondary nav so no current capability is lost.

- [ ] **Step 1: Add imports + derived rail groups to the page `<script>`**

Near the existing imports in `src/routes/workspace/+page.svelte`, add:

```ts
  import { buildRailGroups, type RailTool } from '$lib/container/rail-groups';
  import { launcherMemory, hydrateLauncherMemory } from '$lib/stores/launcher-memory';
  import { onMount } from 'svelte';
```
(If `onMount` is already imported, don't duplicate it.)

Add a hydrate-on-mount and a `$derived` rail-groups value. `openAppIds` holds app **ids**; map them to slugs via the known apps. Use the page's existing apps array (the same one passed to `DashboardHome` as `apps={launchVisibleApps}`):

```ts
  onMount(() => hydrateLauncherMemory());

  const railCatalog = $derived<RailTool[]>(
    launchVisibleApps.map((a) => ({
      slug: a.slug,
      name: a.name,
      icon: a.icon ?? a.shortName ?? a.name.slice(0, 2),
      accent: a.accent,
      category: a.category,
    })),
  );
  const openSlugs = $derived(
    openAppIds
      .map((id) => launchVisibleApps.find((a) => a.id === id)?.slug)
      .filter((s): s is string => Boolean(s)),
  );
  const railGroups = $derived(
    buildRailGroups({
      catalog: railCatalog,
      openSlugs,
      pinned: $launcherMemory.pinned,
      recents: $launcherMemory.recents,
    }),
  );
```

(If `launchVisibleApps` / `openAppIds` aren't already reactive `$derived`/`$props` in this file, reuse whatever local names the file already binds for the `DashboardHome` props — grep `apps={` and `openAppIds` in the file to find them.)

- [ ] **Step 2: Replace the sidebar markup**

Swap the `.sidebar-intro` + `.status-panel` + `.tabs` block for:

```svelte
  <aside class="sidebar">
    <div class="rail-head">
      <span class="rail-mark">⌘</span> Workspace
    </div>

    {#if railGroups.open.length > 0}
      <p class="rail-label">Open</p>
      {#each railGroups.open as t (t.slug)}
        <button class="rail-item active" onclick={() => openApp(t.slug)}>
          <span class="rail-icon" style="background:{t.accent}">{t.icon}</span>
          {t.name}<span class="rail-live"></span>
        </button>
      {/each}
    {/if}

    {#if railGroups.pinned.length > 0}
      <p class="rail-label">Pinned</p>
      {#each railGroups.pinned as t (t.slug)}
        <button class="rail-item" onclick={() => openApp(t.slug)}>
          <span class="rail-icon" style="background:{t.accent}">{t.icon}</span>{t.name}
        </button>
      {/each}
    {/if}

    {#if railGroups.recent.length > 0}
      <p class="rail-label">Recent</p>
      {#each railGroups.recent as t (t.slug)}
        <button class="rail-item muted" onclick={() => openApp(t.slug)}>
          <span class="rail-icon" style="background:{t.accent}">{t.icon}</span>{t.name}
        </button>
      {/each}
    {/if}

    {#if railGroups.open.length === 0 && railGroups.pinned.length === 0 && railGroups.recent.length === 0}
      <p class="rail-label">Tools</p>
      <p class="rail-empty">No tools yet</p>
    {/if}

    <nav class="rail-foot" aria-label="Workspace sections">
      <a class="foot-item" href="/tools">＋ Add tools</a>
      <button class="foot-item" class:active={section === 'data'} onclick={() => showSection('data')}>Data</button>
      <button class="foot-item" class:active={section === 'access'} onclick={() => showSection('access')}>Access</button>
      <button class="foot-item" class:active={section === 'create'} onclick={() => showSection('create')}>Create</button>
    </nav>
  </aside>
```

`openApp(slug)` — reuse the existing handler the page already uses to focus a tool. Grep for how `DashboardHome`'s open callback or the existing tile click opens an app (e.g. `onOpen`, `openApp`, `showApp`, or a `goto('/workspace?app='+slug)`); call that. If only a `?app=` navigation exists, define:

```ts
  function openApp(slug: string) {
    showSection('home');
    goto(`/workspace?app=${encodeURIComponent(slug)}`);
  }
```
(using the page's existing `goto` import).

- [ ] **Step 3: Add minimal styles (reuse tokens; sharp corners, no new language)**

Append to the page `<style>`:

```css
  .rail-head { font-family: var(--font-heading); font-size: 1rem; color: var(--text); display: flex; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-sm); }
  .rail-mark { color: var(--sunset); }
  .rail-label { font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-light); margin: var(--space-md) 0 var(--space-xs); }
  .rail-item { display: flex; align-items: center; gap: var(--space-sm); width: 100%; background: none; border: 0; color: var(--text); font-size: 0.85rem; padding: 0.4rem 0.4rem; text-align: left; cursor: pointer; }
  .rail-item:hover { background: var(--surface-alt); }
  .rail-item.active { background: var(--surface-alt); border-left: 2px solid var(--sunset); padding-left: calc(0.4rem - 2px); }
  .rail-item.muted { color: var(--text-secondary); }
  .rail-icon { width: 20px; height: 20px; flex: none; display: flex; align-items: center; justify-content: center; font-family: var(--font-heading); font-size: 0.6rem; color: var(--bg); }
  .rail-live { width: 6px; height: 6px; border-radius: 50%; background: var(--success-soft); margin-left: auto; }
  .rail-empty { color: var(--text-light); font-size: 0.8rem; font-style: italic; }
  .rail-foot { margin-top: auto; display: flex; flex-direction: column; gap: var(--space-xs); border-top: 1px solid var(--border-light); padding-top: var(--space-sm); }
  .foot-item { font-size: 0.8rem; color: var(--text-secondary); background: none; border: 0; text-align: left; cursor: pointer; text-decoration: none; padding: 0.2rem 0; }
  .foot-item.active, .foot-item:hover { color: var(--text); }
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/platform && bun run typecheck`
Expected: PASS. Fix any name mismatch (`launchVisibleApps`/`openAppIds`/`openApp`/`goto`) by grepping the file for the actual local identifiers and aligning.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/routes/workspace/+page.svelte
git commit -m "feat(workspace): adaptive Open/Pinned/Recent rail switcher"
```

---

### Task 12: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Health gate**

Run: `cd /Users/devante/Documents/Shippie && bun run typecheck && bun run test`
Expected: green (including the new `rail-groups.test.ts`). Note: `bun run build` is user-run (sandbox blocks it) — flag to the user to run `! bun run build` and `! bun run deploy` themselves.

- [ ] **Step 2: Route smoke (dev server)**

Run:
```bash
for p in "/" "/container" "/apps?q=tea" "/workspace?section=home" "/tools"; do
  curl -s -o /dev/null -w "%{http_code} %{redirect_url}  <- $p\n" "http://localhost:4101$p"
done
```
Expected: `/`→307 `/workspace`; `/container`→308 `/workspace`; `/apps?q=tea`→301 `/tools?q=tea`; `/workspace?section=home`→200; `/tools`→200.

- [ ] **Step 3: Visual smoke (headless CDP, per repo tooling `/tmp/cdpshot.mjs`)**

Run:
```bash
node /tmp/cdpshot.mjs "http://localhost:4101/workspace?section=home" 1440 900 /tmp/ws-desktop.png 4500
node /tmp/cdpshot.mjs "http://localhost:4101/workspace?section=home" 390 844 /tmp/ws-mobile.png 4500
```
Inspect: desktop shows the **Workspace** rail (header + adaptive groups + foot), not the old marketing headline; root visit lands here (no catalog wall). Mobile still functions (full mobile posture is Phase 4). Clean up chrome afterwards (`pkill -f "Google Chrome for Testing"; rm -rf /tmp/cdp-*`).

- [ ] **Step 4: Final commit / handoff**

No new code. Confirm `git status` shows only the intended files; hand the branch to the user for merge + `bun run build && bun run deploy`.

---

## Self-review (completed by plan author)

- **Spec coverage:** §4 routing → Tasks 2,3,5,6,7; state sources → Task 1 (selector) + Task 11 (wiring, cached-slugs excluded); §5 adaptive rail → Tasks 1,11; §10 Phase 1 incl. PWA → Tasks 8,9,10; `/apps`+SearchBar compat → Tasks 3,4. (Empty-state hero, resume strip, mobile posture, category colors = Phases 2–5, out of scope here — by design.)
- **Placeholder scan:** none. Where a local identifier can't be known without reading the 3,800-line page (`launchVisibleApps`, `openApp`, `goto`), the step gives the exact grep to resolve it and a concrete fallback — not a "TODO".
- **Type consistency:** `RailTool` / `RailGroups` / `buildRailGroups` signatures match between Task 1 and Task 11; `launcher-memory` fields (`pinned`, `recents[].lastOpened`) match the real store.

## Out of scope (later phases, separate plans)
- Phase 2: resume/insight strip + collapse-to-badge.
- Phase 3: empty-state hero + curated starters.
- Phase 4: mobile Today + dock (Today·Tools·You) + `switcher.ts` store + full-screen tool.
- Phase 5: `categoryColorFamily()` color-coding + retire the Updates box + one-hierarchy cleanup.
