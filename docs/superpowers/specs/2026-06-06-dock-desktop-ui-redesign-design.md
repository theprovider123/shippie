# Dock Desktop UI Redesign — Design Spec

> **Status:** draft for review · **Author:** Claude (Opus 4.8) · **Date:** 2026-06-06
> **Branch:** `feat/dock-harmonization` (builds on the harmonization contract)
> **Origin:** desktop UI/UX review of the Dock landing page (`/dock`).
> **Companion mockups:** `.superpowers/brainstorm/78902-1780739975/content/` (content-layout, rail-layout, icon-system, icon-collision, icon-techy, icon-final)

## 1. Problem

The Dock landing page works on mobile but underdelivers on desktop. The mobile single-column list was stretched to a 2000px canvas without being given a desktop layout. Concretely:

**Rail (left)**
- The top icon cluster (`⌘ Dock` wordmark + `+ / search / grid / doc`) is tiny, unlabeled, cramped, and visually colliding. A stray **"M"** glyph is absolutely-positioned over the start of the main header ("**M**Running, recent…") — a real layout bug.
- ~600px of dead vertical space between the Switcher card and the bottom nav (the rail is a drawer on mobile so this never shows there).
- The bottom nav ("Browse tools", "You", "Access", "Create", "Sign in to ship") is a flat list of mismatched concepts — an action, three sections, and an auth CTA — all the same low-contrast text, no icons, no grouping.

**Content (right)**
- No desktop layout: rows are full-bleed, a tiny monogram on the far left and the remove control stranded ~1600px away at the far-right edge. The right two-thirds of the screen is empty.
- Monograms read like a periodic table: a single serif letter (`--font-heading`) on a filled `themeColor` square. They are the only colour on the page yet the smallest, most-repeated element. Same-initial tools (Sudoku / Symptom Diary — both "S") are nearly indistinguishable.
- Three sections, three visual treatments (Running bordered + divided, Recent single boxed row, Saved different again) — inconsistent rhythm.
- Ambiguous affordances: Running rows use `×`, Saved rows use `−` — two glyphs for "remove".
- No page header/greeting; the intro paragraph does the job of a title but reads like a tooltip (and is what the stray "M" overlaps).

**Root cause:** mobile is a list because a list is the right shape for a phone. Desktop never got its own layout, a real rail, a consistent section system, or icons that survive a wide canvas. Separately, the icon renderer (`IconOrMonogram.svelte`) is duplicated in spirit by the build-time generator (`scripts/generate-monogram-icons.mjs`), so live tiles and baked PWA/install icons can drift.

## 2. Goals / Non-goals

**Goals**
- Give the Dock a real **desktop** layout that fills the canvas and reads as a *launcher*, not a stretched list.
- Replace the periodic-table monograms with a sharp, "techy", high-quality, collision-proof icon system.
- Make icons **identical across web, installed app, and mobile** by sharing one rendering algorithm between the live primitive and the build-time generator.
- Unify section treatment and affordances; fix the stray-"M" bug and the dead-space rail.
- Stay inside the frozen harmonization contract (§3 of `2026-06-04-dock-tools-drawer-harmonization-design.md`): two visual primitives only (`ToolRow`, `ToolCard`).

