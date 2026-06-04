# Dock / Tools / Drawer Harmonization — Design Spec

> **Status:** contract-frozen. Sprint 1 may not start until this doc is approved.
> **Author:** Claude (Opus 4.8) · **Date:** 2026-06-04 · **Branch:** `feat/dock-harmonization`
> **Origin:** tightening of Codex's 8-phase harmonization plan, grounded against HEAD.

## 1. Problem

The same object — a tool — is described differently by every surface that shows it:

- Dock home sections (`DashboardHome.svelte`) render a tool one way.
- The Dock route's left rail (`dock/+page.svelte` `rail-item`) renders it a second way.
- The Dock route's focused drawer (`focused-tool-row`) renders it a third way.
- The quick-switch drawer (`ToolSwitcherSheet.svelte` `.tool-row`) renders it a fourth way.
- The Tools grid (`tools/+page.svelte`) renders it as a card with launch-management copy.

`ToolTile.svelte` (1005 lines, 3 density branches) is "one component pretending to be every shape." Relationship copy ("Running now" / "Saved to Dock" / "Open now" / "Recent") is hard-coded in **4 files**. Update state, offline state, and relationship are recomputed ad-hoc per surface. This is component drift, and it will keep reappearing until the contract is frozen and enforced.

## 2. Operating model (the product rule)

| Surface | Job | Primitive |
|---|---|---|
| **Dock** | Launch / manage what I already use | `ToolRow` |
| **Tools** | Browse / find new | `ToolCard` (desktop grid), `ToolRow` (mobile list) |
| **Drawer** | Quick switch between tools | `ToolRow` |
| **You** | Account / device / maker / data | (out of scope) |

One tool, one contract, two visual primitives. No third primitive, no per-surface bespoke markup.

## 3. The frozen contract (Phase 0 — build this first, with tests, before any UI)

### 3.1 Static vs dynamic split (the central decision)

Two models with **different lifecycles**, never merged:

- **`ToolDisplay`** — static, adapter-cached. Display fields that don't change on a device tick. Already exists as `ToolTileApp`; rename/extend in place. Computed once by `adapters.ts` (the file's existing perf comment is exactly why this stays separate — we will not re-run `titleCap` on 60+ tiles per reactive tick).
- **`ToolState`** — dynamic, reactive. Per-device state derived by a **pure selector** from stores. Recomputing it on an offline/update tick must NOT touch `ToolDisplay`.

```ts
// tool-surface/types.ts (extend existing ToolTileApp → ToolDisplay)
export interface ToolDisplay {
  slug: string;
  name: string;              // titleCap'd once
  shortDescription: string;  // normalised blurb; may be ''
  category: string | null;
  categoryLabel: string;
  icon: { url: string | null; monogram: string; color: string };
  kind: AppKind | null;
  tier: ToolTier | null;
  badges: PublicCapabilityBadge[];
  connectionBadges: ConnectionDisclosureBadge[];
  firstPartySigned: boolean;
}

// dynamic — reactive selector output
export type Relationship = 'running' | 'recent' | 'saved' | 'catalog';
export type OfflineState  = 'none' | 'saving' | 'ready' | 'needs-refresh' | 'failed';
export type UpdateState   = 'none' | 'update' | 'needs-review';

export interface ToolActions {
  open: boolean;    // always true
  save: boolean;    // add to Dock + ensure offline (idempotent)
  info: boolean;    // open AppInspector
  close: boolean;   // running only
  remove: boolean;  // saved only
  review: boolean;  // updateState !== 'none'
}

export interface ToolState {
  relationship: Relationship;
  offlineState: OfflineState;
  updateState: UpdateState;
  actions: ToolActions;
}
```

### 3.2 The pure selector

```ts
// tool-surface/tool-state.ts (new — pure, unit-tested, no Svelte, no IO)
export interface ToolStateInput {
  slug: string;
  isRunning: boolean;
  savedSlugs: ReadonlySet<string>;
  recentSlugs: ReadonlySet<string>;
  download: AppDownloadState;        // from offline/download-app.ts
  updateSeverity: UpdateSeverity | null; // from container/update-status.ts
  surface: 'dock' | 'tools' | 'drawer';
}
export function toolState(input: ToolStateInput): ToolState;
```

**Relationship** (priority order; a tool can be both saved and running):
`running` if `isRunning` → else `saved` if in `savedSlugs` → else `recent` if in `recentSlugs` → else `catalog`.

**OfflineState** — re-bucket the existing 8-value `AppDownloadState`:

| AppDownloadState | OfflineState |
|---|---|
| `idle` | `none` |
| `requested`, `downloading`, `verifying` | `saving` |
| `saved` | `ready` |
| `partial`, `evicted` | `needs-refresh` |
| `error` | `failed` |

**UpdateState** — collapse the existing 3-value `UpdateSeverity` (do NOT invent a new model):

