# 2026-05-17 — Launch-slate consolidation design

Follow-up to [`2026-05-17-showcase-mobile-pwa-review.md`](./2026-05-17-showcase-mobile-pwa-review.md).
Captures the agreed four-phase consolidation plan with user amendments:

- Coffee + Dough keep full functionality; only the UI surface changes.
- Sudoku is **not** removed. It moves inside a Daily Puzzle umbrella.
- 10th fold slot is held open pending real-phone audit.

Each phase ships independently to prod, lowest-risk first. Nothing in this
document authorises code changes — it is the agreed design surface to drill
into per-phase implementation plans against.

## Locked design decisions (resolved 2026-05-17 after Codex re-review)

- **Slug redirects** keep indefinitely (not 30 days, not dead drops). Until
  usage is near-zero.
- **Mode-aware redirects** required for Phase 2. The current alias system
  at `apps/platform/src/routes/run/[slug]/+page.server.ts:16` only
  preserves `url.search` — it does not inject params. We need to grow it
  to support targeted redirects like
  `/run/sudoku/` → `/run/daily-puzzle/?mode=sudoku&from=sudoku`. This is
  infrastructure work that gates Phase 2 ship.
- **Daily Puzzle landing**: last-played mode if the user already played
  today; otherwise today's featured mode (per `djb2(\`daily-${date}-v1\`) % N`).
- **Recipe tab order**: Recipes / Shopping / Meal Plan / Pantry. Shopping
  is more frequent than planning or pantry scanning.
- **Pantry camera permission**: browser permission is origin-level, no
  product-side "grandfather" concept. Show a contextual Pantry scan
  prompt; if the user already granted camera at the origin (Receipt
  Snap, Snap and Forget, etc.) the browser surfaces it without re-prompt.
- **Daily Puzzle share wording**: use one shared wrapper template with
  per-mode flavour inside it: `Daily Puzzle — {Mode}: {result}` plus
  `{streak}` when relevant. This keeps consolidated sharing coherent
  without making Sudoku, Reaction, and Memory Grid sound identical.
- **WYR fold decision**: import the 60-day answer history into Drawing
  Telephone. No silent discard.
- **Shopping List sharing inside Recipe**: platform share/options stays
  Recipe-level; the Shopping tab keeps a list-specific share action for
  the actual shopping list payload.

---

## Phase 1A — Coffee + Dough UI simplification

**Goal.** Promote the one tactile primary action to the first screen on
each app; demote everything else into a bottom sheet. No feature removal.

### Coffee

- **Primary screen:** "Start brew" button with currently-selected preset
  shown inline. Tap = start the brew timer.
- **Bottom sheet (swipe-up or settings chip):** preset picker, brew
  history, ratio calculator, settings.
- **Why this lens:** Coffee today shows preset + ratio + history on first
  load — three competing surfaces for one obvious user intent. PWA users
  want one tap to "brew the usual."

### Dough

- **Primary screen:** dough-amount input + finish-time picker → "Schedule"
  button.
- **Bottom sheet:** hydration %, salt %, levain ratio, advanced formulas,
  recipe presets, history.
- **Why this lens:** Dough's advanced bakers' percentages currently sit
  alongside the schedule input. Beginners bounce, regulars don't need
  them in the way.

### Files

- `apps/showcase-coffee/src/App.tsx`, `src/styles.css`
- `apps/showcase-dough/src/App.tsx`, `src/styles.css`

### Ship criteria

1. First-tap → primary action ≤ 1s on iPhone SE
2. Every existing feature reachable from the bottom sheet
3. Fresh-visit smoke (clear localStorage, reload) confirms no regression
4. `bun run health` green

### Data migration

None. localStorage keys unchanged.

---

## Phase 1B — 10th-slot audit (parallel to Phase 1A)

Open these four on real iPhone Safari:

| App | First action? | Why not inside Daily/Quiet/health surface? |
|---|---|---|
| Habit Tracker | | |
| Sip Log | | |
| Colour of the Day | | |
| Move | | |

**Default if audit skipped:** Habit Tracker → fold into Daily surface
when it exists (Codex pick).

---

## Phase 2 — Daily Puzzle umbrella