**Non-goals**
- Redesigning mobile (it's the better surface today; it inherits only the new icon atom).
- Changing the data model / `ToolDisplay` + `ToolState` contract shape (we extend rendering, not the contract).
- Reworking the Tools catalog, You, or Access pages beyond adopting the shared `ToolGlyph`.
- A full brand/colour-system overhaul.

## 3. Decisions locked (from the brainstorm)

| # | Decision | Choice |
|---|---|---|
| 1 | Content layout | **Launchpad grid** of icon tiles, grouped Running/Recent/Saved. Manage actions on hover. A compact row view is the fallback for dense "manage everything" moments. |
| 2 | Navigation shell | **Collapsible icon rail** (~56px) that expands to ~200px labeled on hover/pin. Lucide nav glyphs + tooltips. `⌘K` palette carries findability. |
| 3 | Icon fallback | `real iconUrl` → else `glyph` (curated emoji) → else **smart monogram** (1–2 letters) on a slug/theme colour. |
| 4 | Icon style | **Terminal**: near-black tile, hairline accent border, monospace glyph in the accent, small index dot. |
| 5 | Icon shape | **Hybrid** — square hallmark with ~3px micro-radius (crisp at small sizes, still "square"). |
| 6 | Depth + motion | Tiles **float** off the background (CSS stacked shadow + rim-light). **One shared ambient WebGL shader** behind the grid (not per-tile). Degrades under `prefers-reduced-motion` / weak GPU. |
| 7 | Running state | HUD ring + slow pulse + **corner rocket badge** (Shippie "ship" metaphor). Only on `relationship === 'running'`. |

## 4. Architecture

### 4.1 `ToolGlyph` — the new shared icon atom (the heart of this work)

A single presentational component that renders a tool's icon at any size, in any of three states. It **replaces** `IconOrMonogram.svelte` and becomes the only place icon visuals are defined.

```
ToolGlyph(props):
  slug: string
  name: string
  iconUrl?: string | null
  glyph?: string | null          // curated emoji (container apps)
  themeColor?: string | null     // maker-supplied accent; null → derived
  size?: number                  // px, default 64
  running?: boolean              // adds HUD ring + rocket badge
  float?: boolean                // adds elevation (default true on grid, false in dense lists)
```

Render priority: `iconUrl` (img) → `glyph` (emoji, centered) → **monogram** (computed). All three sit on the same hybrid-square tile so a grid mixing real icons + monograms stays visually coherent.

### 4.2 Shared icon algorithm — `packages/design-tokens`

The monogram + colour logic must run identically in the browser and in Node/Bun (build script). It is **pure, dependency-free** and lives in `packages/design-tokens/src/tool-icon.ts`:

```
monogram(name, slug) -> string        // 1–2 letters
  - multi-word name → first letter of first two words, upper (Symptom Diary → "SD")
  - single word     → first two letters, title-case (Sudoku → "Su")
  - fallback        → slug[0] or "?"

accentColor(slug, themeColor?) -> hsl
  - if themeColor present and not the default → use it
  - else derive hue from a stable hash(slug); fixed S/L for the terminal palette
    so hues spread out and same-initial tools never collide on colour

surfaceSeed(slug) -> number           // 0..1, seeds the ambient sheen / generated texture
```

`packages/design-tokens/src/tokens.css` keeps the `shippie-icon` token but changes it from hard-square to hybrid (`border-radius: 3px`) and adds the terminal surface tokens (tile bg, hairline alpha, float shadow stack). Both `ToolGlyph` and the build script consume these.

### 4.3 Build-time parity — `scripts/generate-monogram-icons.mjs`

The generator is refactored to import `monogram()` / `accentColor()` from `packages/design-tokens` (it currently inlines "first letter + themeColor"). It emits an SVG matching the terminal style (near-black tile, hybrid radius, hairline border, monospace glyph in accent). Result: a tool's baked `icon.svg` (PWA manifest, install icon, OG) is the same mark a user sees live. **This is the cross-platform consistency guarantee** — one algorithm, two renderers (DOM + SVG).

### 4.4 Layout components

- **`DockRail.svelte`** (new, extracted from `dock/+page.svelte`): the collapsible icon rail. Collapsed 56px / expanded 200px (CSS-driven, hover + pinned state persisted to localStorage). Sections: brand, primary (Create, Browse), nav (You, Access), account block pinned bottom. Lucide icons + tooltips. This **removes** the stray-"M" cluster and the dead space, and extracts ~hundreds of lines from the 5037-line `dock/+page.svelte`.
- **`DashboardHome.svelte`** (existing): switches the content region to the **launchpad grid**. Each group (Running / Recent / Saved) renders a responsive grid of **`ToolRow` in `variant="tile"`** (icon-forward: large `ToolGlyph`, name under, manage action on hover). The existing row layout is preserved as `variant="row"` for a "Manage" toggle and remains the mobile shape. **No third primitive** — `ToolRow` (the contract's Dock launch/manage primitive, already carrying `onClose/onRemove/onReview`) gains a presentation variant. ToolCard stays **browse-only**, untouched.
- **Section system:** one shared section header component (label + one-line caption) with identical spacing/rhythm for all three groups. Empty groups collapse (fixes the lopsided-board problem). Replaces the three bespoke treatments.
- **Affordances:** one remove pattern. Running tiles → `close` (rocket-aware), Saved tiles → `remove`; both rendered by `ToolRow` (tile variant) from `ToolState.actions` (already modeled — `actions.close` / `actions.remove`), shown on hover/focus with a tooltip, never two bare glyphs side by side.
- **Page header:** a real header region (greeting + the existing one-liner as a subtitle), replacing the floating tooltip-paragraph.

### 4.5 Ambient shader (scoped)

One `<canvas>` WebGL layer behind the grid renders a slow, low-contrast living gradient seeded from the visible tools' accents. Tiles read as "floating above" it via CSS. **Constraints:** exactly one GL context (70+ tools makes per-tile GL impossible — browsers cap ~16); `requestAnimationFrame` paused when tab hidden / grid offscreen; static fallback image under `prefers-reduced-motion` or when WebGL is unavailable. The running-state pulse is CSS, not GL, so it works even when the shader is disabled.

## 5. State → visual mapping

| `ToolState.relationship` | Treatment |
|---|---|
| `running` | HUD ring + slow CSS pulse + corner rocket badge; `close` action on hover |
| `recent` | resting tile; `save` action available |
| `saved` | resting tile; offline tick (saving/ready/needs-refresh/failed) reflected in the index dot colour; `remove` on hover |
| `catalog` | (Tools surface) resting tile; `save`/`info` |

`offlineState` maps to the index-dot colour (ready / saving / needs-refresh / failed) so offline status is legible without extra chrome. `updateState` keeps the existing review chip.

## 6. Accessibility

- Icon-only rail: every control has an accessible name (tooltip text == aria-label); collapsed state is `aria-expanded`-aware.
- Monogram tiles are `aria-hidden`; the accessible name comes from the tool name label/row, as today.
- Hover-only manage actions also appear on keyboard focus (focus-within), so they're reachable without a pointer.
- Contrast: accent-on-near-black glyphs targeted at ≥ 4.5:1; the derived-colour S/L is chosen to hold contrast across hues.
- `prefers-reduced-motion`: no pulse, no shader animation, no hover lift transition.

## 7. Performance

- `ToolGlyph` monograms are pure CSS/DOM — unlimited tiles, no GL.
- Monogram + colour are computed once (memoized by slug) — consistent with the adapter cache philosophy already in `tool-surface/adapters.ts` (don't recompute per reactive tick).
- One shared GL context; paused offscreen; static fallback.
- Rail collapse/expand is CSS transform/width only.

## 8. Testing

- **Unit (Bun):** `tool-icon.ts` — monogram rules (multi-word, single-word, unicode, empty), colour stability (same slug → same hue; different slugs same initial → different hues), contrast floor.
- **Parity test:** the SVG emitted by `generate-monogram-icons.mjs` and the `ToolGlyph` DOM use the same `monogram()`/`accentColor()` output for a fixture set (asserts cross-platform consistency).
- **Component:** `ToolGlyph` renders img/glyph/monogram by priority; running adds rocket+ring; respects `size`.
- **Guardrail:** extend `primitives-guardrail.test.ts` — Dock still uses only `ToolRow`/`ToolCard`; no third primitive; `ToolRow` variant union constrained (`row` | `tile`); `ToolCard` stays browse-only (no `onClose`/`onRemove`/`onReview`).
- **Layout:** rail collapsed/expanded labels; empty group collapses; no stray absolutely-positioned header element (regression test for the "M" bug).
- **Visual:** Playwright shots via `_shotkit` for Dock desktop (grid, hover, running state, rail expanded) — pngquant before commit per existing pipeline.

## 9. Rollout (sprint-sized, each shippable)

1. **Icon foundation.** `packages/design-tokens/src/tool-icon.ts` + token changes + tests. No UI change yet.
2. **`ToolGlyph` atom.** Build it on the algorithm; replace `IconOrMonogram` internals (keep the filename/exports as a thin alias to avoid a repo-wide rename, matching the harmonization migration style). Terminal style, hybrid radius, float, running rocket.
3. **Build parity.** Refactor `generate-monogram-icons.mjs` onto the shared algorithm; add parity test; regenerate showcase `icon.svg`s.
4. **Launchpad grid.** `ToolRow` `variant="tile"`; `DashboardHome` grid + unified section system + page header + Manage toggle (row variant).
5. **Rail.** Extract `DockRail.svelte` from `dock/+page.svelte`; collapsible + lucide nav + account block; delete dead space; fix the stray-"M" cluster.
6. **Ambient shader.** Single GL layer + reduced-motion/static fallback. (Last; pure enhancement.)

## 10. Risks / open questions

- **Contract pressure:** adding a `ToolRow variant` is the one contract-adjacent change, but it's *more* aligned than touching ToolCard — ToolRow is already the contract's Dock primitive. It's a presentation variant on an existing primitive, not a new component; guardrail test enforces both the closed variant union and ToolCard's browse-only boundary. Still worth a nod from whoever owns the frozen contract (Codex collision zone — `dock/+page.svelte` is shared).
- **`dock/+page.svelte` is 5037 lines and co-edited by Codex.** Extracting `DockRail` must be coordinated (per memory: stage explicitly, re-check HEAD, isolate worktrees).
- **Default `themeColor` detection:** need to identify the current "default/unset" theme colour value so `accentColor()` knows when to derive vs respect maker intent. (Verify in adapters during Sprint 1.)
- **Rocket badge at tiny sizes** (rail/Switcher ~20px): badge may need to hide below a size threshold — confirm during Sprint 2.
- **Shader taste:** "slight" is subjective; ship behind a flag and tune, or cut entirely if it reads as gimmicky — the design stands without it.
