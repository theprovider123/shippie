# Workspace Phase 3 — First-Run Empty State — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** When the device has no tools yet, the workspace canvas shows a **small, operational** first-run state — a slim hero band, a few curated starters, and "Browse all N tools →" — instead of the populated dashboard. This completes the new front door for first-time users (the catalog already moved to `/tools` in Phase 1).

**Architecture:** A pure `pickStarters` selector chooses the curated starter set; a `WorkspaceEmptyState.svelte` component renders the hero + starters + browse link; `workspace/+page.svelte` renders it instead of `<DashboardHome>` when the home section is shown and the workspace is empty (reusing the Phase 1 `railGroups` empty condition).

**Tech Stack:** SvelteKit, Svelte 5 runes, vitest (apps/platform vitest-only). Builds on the merged `9501b7db` (Phase 1+2 + codex coherence).

**Source spec:** `docs/superpowers/specs/2026-06-01-workspace-redesign-design.md` §4 (first-run = always-the-workspace) + §5 State 2 (empty state). User nuance: *"keep the empty-state hero small and operational, not marketing-page sized — a workspace that happens to be empty."*

---

## Pre-flight
- At implementation time, branch from the **current** `review-implementation-2026-05-23` tip (codex may have advanced it). Build in the worktree; reconcile/FF as in prior phases. Commit each task with scoped `git add`.
- Reuse from earlier phases: `railGroups` (Phase 1, gives open/pinned/recent), `openApp(appId)` / `openRailTool(slug)`, `launchVisibleApps` (ContainerApp[]), `curatedAppsByTier` (`state.ts:1171`), `PUBLIC_FLAGSHIP_SLUGS` (`_generated/first-party-curation.ts` — the flagship slate; empty only in an un-baked worktree).
- The empty condition is exactly the rail's "No tools yet" branch: `railGroups.open.length === 0 && railGroups.pinned.length === 0 && railGroups.recent.length === 0`.

## File structure
| File | Responsibility | Action |
|---|---|---|
| `src/lib/container/starters.ts` | Pure: pick the curated starter set | Create |
| `src/lib/container/starters.test.ts` | Unit tests | Create |
| `src/lib/container/WorkspaceEmptyState.svelte` | Hero + starters + browse-all | Create |
| `src/routes/workspace/+page.svelte` | Render empty state when home + empty | Modify |

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

### Task 3: Wire into the workspace home

**Files:** Modify `src/routes/workspace/+page.svelte`.

- [ ] **Step 1: script** — near the Phase 1 rail block, add:

```ts
  import WorkspaceEmptyState from '$lib/container/WorkspaceEmptyState.svelte';
  import { pickStarters } from '$lib/container/starters';
  import { curatedAppsByTier } from '$lib/container/state';
  import { PUBLIC_FLAGSHIP_SLUGS } from '$lib/_generated/first-party-curation';

  const workspaceEmpty = $derived(
    railGroups.open.length === 0 && railGroups.pinned.length === 0 && railGroups.recent.length === 0,
  );
  const starterApps = $derived(pickStarters(launchVisibleApps, PUBLIC_FLAGSHIP_SLUGS, 4));
```
(`launchVisibleApps` and `railGroups` already exist from Phase 1. If `curatedAppsByTier` is preferred over `launchVisibleApps` as the starter pool, swap the first arg — but `launchVisibleApps` already excludes hidden/private apps and is what the rail uses, so keep it for consistency.)

- [ ] **Step 2: markup** — replace the `{#if section === 'home'}` → `<DashboardHome … />` block's open so the empty state wins when there are no tools:

```svelte
        {#if section === 'home'}
          {#if workspaceEmpty}
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

### Task 4: Verify
- [ ] `bunx vitest run src/lib/container/starters.test.ts` → 5/5.
- [ ] Full suite: failures unchanged from the merged baseline (no-bake set only); no new failures attributable to these files.
- [ ] CDP (worktree dev server, fresh `--user-data-dir` so launcher-memory is empty → workspace is empty): screenshot `/workspace?section=home` desktop + mobile — confirm the hero band + starters + "Browse all" render, slim and operational, and that opening a starter focuses the tool (rail flips to Open). Note: in an un-baked worktree, `launchVisibleApps` is sparse but non-empty (D1 seeds), so starters fall back to the catalog head — enough to verify layout.

## Notes
- This is the only place spec §8 sanctions `--paper-warm` (the hero band); the rest of the workspace stays dark.
- Populated users are unaffected — `DashboardHome` renders exactly as before when `workspaceEmpty` is false.
- The empty condition reuses `railGroups`, so the rail's "No tools yet" and the canvas hero appear together, consistently.

## Out of scope (later phases)
- Phase 4: mobile Today/dock/switcher (the empty state will also drive the mobile Today screen, but the mobile posture itself is Phase 4).
- Phase 5: category color-coding (`categoryColorFamily`) + retire the Updates box + one-hierarchy cleanup. Starter monogram colors adopt the category palette then.