**Goal.** Bundle Sudoku, Memory Grid, Reaction (and existing Daily
Puzzle content) into a single app with a daily-rotated lobby. User
amendment: Sudoku stays as a mode, not deleted.

### Lobby

- Today's featured puzzle (one mode, rotated by `djb2(\`daily-${date}-v1\`) % 4`)
  surfaced as the largest tile.
- 3 secondary mode tiles for the others.
- Per-mode streak counter visible on each tile.

### Modes (initial)

| Mode | Source | Daily seed key |
|---|---|---|
| Sudoku | `apps/showcase-sudoku/src/` | `sudoku-${date}-v1` |
| Memory Grid | `apps/showcase-memory-grid/src/` | `memory-${date}-v1` |
| Reaction | `apps/showcase-reaction/src/` | `reaction-${date}-v1` |
| Daily Puzzle (existing) | `apps/showcase-daily-puzzle/src/` | `puzzle-${date}-v1` |

### State

- Memory Grid and Reaction each carry persisted state today
  (`shippie:memory-grid:v1`, `shippie:memory-grid:pack:v1`,
  `shippie:reaction:v1`) — these keep per-mode streaks/best-of-day.
- **Sudoku has no persisted state today** (verified at
  `apps/showcase-sudoku/src/App.tsx` — no `localStorage` calls).
  Sudoku streaks are net-new in the umbrella app, not migrated. The
  alternative (mining historic plays from observations / proof events)
  is out of scope for this consolidation.
- One shared "longest combined streak" stat for the lobby, computed
  from per-mode streaks on read.

### Data migration

Existing Memory Grid / Reaction users have localStorage state under
their own slugs. On first launch of the umbrella app, import each
namespace, prefix-rewrite to `daily-puzzle.<mode>.*`, mark imported.

**Required: expand `apps/showcase-daily-puzzle/shippie.json`** `data`
policy to explicitly cover the old localStorage keys before the source
apps are deleted, so inherited recovery actually captures them:

```json
{
  "data": {
    "localStorage": {
      "keys": [
        "shippie:reaction:v1",
        "shippie:memory-grid:v1",
        "shippie:memory-grid:pack:v1"
      ],
      "prefixes": ["daily-puzzle."]
    }
  }
}
```

Without this expansion, the default inherited-recovery policy at the
new home won't capture the old keys, and any user whose first launch
post-fold predates the import shim loses their history.

### Mode-aware redirect dependency (gates Phase 2 ship)

`/run/sudoku/`, `/run/memory-grid/`, `/run/reaction/` need to redirect
to `/run/daily-puzzle/?mode=<original-slug>&from=<original-slug>`. The
current alias system in
`apps/platform/src/routes/run/[slug]/+page.server.ts:16` only does
canonical-slug rewriting with `url.search` preserved — it does not
inject params. Phase 2 must extend it with one of:

- **Option A:** a per-alias target-params map alongside
  `canonicalShowcaseSlug` (e.g. `aliasTargetParams['sudoku'] = { mode: 'sudoku', from: 'sudoku' }`)
- **Option B:** dedicated shim pages at
  `apps/platform/src/routes/run/{sudoku,memory-grid,reaction}/+page.server.ts`
  that throw a hand-rolled redirect

Option A is cleaner and scales for Phase 3 redirects too.

### Files

- `apps/showcase-daily-puzzle/` extended with `src/modes/{sudoku,memory-grid,reaction}/`
  — each mode's engine + UI lifted from its current showcase
- Delete: `apps/showcase-sudoku`, `apps/showcase-memory-grid`,
  `apps/showcase-reaction`
- `apps/platform/src/lib/container/state.ts` — remove the 3 retired
  `curatedApps`
- `apps/platform/src/lib/_generated/*` regen
- `apps/platform/static/__shippie-run/{sudoku,memory-grid,reaction}/`
  — manually remove orphan bakes (CLAUDE.md gotcha)

### Share result rule

Use one shared wrapper with per-mode result flavour:

```text
Daily Puzzle — {Mode}
{mode-specific result}
{streak line when relevant}
```

Slug redirects, landing rule, and mode-aware redirect strategy are all
locked in the top-of-doc "Locked design decisions" section.

