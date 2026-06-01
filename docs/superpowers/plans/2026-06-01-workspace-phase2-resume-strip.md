# Workspace Phase 2 — Resume / Insight Strip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A slim, dismissible, **actionable-only** strip in the workspace canvas — directly above the active tool — that surfaces the single strongest item (a cross-tool insight, else a resume hint). Nothing actionable → it disappears. Dismissed → it collapses to a small badge in the topbar.

**Architecture:** A pure selector (`canvas-strip.ts`) chooses the one item from the existing `agentInsights` pipeline + `launcher-memory.recents`; a small `CanvasStrip.svelte` renders it; the workspace page mounts it after the topbar (`+page.svelte:3289`) when a tool is active, reusing the existing `dismissInsight` flow plus a session dismiss for resume.

**Tech Stack:** SvelteKit, Svelte 5 runes, vitest (apps/platform vitest-only). Builds on `workspace-phase1`.

**Source spec:** `docs/superpowers/specs/2026-06-01-workspace-redesign-design.md` §7.

---

## Pre-flight
- Continue on branch `workspace-phase1` in worktree `/Users/devante/Documents/Shippie-ws-wt` (Phase 2 stacks on Phase 1; the whole stack merges once the main tree is clean).
- `Insight` (from `@shippie/agent`): `{ id, strategy, urgency: 'high'|'medium'|'low', title, body, target: { app, route?, query? }, expiresAt?, generatedAt, provenance }`.
- Reuse: `agentInsights` (workspace page `$derived`, line 606), `dismissInsight(insight)` (647), `openInsight(insight)` (643), `$launcherMemory.recents`, `launchVisibleAppBySlug`, `openRailTool(slug)`.

## File structure
| File | Responsibility | Action |
|---|---|---|
| `src/lib/container/canvas-strip.ts` | Pure: pick the one strongest actionable strip item | Create |
| `src/lib/container/canvas-strip.test.ts` | Unit tests | Create |
| `src/lib/container/CanvasStrip.svelte` | Slim one-item strip (open + dismiss) | Create |
| `src/routes/workspace/+page.svelte` | Derive item, mount after topbar, dismiss + badge | Modify |

---

### Task 1: Pure strip selector

**Files:** Create `src/lib/container/canvas-strip.ts` + `canvas-strip.test.ts`.

Rules (spec §7): one item, actionable-only, insight beats resume.
- Drop insights that are expired (`expiresAt != null && expiresAt < now`) or whose `id ∈ dismissedIds`.
- If any insight remains → strongest = highest urgency (`high>medium>low`), tie-break newest `generatedAt`. Return `{ id, kind: 'insight', title, body, targetSlug: insight.target.app, remaining }`.
- Else resume: the newest `recents` entry whose slug ≠ `activeSlug`, not in `openSlugs`, in the catalog, and `resume:<slug>` ∉ `dismissedIds`. Return `{ id: 'resume:<slug>', kind: 'resume', title: 'Resume ' + name, body: '', targetSlug: slug, remaining }`.
- Else `null`.
- `remaining` = count of *other* actionable insights not shown (for the badge).

- [ ] **Step 1: failing test**

