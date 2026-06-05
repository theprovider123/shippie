# Codex handoff — desktop Dock rail (Sprint 2, half 2)

**Branch:** `feat/dock-harmonization` · **From:** Claude (Opus 4.8) · **Date:** 2026-06-05
**Spec:** `docs/superpowers/specs/2026-06-04-dock-tools-drawer-harmonization-design.md` §3, §6.
**Why you, not me:** `dock/+page.svelte` (5093 lines) is your active file (you just landed "Simplify dock update queue"). This is a product-level desktop-nav change in your zone — handing it over to avoid a shared-HEAD collision on a huge file.

## The drift
On desktop the dock route renders the **same** open/recent/saved tools **twice**:
1. `dock/+page.svelte:3640` `<aside class="sidebar">` → `rail-item` buttons (lines **3655–3686**), one per tool, bespoke markup.
2. `dock/+page.svelte:3745` `<DashboardHome dockGroups={railGroups} …>` inside `<main class="dock-canvas">` — **already migrated to ToolRow sections by me** (commit `dace2761`).

So the canvas already shows the harmonized ToolRow list. The rail's tool-list is now redundant.

## What's already done (copy this pattern)
`DashboardHome.svelte` is the reference. Each section (`Running`/`Recent`/`Saved`) renders:
```svelte
<ToolRow
  app={railToolToTile(tool)}
  state={stateForTool(tool, sectionId)}   {/* toolState selector, surface:'dock' */}
  hideRelationship                         {/* section header already labels the group */}
  onOpen={() => onOpenTool(tool.slug)}
  onReview={() => openUpdates()}
  onClose={sectionId === 'open'  && onCloseTool      ? () => onCloseTool(tool.slug)      : undefined}
  onRemove={sectionId === 'saved' && onRemoveSavedTool ? () => onRemoveSavedTool(tool.slug) : undefined}
/>
```
The contract lives in `$lib/components/tool-surface`: `toolState(...)`, `ToolRow`, `ToolCard`, `relationshipLabel`/`updateChipLabel`/`saveActionLabel`. Actions derive from raw membership (a running+saved tool keeps Remove + Close, hides Save). `save` re-appears as Refresh/Repair when a saved offline copy breaks.

## The product decision to make (this is why it's yours)
The rail's tool-list isn't just display — clicking a `rail-item` (`openRailTool`) is **how a desktop user switches tools while one is focused** (`section !== 'home'`). If you retire the rail tool-list:
- **Home state:** fine — the canvas `DashboardHome` ToolRows are the list.
- **Focused state:** desktop switching must move to the `ToolSwitcherSheet` drawer (already rendered at `3631`, opens via `$switcherOpen`). Confirm there's a discoverable desktop affordance to open it (keyboard shortcut / button) before removing the rail.

## Recommended change
1. **Delete** the rail tool-list (`dock/+page.svelte:3655–3686`) + its now-dead CSS (`.rail-item*`, `.rail-icon`, `.rail-label`, `.rail-live`, `.rail-empty` around `5081–5084` and nearby).
2. **Keep** `.rail-head` (quick actions) + `.rail-foot` (sections nav) — that's pure navigation, not tool drift.
3. Ensure the focused-state switch path opens `ToolSwitcherSheet` on desktop (add a visible trigger if missing).
4. Also retire the bespoke `focused-tool-row` (`3553`) → use `ToolRow` (Sprint 3 converges the drawer too; see below).
5. Run `bun run check` + `bunx vitest run src/lib/components/tool-surface/` (must stay 0/68). Commit only `dock/+page.svelte`.

## What I'm doing in parallel (no overlap with your file)
Sprint 3: migrate `ToolSwitcherSheet.svelte` onto `ToolRow`, and migrate `AppInspector.svelte` onto the canonical `Sheet.svelte`. Those are different files — no collision with `dock/+page.svelte`.