### Ship criteria

1. Existing **Memory Grid + Reaction** users see their best-of-day /
   pack state preserved on first launch of the umbrella. (Sudoku
   streaks are net-new — no preservation requirement.)
2. Each mode plays identically to its pre-fold standalone
3. Lobby cold-loads ≤ 1s on iPhone SE
4. Arcade-CSP still clean (all 3 existing apps already pass)
5. `/run/sudoku/`, `/run/memory-grid/`, `/run/reaction/` all 302 to
   `/run/daily-puzzle/?mode=<slug>&from=<slug>` and land on the right
   mode
6. `apps/showcase-daily-puzzle/shippie.json` `data` policy lists the
   three old localStorage keys before source apps are deleted

---

## Phase 3 — Room consolidation

**Goal.** Three folds: Live Room → Match Room, Show and Tell →
Whiteboard, Would You Rather → Drawing Telephone (as prompt pack).

### Live Room → Match Room

- Match Room already supersedes the host/guest social-room story.
- **Correction (per Codex re-review):** Live Room is **not** a
  localStorage-rooms model. It's ephemeral `@shippie/proximity` +
  `Y.Doc` with generated join codes
  (`apps/showcase-live-room/src/host/HostRoom.tsx:3,30,40`). Match Room
  uses a fundamentally different model: persistent `roomId` / `roomKey`,
  Spaces URLs, relay gossip, IndexedDB queue, sealed room archives
  (`apps/showcase-match-room/src/shared/use-matchday-room.ts:90`,
  `apps/showcase-match-room/src/shared/signal-config.ts:20`).
- **Migration:** there is no state to migrate. Live Room rooms vanish
  when the host disconnects today; nothing in localStorage to import.
  This is a **product/content fold**, not a state migration: Match
  Room becomes the canonical "two-plus phones in the same room" app,
  and Live Room's slug 302s to Match Room.
- **Caveat:** Match Room's room model is heavier (sealed archives,
  IndexedDB queue) than Live Room's ephemeral Y.Doc. Existing Live Room
  users won't get a like-for-like experience — they get the richer
  Match Room model. That's intentional but worth flagging in the
  in-app "moved to Match Room" notice.

### Show and Tell → Whiteboard

- Whiteboard gains a "Show and Tell" mode — same ephemeral-room idea but
  inside the existing drawing surface.
- **Migration:** Show and Tell content rarely persists (the room is
  ephemeral by design). One-shot import for any saved sessions, then
  nothing.

### Would You Rather → Drawing Telephone

- Drawing Telephone gets a "Would You Rather" prompt pack alongside its
  existing themed packs.
- **Correction (per Codex re-review):** WYR is **not** just content. It
  persists a 60-day rolling answer history in `shippie:wyr:v1`
  (`apps/showcase-would-you-rather/src/App.tsx:25,43`). The fold has to
  import it into Drawing Telephone.
- **Migration:** Drawing Telephone imports `shippie:wyr:v1` into a
  `drawing-telephone.wyr.*`-namespaced key and exposes the answer
  history inside the WYR prompt pack (a "your past answers" sheet).
- **Required: expand `apps/showcase-drawing-telephone/shippie.json`**
  `data` policy to cover `shippie:wyr:v1` (and the new namespaced
  prefix if Option A) before WYR is deleted, same pattern as the Daily
  Puzzle expansion in Phase 2.

### Files

- `apps/showcase-match-room/src/` — Live Room import + room model
  reconciliation
- `apps/showcase-whiteboard/src/` — Show-and-Tell mode (ephemeral
  prompt + canvas)
- `apps/showcase-drawing-telephone/src/` — WYR prompt pack
- Delete: `apps/showcase-live-room`, `apps/showcase-show-and-tell`,
  `apps/showcase-would-you-rather`
- Curation, state, generated manifests regen
- Orphan-bake cleanup in `static/__shippie-run/`

### Surface and purity check

Current HEAD has Show and Tell, Would You Rather, Whiteboard, and
Drawing Telephone all on `surface: arcade` with `subcategory: room`.
There is no featured-to-arcade surface mismatch to resolve, but the
consolidated arcade bundles still need the purity/CSP scanner before
ship.