| UpdateSeverity | UpdateState | Chip label |
|---|---|---|
| `quiet` | `none` | (no chip) |
| `review` | `update` | "Update" |
| `attention` | `needs-review` | "Review" |

**Actions** (derived, surface-aware):
- `open`: always.
- `info`: always.
- `save`: `relationship !== 'saved'` (idempotent — calling save on a saved tool is a no-op, but the button is hidden once saved). On `tools` surface, `save` is allowed (discovery → adopt). The Saved *section* and remove/manage affordances are NOT on Tools.
- `close`: `isRunning`.
- `remove`: `relationship === 'saved'` and `surface !== 'tools'`.
- `review`: `updateState !== 'none'`.

### 3.3 Single source of copy

```ts
// tool-surface/labels.ts (new — the ONLY place these strings live)
export function relationshipLabel(r: Relationship): string {
  switch (r) {
    case 'running': return 'Open now';
    case 'recent':  return 'Recent';
    case 'saved':   return 'Saved';
    case 'catalog': return '';
  }
}
export function updateChipLabel(u: UpdateState): string | null {
  switch (u) {
    case 'update':       return 'Update';
    case 'needs-review': return 'Review';
    case 'none':         return null;
  }
}
```

The literals `Open now`, `Saved`, `Saved to Dock`, `Running now`, `Recent`, `Update`, `Review` may appear in **no other** `.svelte` or surface file. Enforced by CI grep (§7).

### 3.4 Save semantics (locked product decision)

**`save` always means: add to Dock AND ensure offline.** No separate pin / favorite / offline maze.

- One handler: `saveAppToDock(slug)` + `ensureAppOffline(slug)`.
- Partial failure is surfaced via `offlineState` (`saving` → `ready`, or `failed` / `needs-refresh`), never silently.
- The old drawer "pin (no download)" behavior is retired.

## 4. The two primitives (Phase 1 — build by EXTRACTION, not greenfield)

Both primitives are extracted from `ToolTile.svelte`, preserving its launch machinery (§5). `ToolTile.svelte` is deleted once both land and all four sites migrate.

### 4.1 `ToolRow.svelte`

Used by: Dock sections, the drawer, mobile Tools, maker lists.

- **Height: owned by the primitive** — 64px mobile / 68px desktop. Parents must not impose height (kills the `--dock-tool-row-height` external override).
- Fixed icon slot (left), 1-line title, 1-line status (`relationshipLabel` + offline/update chip), fixed-width right action rail.
- Whole row opens (anchor) except the action buttons (buttons stop propagation).
- Long titles: `min-width: 0` + `text-overflow: ellipsis` (never hard-clip).
- Action rail renders only `actions` that are `true`; reserved width so rows never reflow when chips toggle.

### 4.2 `ToolCard.svelte`

Used by: desktop Tools grid only.

- **Fixed height** regardless of badge/description content.
- Fixed icon, fixed title area, **description clamped to exactly 2 lines**, **one reserved badge row always present** (empty when no badges) so cards never differ in height.
- Action rail in a fixed location: `save` (+) and `info` (i). No close/remove (those are Dock concepts).

## 5. Shared launch helper (Phase 1 prerequisite)

`ToolTile.svelte` currently owns the perf-critical launch path: `warmLaunch`, prefetch, `scheduleHardLaunchFallback`, `launchAndRemember`, recency recording (~230 lines of script). **Extract this to `tool-surface/use-tool-launch.ts` (a Svelte 5 composable / plain functions) FIRST**, so both primitives share identical launch behavior and we don't regress launch latency or warm-start. Unit-test the pure parts (recency recording, fallback scheduling logic).

## 6. Migration targets (the four drift sites + sheets)

**Replace all four bespoke renderings with `ToolRow`:**
1. `dock/+page.svelte` left rail `rail-item` buttons → `ToolRow` sections.
2. `dock/+page.svelte` focused drawer `focused-tool-row` → `ToolRow`.
3. `DashboardHome.svelte` `ToolTile` density="drawer" + custom close/chip wrapper → `ToolRow`.
4. `ToolSwitcherSheet.svelte` `.tool-row` → `ToolRow`.

**Dock (Phase 3) — name both targets:**
- **Dock home content** (`DashboardHome.svelte`): already has Recent-above-Saved and a calm inbox chip — mostly there; just swap to `ToolRow` and drop the height override.
- **Dock shell / sidebar** (`dock/+page.svelte` `<aside class="sidebar">`): the heavy rail to retire/collapse in the home state. Don't polish the center and leave the stale rail.

