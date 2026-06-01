# Workspace Phase 3 — First-Run Empty State — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** When the device has no tools yet, the workspace canvas shows a **small, operational** first-run state — a slim hero band, a few curated starters, and "Browse all N tools →" — instead of the populated dashboard. This completes the new front door for first-time users (the catalog already moved to `/tools` in Phase 1).

**Architecture:** A pure `pickStarters` selector chooses the curated starter set; a `WorkspaceEmptyState.svelte` component renders the hero + starters + browse link; `workspace/+page.svelte` renders it instead of `<DashboardHome>` when the home section is shown and the workspace is empty (reusing the Phase 1 `railGroups` empty condition). **Critically, the boot path is changed first** so an organic (non-focused, unrequested) first-run leaves no active tool open — otherwise the shell's `defaultAppId` auto-open makes the empty state unreachable.

**Tech Stack:** SvelteKit, Svelte 5 runes, vitest (apps/platform vitest-only). Builds on the merged `9501b7db` (Phase 1+2 + codex coherence).

**Source spec:** `docs/superpowers/specs/2026-06-01-workspace-redesign-design.md` §4 (first-run = always-the-workspace) + §5 State 2 (empty state). User nuance: *"keep the empty-state hero small and operational, not marketing-page sized — a workspace that happens to be empty."*

---

## Pre-flight
- At implementation time, branch from the **current** `review-implementation-2026-05-23` tip (codex may have advanced it). Build in the worktree; reconcile/FF as in prior phases. Commit each task with scoped `git add`.
- Reuse from earlier phases: `railGroups` (Phase 1, gives open/pinned/recent), `openApp(appId)` / `openRailTool(slug)`, `launchVisibleApps` (ContainerApp[]), `PUBLIC_FLAGSHIP_SLUGS` (`_generated/first-party-curation.ts` — the flagship slate; empty only in an un-baked worktree).
- **Hydration-flicker guard:** `launcherMemory` is `DEFAULT_MEMORY` (empty) until `hydrateLauncherMemory()` runs in `onMount`, so `workspaceEmpty` is briefly true on first paint even for returning users → would flash the first-run hero. Gate the home content on a `launcherHydrated` flag so the empty/populated decision only renders after local state settles.
- The empty condition is exactly the rail's "No tools yet" branch: `railGroups.open.length === 0 && railGroups.pinned.length === 0 && railGroups.recent.length === 0`.

## File structure
| File | Responsibility | Action |
|---|---|---|
| `src/lib/container/starters.ts` | Pure: pick the curated starter set | Create |
| `src/lib/container/starters.test.ts` | Unit tests | Create |
| `src/lib/container/WorkspaceEmptyState.svelte` | Hero + starters + browse-all | Create |
| `src/routes/workspace/+page.svelte` | Boot path (organic first-run = no active tool) + render empty state when home + empty | Modify |

---

### Task 1: Pure `pickStarters` selector

**Files:** Create `src/lib/container/starters.ts` + `starters.test.ts`.

Prefer flagship-tier tools (in flagship order), then fill to `limit` with the remaining catalog order; never duplicate; cap at `limit`. Generic + pure so it's framework-free and testable, and so it degrades gracefully when the flagship slate is empty (un-baked worktree) by falling back to the catalog head.

- [ ] **Step 1: failing test**

```ts
// src/lib/container/starters.test.ts
import { describe, expect, it } from 'vitest';
import { pickStarters } from './starters';

const cat = (slug: string) => ({ slug });
const catalog = ['palate', 'chiwit', 'lift', 'golazo', 'tab', 'journal'].map(cat);

describe('pickStarters', () => {
  it('prefers flagship slugs, in flagship order', () => {
    const out = pickStarters(catalog, ['lift', 'palate'], 4);
    expect(out.slice(0, 2).map((a) => a.slug)).toEqual(['lift', 'palate']);
    expect(out).toHaveLength(4);
  });

  it('fills the remainder from catalog order without duplicating flagship picks', () => {
    const out = pickStarters(catalog, ['lift'], 3);
    expect(out.map((a) => a.slug)).toEqual(['lift', 'palate', 'chiwit']);
  });

  it('ignores flagship slugs not present in the catalog', () => {
    const out = pickStarters(catalog, ['ghost', 'palate'], 2);
    expect(out.map((a) => a.slug)).toEqual(['palate', 'chiwit']);
  });

  it('falls back to the catalog head when no flagship slugs (un-baked)', () => {
    const out = pickStarters(catalog, [], 3);
    expect(out.map((a) => a.slug)).toEqual(['palate', 'chiwit', 'lift']);
  });

  it('never returns more than limit, and tolerates a short catalog', () => {
    expect(pickStarters(catalog.slice(0, 2), [], 4).map((a) => a.slug)).toEqual(['palate', 'chiwit']);
  });
});
```