```ts
// src/lib/container/canvas-strip.test.ts
import { describe, expect, it } from 'vitest';
import { selectCanvasStripItem } from './canvas-strip';

const insight = (id: string, urgency: 'high' | 'medium' | 'low', app: string, generatedAt = 1000) => ({
  id, strategy: 's', urgency, title: id, body: 'b',
  target: { app }, generatedAt, provenance: [] as string[],
});
const catalog = [{ slug: 'palate', name: 'Palate' }, { slug: 'lift', name: 'Lift' }, { slug: 'chiwit', name: 'Chiwit' }];

describe('selectCanvasStripItem', () => {
  it('returns null when nothing is actionable', () => {
    expect(selectCanvasStripItem({ insights: [], recents: [], catalog, activeSlug: null, openSlugs: [], dismissedIds: new Set(), now: 0 })).toBeNull();
  });

  it('picks the highest-urgency insight and counts the rest as remaining', () => {
    const item = selectCanvasStripItem({
      insights: [insight('a', 'low', 'lift'), insight('b', 'high', 'palate'), insight('c', 'medium', 'chiwit')],
      recents: [], catalog, activeSlug: null, openSlugs: [], dismissedIds: new Set(), now: 0,
    });
    expect(item).toMatchObject({ id: 'b', kind: 'insight', targetSlug: 'palate', remaining: 2 });
  });

  it('drops expired and dismissed insights', () => {
    const item = selectCanvasStripItem({
      insights: [{ ...insight('old', 'high', 'lift'), expiresAt: 50 }, insight('seen', 'high', 'palate')],
      recents: [], catalog, activeSlug: null, openSlugs: [], dismissedIds: new Set(['seen']), now: 100,
    });
    expect(item).toBeNull();
  });

  it('falls back to a resume hint for the newest non-active, non-open recent', () => {
    const item = selectCanvasStripItem({
      insights: [], catalog,
      recents: [{ slug: 'palate', lastOpened: '2026-06-01T08:00:00Z' }, { slug: 'lift', lastOpened: '2026-06-01T09:00:00Z' }],
      activeSlug: 'lift', openSlugs: ['lift'], dismissedIds: new Set(), now: 0,
    });
    expect(item).toMatchObject({ id: 'resume:palate', kind: 'resume', title: 'Resume Palate', targetSlug: 'palate' });
  });

  it('hides a dismissed resume hint', () => {
    const item = selectCanvasStripItem({
      insights: [], catalog,
      recents: [{ slug: 'palate', lastOpened: '2026-06-01T08:00:00Z' }],
      activeSlug: null, openSlugs: [], dismissedIds: new Set(['resume:palate']), now: 0,
    });
    expect(item).toBeNull();
  });
});
```

- [ ] **Step 2:** `bunx vitest run src/lib/container/canvas-strip.test.ts` → FAIL (no module).

- [ ] **Step 3: implementation**

```ts
// src/lib/container/canvas-strip.ts
/**
 * Canvas resume/insight strip selector (spec §7). Pure + framework-free.
 * One item, actionable-only: a cross-tool insight beats a resume hint.
 */
import type { Insight } from '@shippie/agent';

export interface CanvasStripItem {
  id: string;
  kind: 'insight' | 'resume';
  title: string;
  body: string;
  targetSlug: string;
  remaining: number;
}

const URGENCY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

export function selectCanvasStripItem(input: {
  insights: readonly Insight[];
  recents: { slug: string; lastOpened: string }[];
  catalog: { slug: string; name: string }[];
  activeSlug: string | null;
  openSlugs: string[];
  dismissedIds: Set<string>;
  now: number;
}): CanvasStripItem | null {
  const live = input.insights.filter(
    (i) => !input.dismissedIds.has(i.id) && !(i.expiresAt != null && i.expiresAt < input.now),
  );
  if (live.length > 0) {
    const sorted = [...live].sort(
      (a, b) => (URGENCY_RANK[b.urgency] ?? 0) - (URGENCY_RANK[a.urgency] ?? 0) || b.generatedAt - a.generatedAt,
    );
    const top = sorted[0]!;
    return { id: top.id, kind: 'insight', title: top.title, body: top.body, targetSlug: top.target.app, remaining: sorted.length - 1 };
  }

  const open = new Set(input.openSlugs);
  const bySlug = new Map(input.catalog.map((c) => [c.slug, c]));
  const resume = [...input.recents]
    .sort((a, b) => (a.lastOpened < b.lastOpened ? 1 : -1))
    .find(
      (r) => r.slug !== input.activeSlug && !open.has(r.slug) && bySlug.has(r.slug) && !input.dismissedIds.has(`resume:${r.slug}`),
    );
  if (resume) {
    const name = bySlug.get(resume.slug)!.name;
    return { id: `resume:${resume.slug}`, kind: 'resume', title: `Resume ${name}`, body: '', targetSlug: resume.slug, remaining: 0 };
  }
  return null;
}
```

- [ ] **Step 4:** test → 5/5 PASS. **Step 5:** commit `feat(workspace): canvas resume/insight strip selector`.

---

### Task 2: CanvasStrip component

**Files:** Create `src/lib/container/CanvasStrip.svelte`.