**Sheets (Phase 4) — converge on `Sheet.svelte`:**
- `Sheet.svelte` is canonical (swipe-down, backdrop, ref-counted scroll-lock, focus-trap, `role=dialog`/`aria-modal`, Escape, back-button).
- **`AppInspector.svelte` must migrate onto `Sheet.svelte`** — it currently rolls its own scrim/drag/scroll-lock (~100 dup lines) with **no focus-trap and no dialog semantics**. Highest-value convergence; if Tools uses `i` for info, that sheet must feel as polished as the drawer.
- Audit `AppSwitcherGesture.svelte` (third roll-your-own drawer) and any update/share sheets; every sheet must support swipe-down + Escape + scroll-lock via `Sheet.svelte`.

## 7. Tools grid (Phase 2)

- Desktop: `ToolCard` grid. Mobile (≤768): `ToolRow` list — **not** 1-col cards (current behavior at 640 is cards; fix).
- **Strip all launch-management copy.** Remove `tools/+page.svelte:128` ("Launch and resume saved tools from Dock") and `:141` ("Dock is for launching what you already use"). Tools is browse/search only.
- Sticky compact search header.
- Reconcile breakpoints to the standard set: **390 / 768 / 1440 / 1920** (replace ad-hoc 1024/640).
- `save` (+) on a card is allowed (adopt-from-browse); no Saved section / remove on Tools.

## 8. Update inbox (Phase 5 — mostly done, do not rebuild)

`DashboardHome.svelte` already renders the inbox as a small chip → severity-grouped `Sheet` → per-row Review/Update pill. Keep it. Work remaining:
- Route chip labels through `updateChipLabel()` (§3.3) so they follow `UpdateSeverity`.
- Ensure the per-row chip in `ToolRow` uses the same source.
- "Review" only when judgment is needed (`needs-review`); otherwise "Update".

## 9. Scale rules (Phase 6 — hard caps, not "manageable")

Rendering every item is forbidden. Concrete caps:
- **Drawer:** show first N per section; search to reveal the rest (reuse `ToolSwitcherSheet`'s existing "showing first N" capping).
- **Dock:** cap Recent/Saved display counts; provide a manage/search affordance for the overflow.
- **Tools:** paginated or virtualized browse.

Test matrix (each viewport 390 / 768 / 1440 / 1920):
- Tool counts: **0, 1, 100, 1000**.
- Long names (no-space 40ch), missing description, max badges.
- Offline `saving` stuck → `needs-refresh` / `failed`.
- Update severity boundaries (each `UpdateSeverity` arm).
- Empty states for each relationship section.

## 10. Guardrails (Phase 7 — CI tests, not guidelines)

Add automated checks so drift can't creep back:
1. **Forbidden-string grep test:** the §3.3 literals must not appear in any `.svelte`/surface file outside `labels.ts`. Fails CI.
2. **Forbidden bespoke markup test:** class names `rail-item`, `tool-row`, `focused-tool-row`, `dock-tool-row` (and any new app-list markup) must not exist outside `ToolRow.svelte` / `ToolCard.svelte`. Fails CI.
3. **Single-sheet test:** no roll-your-own `position: fixed` scrim + drag handler outside `Sheet.svelte` (grep for the duplicated scroll-lock key usage outside the canonical sheet).
4. Extend existing `adapters.test.ts` / `state.test.ts` with the `toolState` selector tests + the offline/update bucket mappings.

## 11. Sprint order

| Sprint | Scope | Gate |
|---|---|---|
| **1** | Phase 0 contract (`ToolDisplay`/`ToolState`/`toolState`/`labels`/`use-tool-launch`) **with tests**, then `ToolRow` + `ToolCard` (extracted), then Tools grid migration | selector + primitives unit-tested; Tools grid uses primitives + no launch copy |
| **2** | Dock home content + Dock shell sidebar onto `ToolRow`; retire heavy rail | all four open/recent/saved renderings gone |
| **3** | Drawer onto `ToolRow`; `AppInspector` + sheets onto `Sheet.svelte` | one sheet primitive; one row primitive |
| **4** | Update inbox label-source cleanup; scale caps; CI guardrails | guardrail tests green; scale matrix passes |

## 12. Process risk (do not skip)

The platform is **Codex's active commit zone**; Claude + Codex share the working directory and HEAD (a Codex commit already interleaved into a Claude branch this session). Rules:
- Work on `feat/dock-harmonization`; **commit only files you changed**; **never `git commit --amend`** on shared HEAD.
- These edits touch 5000+-line files (`dock/+page.svelte`). Extract the rail + focused drawer into components consuming `ToolRow` to shrink the route as you go.
- Coordinate ownership with Codex before Sprint 2/3 (the heavy Dock route) to avoid collisions.

## 13. Acceptance

- `ToolTile.svelte` deleted; only `ToolRow` + `ToolCard` render tools.
- One copy source (`labels.ts`), one sheet (`Sheet.svelte`), one selector (`toolState`).
- `save` = Dock + offline everywhere; offline failure visible.
- CI guardrails green. Scale matrix (0/1/100/1000 × 4 viewports) passes.