- [ ] **Step 2:** `bunx vitest run src/lib/container/starters.test.ts` → FAIL (no module).

- [ ] **Step 3: implementation**

```ts
// src/lib/container/starters.ts
/**
 * Curated first-run starters (spec §5 State 2). Pure + generic. Flagship
 * tools first (in flagship order), then fill from catalog order. Degrades
 * to the catalog head when the flagship slate is empty (un-baked worktree).
 */
export function pickStarters<T extends { slug: string }>(
  catalog: readonly T[],
  flagshipSlugs: readonly string[],
  limit: number,
): T[] {
  const bySlug = new Map(catalog.map((a) => [a.slug, a]));
  const picked: T[] = [];
  const seen = new Set<string>();
  for (const slug of flagshipSlugs) {
    const app = bySlug.get(slug);
    if (app && !seen.has(slug)) {
      picked.push(app);
      seen.add(slug);
      if (picked.length >= limit) return picked;
    }
  }
  for (const app of catalog) {
    if (!seen.has(app.slug)) {
      picked.push(app);
      seen.add(app.slug);
      if (picked.length >= limit) return picked;
    }
  }
  return picked;
}
```

- [ ] **Step 4:** test → 5/5 PASS. **Step 5:** commit `feat(workspace): pure pickStarters selector for first-run`.

---

### Task 2: `WorkspaceEmptyState.svelte`

**Files:** Create `src/lib/container/WorkspaceEmptyState.svelte`.

Slim hero band (eyebrow + title + one line; `--paper-warm` — the one place spec §8 allows it), a "Start with these" row of starter tiles (monogram + name + blurb, wired to `onOpen`), and a "Browse all N tools →" link to `/tools`. Sharp corners, tokens only.

```svelte
<script lang="ts">
  import type { ContainerApp } from './state';
  import { initials } from './state';

  interface Props {
    starters: ContainerApp[];
    totalCount: number;
    onOpen: (app: ContainerApp) => void;
  }
  let { starters, totalCount, onOpen }: Props = $props();
</script>

<div class="ws-empty">
  <div class="hero">
    <p class="hero-eyebrow">Wrap · Run · Connect</p>
    <h2 class="hero-title">Your private workspace for local tools</h2>
    <p class="hero-sub">Everything local. No account needed.</p>
  </div>

  {#if starters.length > 0}
    <p class="starters-label">Start with these</p>
    <div class="starters">
      {#each starters as app (app.slug)}
        <button class="starter" onclick={() => onOpen(app)}>
          <span class="starter-icon" style="background:{app.accent}">{app.icon ?? initials(app.name)}</span>
          <span class="starter-text">
            <span class="starter-name">{app.name}</span>
            {#if app.description}<span class="starter-blurb">{app.description}</span>{/if}
          </span>
        </button>
      {/each}
    </div>
  {/if}

  <a class="browse-all" href="/tools">Browse all {totalCount} tools →</a>
</div>

<style>
  .ws-empty { display: flex; flex-direction: column; gap: var(--space-lg); padding: var(--space-lg) 0; }
  .hero { background: var(--paper-warm, #FAF7EF); border: 1px solid var(--border-light); padding: var(--space-md) var(--space-lg); }
  .hero-eyebrow { font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--sunset); margin: 0 0 var(--space-xs); }
  .hero-title { font-family: var(--font-heading); font-size: 1.25rem; color: var(--ink-warm, #2A251E); margin: 0; }
  .hero-sub { font-size: 0.8rem; color: var(--text-muted-warm, #8B847A); margin: var(--space-xs) 0 0; }
  .starters-label { font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-light); margin: 0; }
  .starters { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-sm); }
  .starter { display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-sm); border: 1px solid var(--border); background: var(--surface); text-align: left; cursor: pointer; }
  .starter:hover { background: var(--surface-alt); }
  .starter-icon { width: 32px; height: 32px; flex: none; display: flex; align-items: center; justify-content: center; font-family: var(--font-heading); font-size: 0.8rem; color: var(--bg); }
  .starter-text { display: flex; flex-direction: column; min-width: 0; }
  .starter-name { color: var(--text); font-size: 0.85rem; }
  .starter-blurb { color: var(--text-light); font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .browse-all { color: var(--sunset); font-size: 0.85rem; }
</style>
```