Slug redirects are locked at indefinite per top-of-doc decisions.

### Ship criteria

1. WYR answer history imports into Drawing Telephone and appears in the
   WYR prompt pack history sheet
2. Live Room's slug 302s to Match Room with in-app "moved" notice
   acknowledging the model change (ephemeral Y.Doc → persistent rooms)
3. Drawing Telephone's WYR pack honours the rest of the existing
   prompt-pack flow (selection, share, daily rotation)
4. Drawing Telephone `shippie.json` `data` policy lists
   `shippie:wyr:v1` before WYR is deleted

---

## Phase 4 — Recipe absorption

**Goal.** Meal Planner + Shopping List + Pantry Scanner fold into Recipe
as bottom-tab modes. Largest consolidation by scope.

### Recipe becomes a 4-tab app

Bottom tab order (locked, frequency-of-use):

| # | Tab | Source | Primary action |
|---|---|---|---|
| 1 | Recipes (current) | `apps/showcase-recipe/` | Browse / cook / save |
| 2 | Shopping | `apps/showcase-shopping-list/` | Add item |
| 3 | Meal Plan | `apps/showcase-meal-planner/` | This week's plan |
| 4 | Pantry | `apps/showcase-pantry-scanner/` | Scan item |

Bottom tab bar (per Codex PWA wisdom: bottom tabs > top hamburger).

### Data migration

Each folded app today owns its own localStorage / SQLite namespace.
Recipe currently owns a SQLite database (`local-db`). The fold either:

- **Option A (recommended):** keep each tab's storage isolated under its
  current key, just collocate the UI. Lowest-risk migration; each tab
  reads its existing data on first launch.
- **Option B:** merge into Recipe's SQLite schema. Higher fidelity (cross-tab
  joins: "add meal-plan items to shopping list") but real migration risk.

Decision: ship Option A first; Option B as a follow-up once the UI lives
together and we can see what cross-tab joins matter.

### Files

- `apps/showcase-recipe/src/` — tab shell, three new tab modules
- Delete: `apps/showcase-meal-planner`, `apps/showcase-shopping-list`,
  `apps/showcase-pantry-scanner`
- Curation, state, generated manifests regen
- Orphan-bake cleanup
- `shippie.json` — Recipe's `data` policy expands to cover the three
  imported namespaces (Codex's "explicit data policy" recommendation)

### Sharing

The platform share/options panel remains Recipe-level. The Shopping tab
keeps a list-specific share action for the current shopping list payload
because that is a different user intent than sharing the Recipe app.

Tab order is locked above. Pantry camera permission framing is locked in
top-of-doc decisions: browser permission is origin-level, contextual
prompt on first Pantry use, no product-side grandfather concept.

### Ship criteria

1. Existing Meal Planner / Shopping / Pantry users see their data on
   first launch of Recipe
2. Recipe cold-loads ≤ 1.5s on iPhone SE (allow margin for the bigger
   bundle)
3. Each tab plays identically to its pre-fold standalone
4. `data` policy in `shippie.json` covers all four namespaces

---

## Cross-cutting concerns

### Curation hygiene

After each phase:

1. Regenerate `apps/platform/src/lib/_generated/first-party-curation.ts`
2. Update `SHELVES` constant if the fold changes shelf membership
3. Run maker-upload purity scanner on consolidated apps (per CLAUDE.md
   gotcha — `surface: arcade` triggers arcade-CSP, breaks any bundle
   with inline scripts or third-party network)

### Orphan-bake cleanup

`prepare-showcases.mjs` does not clean retired-slug bakes from
`static/__shippie-run/`. Every fold leaves ghost subdomains live unless
manually `rm -rf`'d before the next `bun run build && wrangler deploy`.
Belt-and-braces: add a follow-up to teach `prepare-showcases.mjs` to
diff source vs. baked dirs and warn on orphans. Out of scope for the
consolidation itself.

### Crewtrip migration verification

**Verified against HEAD:** the current regression test at
`apps/platform/src/lib/server/deploy/manifest.test.ts:148` only checks
`defaultDataPolicy('crewtrip')`, where `media === 'none'` — the
defaults path. This **does not exercise the positive path** through
Crewtrip's actual `shippie.json` (which declares
`data.mode = 'shippie-documents'`, `trip-archive` documents, inherited
recovery + snapshot migration + encrypted media + the specific
localStorage keys/prefixes Crewtrip owns).

