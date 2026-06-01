# Shippie Workspace redesign — design spec

**Date:** 2026-06-01
**Status:** Approved (brainstorm complete; ready for implementation planning)
**Author:** Claude (with Devante)

---

## 1. Problem

On desktop, Shippie opens onto a wall of ~39 near-identical dark tiles whose own eyebrow reads **"TOOL LAUNCHER"** (`src/routes/+page.svelte`). It is a *catalog*, not a place to work. The actual workspace (`src/routes/container/+page.svelte`) is better, but it is hidden: bare `/container` 307-redirects to `/` (`src/routes/container/+page.server.ts:6`), so users only reach the workspace by deep-linking with a query string. The catalog is the front door; the workspace is reachable only by accident.

Inside that catalog and the container dashboard, no screen has a single clear hierarchy: "Start" and "Browse" are visually identical grids; `DashboardHome.svelte` stacks Insights, an always-rendered Updates box, the tool grid, and a Nearby/mesh panel as four equal-weight zones. On mobile the same content becomes giant full-width rows (≈4–5 tools per screen) and the running tool doesn't fill the viewport (dead black band + marketing footer bleed).

**The user's words:** "on desktop I land on the tool drawer, and the hierarchy of the page is confusing. I want it to feel like a workspace almost."

## 2. Goals / non-goals

**Goals**
- Make Shippie open into a **Workspace** — your tools, the place you live — not a catalog.
- One front door. No "which screen is home?" ambiguity.
- One clear visual hierarchy per screen.
- A mobile experience designed as a *remote/continuation surface*, not a squeezed desktop.
- Reuse the existing design system (`tokens.css`) — recomposition, not a reskin.