```svelte
<script lang="ts">
  import type { CanvasStripItem } from './canvas-strip';
  interface Props { item: CanvasStripItem; onOpen: (item: CanvasStripItem) => void; onDismiss: (item: CanvasStripItem) => void; }
  let { item, onOpen, onDismiss }: Props = $props();
</script>

<div class="canvas-strip" role="region" aria-label="Suggestion">
  <button class="strip-body" onclick={() => onOpen(item)}>
    <span class="strip-mark">{item.kind === 'resume' ? '↻' : '◆'}</span>
    <span class="strip-title">{item.title}</span>
    {#if item.body}<span class="strip-sub">{item.body}</span>{/if}
  </button>
  {#if item.remaining > 0}<span class="strip-more">+{item.remaining}</span>{/if}
  <button class="strip-x" aria-label="Dismiss" title="Dismiss" onclick={() => onDismiss(item)}>×</button>
</div>

<style>
  .canvas-strip { display: flex; align-items: center; gap: var(--space-sm); padding: 6px 12px; background: var(--sunset-glow, rgba(232,96,60,0.08)); border-bottom: 1px solid var(--border-light); font-size: 0.8rem; color: var(--text-secondary); }
  .strip-body { display: flex; align-items: center; gap: var(--space-sm); flex: 1; background: none; border: 0; text-align: left; cursor: pointer; color: inherit; padding: 0; }
  .strip-mark { color: var(--sunset); }
  .strip-title { color: var(--text); font-weight: 500; }
  .strip-sub { color: var(--text-light); }
  .strip-more { font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-light); border: 1px solid var(--border-light); padding: 0 6px; }
  .strip-x { margin-left: auto; background: none; border: 0; color: var(--text-light); cursor: pointer; font-size: 0.95rem; line-height: 1; }
  .strip-x:hover { color: var(--text); }
</style>
```

- [ ] Commit `feat(workspace): CanvasStrip slim one-item component`.

---

### Task 3: Wire into the workspace canvas

**Files:** Modify `src/routes/workspace/+page.svelte`.

- [ ] **Step 1: script** — add import, dismissed-set state, derived item, handlers (place near the rail derived block from Phase 1):

```ts
  import CanvasStrip from '$lib/container/CanvasStrip.svelte';
  import { selectCanvasStripItem, type CanvasStripItem } from '$lib/container/canvas-strip';

  let stripDismissed = $state<Set<string>>(new Set());
  let stripCollapsed = $state(false);
  const canvasStripItem = $derived(
    selectCanvasStripItem({
      insights: agentInsights,
      recents: $launcherMemory.recents,
      catalog: railCatalog.map((t) => ({ slug: t.slug, name: t.name })),
      activeSlug: activeApp?.slug ?? null,
      openSlugs: railOpenSlugs,
      dismissedIds: stripDismissed,
      now: Date.now(),
    }),
  );
  function openStrip(item: CanvasStripItem) {
    if (item.kind === 'insight') {
      const ins = agentInsights.find((i) => i.id === item.id);
      if (ins) { openInsight(ins); return; }
    }
    openRailTool(item.targetSlug);
  }
  function dismissStrip(item: CanvasStripItem) {
    if (item.kind === 'insight') {
      const ins = agentInsights.find((i) => i.id === item.id);
      if (ins) dismissInsight(ins);
    }
    stripDismissed = new Set([...stripDismissed, item.id]);
    stripCollapsed = true;
  }
```

- [ ] **Step 2: markup** — after the topbar's closing `</div>` (line 3289), before `{#if !activeApp}`:

```svelte
    {#if activeApp && canvasStripItem && !stripCollapsed}
      <CanvasStrip item={canvasStripItem} onOpen={openStrip} onDismiss={dismissStrip} />
    {:else if activeApp && canvasStripItem && stripCollapsed}
      <button class="canvas-strip-badge" onclick={() => (stripCollapsed = false)} aria-label="Show suggestion">●</button>
    {/if}
```

- [ ] **Step 3: style** — append near the rail styles:

```css
  .canvas-strip-badge { align-self: flex-start; margin: 4px 0 0 12px; background: none; border: 0; color: var(--sunset); cursor: pointer; font-size: 0.7rem; }
```

- [ ] **Step 4:** `bun run typecheck` PASS. **Step 5:** commit `feat(workspace): mount resume/insight strip above the active tool`.

## Notes
- `Date.now()` is fine in the live Svelte component (it's the runtime page; not a workflow script).
- Strip shows only when a tool is active (above it). On the home dashboard, `InsightStrip` inside `DashboardHome` already surfaces insights — unchanged.
- Dismiss reuses the 7-day `dismissInsight` persistence for insights; resume dismiss is session-only via `stripDismissed`.

## Out of scope (later phases)
- Phase 3 empty-state hero + catalog onboarding; Phase 4 mobile Today/dock/switcher; Phase 5 category colors + retire Updates box.