- [ ] Commit `feat(workspace): WorkspaceEmptyState (hero + starters + browse)`.

---

### Task 3: Boot path — organic first-run lands empty (UNBLOCKS the empty state)

**Files:** Modify `src/routes/workspace/+page.svelte` (`onMount`, ≈lines 2681–2697).

**Why this is required:** the empty state lives inside `{#if !activeApp}`, but the current shell auto-opens `defaultAppId` (`= merged.defaultAppId`, line 198) on a fresh device, so `activeApp` is always set and the empty state is unreachable. The redesign's premise is first-run = empty workspace, so the `defaultAppId` auto-open is exactly the legacy behavior to drop — **only** for the organic (non-focused, non-requested, no-saved-open) case. Preserve focused `/run`, `?app=` requested, and saved-open restore.

Two edits:

- [ ] **Step 1:** In the saved-state branch, drop the `defaultAppId` fallback. Change:
  ```ts
        : savedOpenApps.length > 0 ? savedOpenApps : defaultAppId ? [defaultAppId] : [];
  ```
  to:
  ```ts
        : savedOpenApps.length > 0 ? savedOpenApps : [];
  ```
  (Focused still maps to `requestedApp ? [requestedApp.id] : []`; a returning user's saved open apps still restore.)

- [ ] **Step 2:** Remove the no-saved-state default-open block so a fresh device starts empty. Delete:
  ```ts
    } else if (defaultAppId) {
      const defaultApp = appById.get(defaultAppId);
      openAppIds = [defaultAppId];
      receiptsByApp = defaultApp ? { [defaultAppId]: createReceiptFor(defaultApp) } : {};
      activeAppId = defaultAppId;
    }
  ```
  Leave the `if (saved) { … }` with no `else`. A fresh device then keeps `openAppIds = []` (its `$state` initial) and `activeAppId = null`; the existing `else if (!activeAppId || !appById.has(activeAppId)) { activeAppId = openAppIds[0] ?? null; }` (≈line 2711) resolves `activeAppId` to `null`. The `if (requestedApp) { … openApp(requestedApp.id); }` block (≈2698) still opens `?app=`/`/run` requests, so those paths are unaffected.

- [ ] **Step 3:** `bun run typecheck` PASS. If `defaultAppId` becomes unused after these edits, leave the `$derived` (it's cheap) or remove it if svelte-check flags it unused.

- [ ] **Step 4:** commit `fix(workspace): organic first-run lands on the empty workspace, not a default tool`.

---

### Task 4: Wire into the workspace home

**Files:** Modify `src/routes/workspace/+page.svelte`.

- [ ] **Step 1: script** — near the Phase 1 rail block, add:

```ts
  import WorkspaceEmptyState from '$lib/container/WorkspaceEmptyState.svelte';
  import { pickStarters } from '$lib/container/starters';
  import { PUBLIC_FLAGSHIP_SLUGS } from '$lib/_generated/first-party-curation';

  let launcherHydrated = $state(false);
  const workspaceEmpty = $derived(
    railGroups.open.length === 0 && railGroups.pinned.length === 0 && railGroups.recent.length === 0,
  );
  const starterApps = $derived(pickStarters(launchVisibleApps, PUBLIC_FLAGSHIP_SLUGS, 4));
```
Then in the existing `onMount`, set the flag right after the existing `hydrateLauncherMemory()` call (line ≈2666): add `launcherHydrated = true;`. (`launchVisibleApps` and `railGroups` already exist from Phase 1. Use `launchVisibleApps` as the starter pool — it already excludes hidden/private apps and is what the rail uses. Do **not** import `curatedAppsByTier`; it's unused here.)

- [ ] **Step 2: markup** — replace the `{#if section === 'home'}` → `<DashboardHome … />` block's open so the empty state wins when there are no tools:

```svelte
        {#if section === 'home'}
          {#if !launcherHydrated}
            <!-- brief neutral panel until local tool state hydrates; prevents a
                 first-run-hero flash for returning users (launcherMemory is empty
                 on first paint until hydrateLauncherMemory runs in onMount) -->
            <div class="hydrating-panel" aria-busy="true"></div>
          {:else if workspaceEmpty}
            <WorkspaceEmptyState
              starters={starterApps}
              totalCount={launchVisibleApps.length}
              onOpen={(app) => openApp(app.id)}
            />
          {:else}
            <DashboardHome
              insights={agentInsights}
              apps={launchVisibleApps}
              {openAppIds}
              {updateCards}
              {meshStatus}
              {meshJoinCodeInput}
              {meshError}
              onOpenInsight={openInsight}
              onDismissInsight={dismissInsight}
              onOpenApp={openApp}
              onStayOnCurrent={stayOnCurrent}
              onAcceptUpdate={acceptUpdate}
              onCreateMeshRoom={createMeshRoom}
              onJoinMeshRoom={joinMeshRoom}
              onLeaveMeshRoom={leaveMeshRoom}
              onMeshJoinCodeChange={(value) => (meshJoinCodeInput = value)}
            />
          {/if}
```
(Keep the existing `<DashboardHome …>` prop list verbatim — only wrap it in the `{:else}`. Close the new `{/if}` before the existing `{:else if section === 'create'}`.)

- [ ] **Step 3:** `bun run typecheck` PASS. **Step 4:** commit `feat(workspace): first-run empty state in the home canvas`.

---

### Task 5: Verify
- [ ] `bunx vitest run src/lib/container/starters.test.ts` → 5/5.
- [ ] Full suite: failures unchanged from the merged baseline (no-bake set only); no new failures attributable to these files.
- [ ] **Boot-path proof (both state sources must be clear).** First-run depends on *two* localStorage keys: `shippie:launcher:v1` (launcher-memory — pinned/recents) and `shippie.container.v1` (`STORAGE_KEY`, `state.ts:135` — saved open apps). A fresh `--user-data-dir` clears both. CDP against the worktree dev server, `/workspace?section=home`:
  - **Assert BEFORE screenshot** (via `Runtime.evaluate`): the page has **no active-tool iframe and no `OPEN IN SHIPPIE` topbar** (e.g. `document.querySelector('iframe') === null` and the topbar shows the section title, not an app name) **and** the empty-state hero is present (`document.querySelector('.ws-empty .hero-title') !== null`). If an iframe/app topbar is present, the boot-path fix (Task 3) regressed — stop and fix.
  - Then screenshot desktop + mobile — confirm hero band + "Start with these" starters + "Browse all N tools →" render slim and operational; confirm clicking a starter focuses the tool (rail flips to Open, hero replaced by the tool).
  - (Returning-user check: with a non-empty `shippie:launcher:v1` but empty open apps, `workspaceEmpty` is false → `DashboardHome` shows, not the hero. Confirm the newcomer hero is genuinely first-run-only.)
  - Note: in an un-baked worktree `launchVisibleApps` is sparse but non-empty (D1 seeds), so starters fall back to the catalog head — enough to verify layout.

## Notes
- This is the only place spec §8 sanctions `--paper-warm` (the hero band); the rest of the workspace stays dark.
- Populated users are unaffected — `DashboardHome` renders exactly as before when `workspaceEmpty` is false.
- The empty condition reuses `railGroups`, so the rail's "No tools yet" and the canvas hero appear together, consistently.

## Out of scope (later phases)
- Phase 4: mobile Today/dock/switcher (the empty state will also drive the mobile Today screen, but the mobile posture itself is Phase 4).
- Phase 5: category color-coding (`categoryColorFamily`) + retire the Updates box + one-hierarchy cleanup. Starter monogram colors adopt the category palette then.