**Non-goals**
- No new visual language, font, or color system. No Tailwind/other framework.
- No deletion of tools, the catalog, insights, updates, mesh, deep-links, or optional sign-in (combine, don't remove).
- No change to the per-tool runtime (`/run/<slug>/`) or the iframe/wrapper model.
- No mandatory account. Local-first stays local-first.

## 3. Locked decisions

| Decision | Value |
|---|---|
| Core metaphor | **B · Studio** — persistent rail + active canvas (desktop); a *remote/continuation surface* on mobile |
| Selective "C energy" | A slim, dismissible, actionable-only **resume/insight strip** above/inside the canvas — not a separate dashboard |
| System name | **Workspace** (the object). Route `/workspace`. Rail header: "Workspace". Tagline: *"Your private workspace for local tools."* Rail list label: **Tools**. Mobile entry view: **Today**. "Homebase" stays in the copy bank only. |
| First-run landing | **Always the Workspace** — empty state onboards (small operational hero + curated starters + "Browse all"). One front door. |
| Catalog (A · Launchpad) | Demoted from home to a **Browse / Add tools** view at `/tools`. |

## 4. Information architecture & routing

- **`/workspace`** is the canonical home. **`/` redirects (or rewrites) to `/workspace`.**
- The pre-existing `/container` route redirects to `/workspace` (back-compat); the bare-redirect-to-`/` is removed.
- **`/tools`** (alias `/catalog`) is the Browse / Add-tools view — the relocated Start/Browse catalog. **Compatibility (required):**
  - `src/routes/apps/+server.ts` currently 301s `/apps` → `/${search}`. Repoint it to **`/tools${search}`** (preserve query) so legacy `/apps?q=coffee` lands in the catalog, not the Workspace.
  - `src/lib/components/marketplace/SearchBar.svelte:20` currently submits `action="/"`. Change the catalog search form to **`action="/tools"`** (still plain GET).
  - **`/apps/[slug]` stays** as the public app-detail page (`src/routes/apps/[slug]/`). It is *not* part of the catalog relocation; leave it public (or declare an alias if it later moves under `/tools/[slug]`).
- **`/run/<slug>/`** is unchanged — the focused full-screen runtime, also the mobile "in a tool" posture.
- **Workspace state sources (do not conflate).** "Your tools" is *ownership/usage*, not offline-cache state:
  - **Open** (warm, running) = `ContainerState.openAppIds` (`src/lib/container/state.ts:122`).
  - **Pinned / Recent** = `src/lib/stores/launcher-memory.ts` (`pinned: string[]`, `recents: LauncherRecent[]` capped at `MAX_RECENTS=12`, `launchCounts` for ranking; persisted to `localStorage['shippie:launcher:v1']` + cookie backup).
  - **Cached / offline-ready** = `src/lib/stores/cached-slugs.ts` — this is **status only** (a badge on the tool), reconciled against the SW. It must **not** drive rail membership: a pinned tool that isn't downloaded must still appear; a cached-but-never-pinned tool must **not** appear as "yours."
- The Workspace works **without an account** (all three stores are device-local). Sign-in is visible (rail foot / "You") but never blocks local use.
- The brand pitch ("Wrap · Run · Connect") lives only as a **slim operational band** in the empty-state canvas — small, not a marketing page.

## 5. Desktop Workspace (rail + canvas)

**Left rail** = a live **Tools switcher**, adaptive so it never shows empty furniture:
- **Open** — only when ≥1 tool is running; warm (kept-alive) tools with a live dot.
- **Pinned** — the stable "my tools" section.
- **Recent** — only if there are unpinned recent tools; capped at 3–5.
- **Empty state** — collapses to just a "Tools" label + "No tools yet."
- Top: a command/search input ("Search · jump to…").
- Foot: "＋ Add tools" (→ `/tools`), "⚙ Data · Access", "○ Sign in to sync".

**Canvas:**
- Slim top bar: tool name (serif) · `LOCAL` / `CONNECTED` status · "open in tab".
- **Resume/insight strip** (§7) directly below the bar, above the tool.
- The active tool fills the remaining space. Switching from the rail keeps open tools warm (no reload) — proven by behavior, not labels.

**Empty / first-run state** uses the same rail+canvas shell ("a workspace that happens to be empty"): a slim hero band (pitch, one line; may use `--paper-warm`), then curated starters (4), then "Browse all N tools →".

## 6. Mobile Workspace (Today + full-screen tool + switcher sheet)

Same metaphor, different *posture*. Three screens:

1. **Today** (entry, default of `/workspace` on phones): one big **Resume** action, one actionable insight (§7), compact recents, search up top. Add-tool is *not* on this screen — it lives in the switcher.
2. **In a tool**: the tool owns the full screen. Slim top bar (back · tool · status). No rail, no dashboard chrome, **no marketing footer**. A bottom **handle** opens the switcher; the handle shows a brief **"Tools"** label until used once, then goes quiet.
3. **Switcher** (bottom sheet, reuses `src/lib/container/AppSwitcherGesture.svelte`): swipe up → Open (warm, live dots) first, then an all-tools grid, with search + "＋ Add tools" / "Manage" at the bottom.

**Bottom dock** (replaces today's `Home /` · `Docs /docs` · `Ship /new` · `You /you` in `BottomDock.svelte`): **Today · Tools · You**.
- **Tools** opens the switcher sheet (not a separate page).
- **You** holds account / device / settings / sync / **Docs** / **Ship**.
- **Ship** (maker/publish, today `/new`) is **contextual** inside maker flows, never a daily-dock primitive.

**Mount & trigger contract (required — the dock and the sheet live in different places today).**
`BottomDock.svelte` is a global layout component made of plain `<a href>` links; `AppSwitcherGesture` is currently mounted *inside* `container/+page.svelte`'s focused branch and driven by route-local `focusedDrawerOpen` state. To let the global **Tools** tab open the sheet on `/workspace`:
- Add a tiny shared store **`src/lib/stores/switcher.ts`** (`export const switcherOpen = writable(false)`), matching the existing svelte-store pattern (preferred over a custom DOM event).
- Mount `AppSwitcherGesture` at the **`/workspace` route level** (not only the focused branch) and bind its `open`/`onOpenChange` to `switcherOpen`.
- The **Tools** dock item becomes a `<button>` that sets `switcherOpen = true` (not an `<a href>`); **Today** and **You** stay links. Preserve the existing edge-swipe gesture (the localStorage-gated affordance) by routing it through the same store.

Responsive mapping: *Desktop Studio* (rail + canvas) ↔ *Mobile Studio* (Today entry + full-screen tool + bottom-sheet switcher).

## 7. Resume / insight strip behavior (the "C energy")

One rule, desktop and mobile:
- Show **one** strip, **slim** and **dismissible**, **only when genuinely actionable** (a resumable session and/or a cross-tool insight worth acting on).
- **Nothing actionable → the strip disappears** entirely (no empty container).
- **Multiple candidates → show the strongest one**; the rest live behind an updates/badge surface.
- **Dismissed → future activity collapses to a small badge** (top-bar or the rail item's dot), not a re-nag.
- Source: the existing Insights pipeline that currently feeds `InsightStrip`/`DashboardHome`; Updates (app version diffs) collapse from the always-on box into this badge surface.

## 8. Visual system

- **Keep the dark, warm brand chrome.** The rail/canvas split supplies the figure/ground the catalog lacked. Do **not** force `--paper-warm` on the canvas (tools paint their own backgrounds inside frames); reserve paper-warm for the empty-state hero band.
- **Category-based monogram colors** — replace arbitrary per-app colors with a category→family color so the squares become wayfinding in the rail/switcher. **Category-first by default; a tool may override sparingly** if it earns strong brand equity later.

  **Two vocabularies exist and the helper must normalize both.** The *effective* runtime category comes from the generated manifest (`first-party-curation.ts`), which `state.ts:1149` writes over each app's spec category — its live values are `food-drink, health-fitness, games, arcade-cabinet, strategy, creative, daily-brain, room, social, tools`. The raw `curatedAppSpecs` vocab (`cooking, fitness, health, wellness, journal, memory, family, money, productivity, home, travel, creativity, …`) and any custom/third-party string may also appear. `categoryColorFamily(category)` normalizes the union into **6 families**:

  | Family | Token | Categories (generated **+** raw / custom) |
  |---|---|---|
  | Cooking | `--sunset` `#E8603C` | `food-drink` · `cooking` |
  | Health / fitness | `--sage-leaf` `#7A9A6E` | `health-fitness` · `fitness`, `health`, `wellness` |
  | Games / playful | `--marigold` `#E8C547` | `games`, `arcade-cabinet`, `strategy`, `creative` · `creativity` |
  | Personal | `--accent-violet` `#7C5CC4` | `daily-brain`, `room`, `social` · `journal`, `memory`, `family` |
  | Utilities / data | `--info` `#4E7C9A` | `tools` · `money`, `productivity`, `home`, `travel` |
  | Unknown / custom | `--text-light` (muted) | anything unmatched (fallback) |

- **One hierarchy law per screen:** a single serif (Fraunces) H1 (Workspace, or the active tool); all other headings subordinate. Retire the always-rendered Updates box wedged between the "Tools" heading and the grid in `DashboardHome.svelte`.

## 9. Explicitly kept (combine, don't remove)

Every current tool; the entire catalog (relocated to `/tools`); Insights (→ strip); Updates (→ badge); Nearby/mesh (→ a secondary panel, not an equal-weight home section); `/run/<slug>` deep-links; optional sign-in; `tokens.css` design language; `AppSwitcherGesture` (now the mobile switcher sheet).

## 10. Phasing (five independently shippable phases)

Each phase has a clean user-visible outcome. Important in this multi-agent repo: keep phases small and isolated.

1. **Front door + rail spine — including PWA/offline routing.** `/workspace` route; `/ → /workspace`; `/container → /workspace`; remove the bare-redirect; `/apps → /tools`. Rail becomes the adaptive Open/Pinned/Recent switcher (sourced per §4). **PWA/offline is in-scope for this phase, not deferred** — the installed app and SW must learn the new front door in the same change, or routing tests pass while the installed/offline launch stays stale:
   - `manifest.webmanifest/+server.ts`: `start_url` and `scope` (`/` → `/workspace`), shortcuts (`/container?section=data` → `/workspace?section=data`), import action, and `protocol_handlers` (`/container?open=%s`).
   - `__shippie-pwa/sw.js/+server.ts`: `SHELL_DOCUMENTS` (`['/', '/container', '/you']`), `APPS_PREFIX`, and the `shellKeysForRequest` / `shellDocumentUrls` maps that reference `/`, `/container`, `/container?app=…&focused=1`.
   - `scripts/prepare-showcases.mjs` (~L567): the shell-assets `routes: ['/', '/apps']` precache list (→ include `/workspace`, `/tools`).
   *Solves the structural complaint on its own.*
2. **Resume / insight strip.** Slim, dismissible, actionable-only strip + collapse-to-badge (desktop + Today).
3. **Empty state + catalog move.** Small operational hero + curated starters; Start/Browse grids relocate to `/tools`.
4. **Mobile posture.** Today entry; dock → Today·Tools·You; Tools-tab-opens-sheet; full-screen tool handle with first-run "Tools" label; tool fills viewport; footer hidden in tool mode.
5. **Visual polish.** Category color-coding; one-hierarchy-per-screen cleanup; retire the Updates box.

## 11. Affected components (initial map; confirm at plan time)

| Area | Files |
|---|---|
| Routing / front door | `src/routes/+page.svelte`, `src/routes/container/+page.server.ts`, `src/routes/container/+page.svelte` (→ `/workspace`), new `src/routes/tools/`, `src/routes/apps/+server.ts` (→ `/tools`), `src/lib/components/marketplace/SearchBar.svelte` (`action="/tools"`) |
| PWA / offline (Phase 1) | `src/routes/manifest.webmanifest/+server.ts` (start_url/scope/shortcuts/protocol_handlers), `src/routes/__shippie-pwa/sw.js/+server.ts` (`SHELL_DOCUMENTS`, `APPS_PREFIX`, shell-key maps), `scripts/prepare-showcases.mjs` (shell-assets `routes`) |
| Rail / switcher | `src/routes/container/+page.svelte` (sidebar), `src/lib/components/tool-surface/ToolTile.svelte`, `ToolSection.svelte`, `src/lib/container/state.ts` (`curatedAppsBySurface`, category) |
| Tool state sources | `src/lib/container/state.ts` (`openAppIds`), `src/lib/stores/launcher-memory.ts` (pinned/recents/launchCounts), `src/lib/stores/cached-slugs.ts` (offline badge only) |
| Home content | `src/lib/container/DashboardHome.svelte` (Insights/Updates/Nearby reorg) |
| Strip / badge | `InsightStrip` + the Insights/Updates source in `DashboardHome.svelte` |
| Mobile | `src/lib/components/layout/BottomDock.svelte` (Today·Tools·You; Tools = `<button>`), `src/lib/container/AppSwitcherGesture.svelte` (mounted at `/workspace`), new `src/lib/stores/switcher.ts`, `src/routes/+layout.svelte` (footer-in-tool, standalone) |
| Visual | `src/lib/styles/tokens.css` + a new `categoryColorFamily()` helper |

## 12. Testing / verification

- `apps/platform` is **vitest-only** — no `bun:test` imports.
- Unit: `categoryColorFamily()` maps every generated **and** raw category (and the union above) to the right family + unknown fallback; adaptive-rail logic (Open hidden when nothing running; Recent capped/omitted; empty state) sourced from `openAppIds` + `launcherMemory` (and *not* `cachedSlugs`); strip visibility rule (0/1/many actionable).
- Routing: `/` → `/workspace`; `/container` → `/workspace`; `/apps` (and `/apps?q=…`) → `/tools`; `/tools` renders the catalog; `/apps/[slug]` still serves public detail; `/run/<slug>` unchanged.
- PWA/offline (Phase 1 gate): manifest `start_url`/`scope` = `/workspace`; SW `SHELL_DOCUMENTS` precaches the new shell and a cold offline launch of the installed app opens `/workspace` (not a stale `/container`/`/` shell); `prepare-showcases` shell-assets manifest lists the new routes.
- Visual/manual (headless CDP, per repo screenshot tooling): desktop `/workspace` populated + empty; mobile Today / in-tool / switcher; confirm tool fills viewport and no footer bleed in tool mode; Tools-tab opens the sheet via `switcherOpen`.
- `bun run health` (typecheck + test + build) green before each phase lands.

## 13. Risks / open items

- **Multi-agent repo:** concurrent codex sessions edit shared registry files (`state.ts`, routes) and run `git clean`/`reset`. Build each phase on an isolated branch/worktree; hand merges to the user; re-grep shared files before committing.
- **Route rename** `/container` → `/workspace`: PWA manifest/SW/shell-route updates are now **Phase 1 scope** (§10/§11), not a deferred risk. Remaining audit: internal links and any share/deep-link URLs that assume `/container` or `/apps` (e.g. `web+shippie` protocol handler, `?app=…&focused=1` deep-links honored by the SW).
- **Category overrides:** the "tool may override its category color" escape hatch is deferred until a tool actually earns it — category-first is the only behavior in Phase 5.
- Final per-category token shades to be confirmed against live rendering during Phase 5 (e.g., games vs cooking distinctness).