**Required follow-up:** add a regression test that parses Crewtrip's
actual `apps/showcase-crewtrip/shippie.json` and asserts:

- `data.mode === 'shippie-documents'`
- `data.documents` includes `'trip-archive'`
- `data.recovery === 'inherited'`
- `data.media === 'encrypted-chunked'`
- `data.localStorage.keys` + `data.localStorage.prefixes` cover the
  exact Crewtrip keys

Without this, a future edit to Crewtrip's `shippie.json` could silently
break the inherited-recovery contract and the existing test would still
pass. This is a 15-minute fix and should land before Phase 2.

---

## Out of scope

- Co-Pilot rename + reduce (separate brainstorm)
- Atlas merge story (separate brainstorm)
- Daily / Quiet / health-suite umbrella app (target for Habit Tracker /
  Sip Log / Colour of the Day / Move folds — needed for Phase 5+)
- Cross-tab joins inside Recipe (Phase 4 follow-up, not Phase 4 itself)

---

## Suggested order of operations

1. **Phase 1A** (Coffee + Dough) — ships in 1 day
2. **Phase 1B audit** — happens in parallel on real device
3. **Phase 2** (Daily Puzzle umbrella) — 2–3 days, data migration is the
   main risk
4. **Phase 3** (Room consolidation) — 3 days, data migration heavier
5. **Phase 4** (Recipe absorption) — 3–4 days, biggest scope

Total: ~10–12 days of focused work, spread across 4 independent
releases.

---

## Final implementation plan

This is the implementation-ready sequence. Each phase should land as its
own PR/release, with curation regeneration and orphan-bake cleanup before
deploy.

### Release 0 — preflight guardrails

Do before Phase 1A if not already landed:

1. Add the positive Crewtrip manifest regression test:
   - parse `apps/showcase-crewtrip/shippie.json`
   - assert `data.mode`, `data.documents`, `data.recovery`,
     `data.media`, and exact localStorage keys/prefixes
2. Add/confirm the redirect alias extension design:
   - `canonicalShowcaseSlug(slug)` can remain string-only for simple
     callers
   - add a richer helper, e.g. `canonicalShowcaseTarget(slug)`, that
     returns `{ slug, searchParams }`
   - update `/run/[slug]/+page.server.ts` to merge target params with
     existing query params, where explicit incoming params win only if
     that is intentional and tested
3. Add tests for:
   - `/run/sudoku/` -> `/run/daily-puzzle/?mode=sudoku&from=sudoku`
   - query preservation
   - no redirect for canonical `/run/daily-puzzle/`

### Release 1 — Coffee + Dough mobile simplification

Implementation steps:

1. Coffee:
   - identify all existing first-screen controls
   - keep selected preset + `Start brew` on the primary surface
   - move preset picker, ratio calculator, history, and settings into a
     bottom sheet
   - preserve localStorage keys and existing timer behavior
2. Dough:
   - make dough amount + finish time + `Schedule` the primary surface
   - move baker percentages, recipe presets, history, and advanced
     formulas into a bottom sheet
   - preserve localStorage keys and calculation output
3. Verify:
   - app-specific tests/typechecks/builds
   - mobile viewport browser smoke for first action and bottom sheet
   - root `bun run health` only when ready for release/deploy, because
     it is broad and slow

### Release 1B — real-phone 10th-slot audit

Run on iPhone Safari while Release 1 is in review:

| App | Decision rule |
|---|---|
| Habit Tracker | Fold unless first action and auto-check proof are clearly stronger than Daily. |
| Sip Log | Fold unless it earns a dedicated hydration/caffeine story. |
| Colour of the Day | Fold into Quiet/Journal unless daily mood art is sticky on real phone. |
| Move | Fold/rebuild unless it clearly beats Lift as the mobile exercise surface. |

If the audit is skipped, fold Habit Tracker into the future Daily
surface.

### Release 2 — Daily Puzzle umbrella

Implementation steps:

1. Build the alias target-param infrastructure from Release 0 if it did
   not land there.
2. Add Daily Puzzle modes:
   - `src/modes/sudoku`
   - `src/modes/memory-grid`
   - `src/modes/reaction`
3. Add umbrella lobby:
   - last-played if played today
   - otherwise today's featured mode
   - secondary mode tiles with per-mode streak/best summaries
4. Add migration:
   - import `shippie:reaction:v1`
   - import `shippie:memory-grid:v1`
   - import `shippie:memory-grid:pack:v1`
   - mark each import idempotently
   - create Sudoku streaks only going forward
5. Expand `apps/showcase-daily-puzzle/shippie.json` data policy before
   deleting old sources.
6. Add redirects:
   - `sudoku -> daily-puzzle?mode=sudoku&from=sudoku`
   - `memory-grid -> daily-puzzle?mode=memory-grid&from=memory-grid`
   - `reaction -> daily-puzzle?mode=reaction&from=reaction`
7. Delete retired source apps only after migration, redirect, and data
   policy tests pass.
8. Regenerate catalog/curation and remove orphan bakes.

Verification:

- imported Memory Grid and Reaction histories survive first launch
- each mode plays like the old standalone
- redirect tests pass
- arcade purity/CSP passes
- iPhone SE viewport lobby cold-load target checked

### Release 3 — room consolidation

Implementation steps:

1. Live Room:
   - add `live-room -> match-room` redirect
   - add a small moved notice in Match Room when `from=live-room`
   - do not attempt state migration
2. Show and Tell:
   - add Show and Tell mode inside Whiteboard
   - preserve ephemeral semantics: no durable storage by default
   - add `show-and-tell -> whiteboard` redirect with notice/state entry
3. Would You Rather:
   - add prompt pack inside Drawing Telephone
   - import `shippie:wyr:v1` into `drawing-telephone.wyr.*`
   - expose "your past answers" sheet
   - expand Drawing Telephone `data.localStorage` to include old key and
     new prefix before deleting WYR
   - add `would-you-rather -> drawing-telephone` redirect with prompt
     pack entry
4. Delete retired source apps only after notices, redirects, and import
   tests pass.
5. Regenerate catalog/curation and remove orphan bakes.

Verification:

- WYR history import is idempotent and visible
- old slugs redirect indefinitely
- Whiteboard and Drawing Telephone pass arcade purity/CSP
- two-phone room smoke for Match Room and Whiteboard

### Release 4 — Recipe absorption

Implementation steps:

1. Add Recipe bottom tab shell:
   - Recipes
   - Shopping
   - Meal Plan
   - Pantry
2. Move UI modules into Recipe while keeping each storage namespace
   isolated for this release.
3. Expand Recipe `shippie.json` data policy to cover:
   - Recipe SQLite/document migration state
   - Meal Planner localStorage key(s)
   - Shopping List localStorage keys/prefixes and OPFS metadata key(s)
   - Pantry Scanner localStorage keys
4. Pantry tab:
   - contextual camera prompt
   - no product-side permission grandfathering
5. Shopping tab:
   - keep list-specific share action
   - platform share/options remains Recipe-level
6. Delete retired source apps only after data appears in Recipe on first
   launch.
7. Regenerate catalog/curation and remove orphan bakes.

Verification:

- existing Meal Planner, Shopping List, and Pantry Scanner data appears
  in Recipe
- Recipe cold-load budget checked on mobile viewport
- tab navigation is thumb-reachable and stable
- Recipe data policy captures all imported namespaces

### Global release checklist

Run after every release:

1. App-specific `bun test`, `bun run typecheck`, and `bun run build` for
   touched showcase apps.
2. Platform typecheck and relevant route/manifest tests.
3. `prepare-showcases` / generated catalog refresh.
4. Orphan-bake cleanup under `apps/platform/static/__shippie-run/`.
5. `git diff --check`.
6. Browser smoke on the focused `/run/<slug>/` path for each changed app.
7. Real-phone smoke for releases that change mobile UX, camera, or room
   joining.
