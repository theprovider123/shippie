# 2026-05-17 — Showcase design-system review & improvement plan

Companion to [`2026-05-17-launch-slate-consolidation.md`](./2026-05-17-launch-slate-consolidation.md).
Captures the current design-system state across 38+ showcase apps + the
platform, and the agreed direction for improvement.

## Current state (verified 2026-05-17)

**What exists:** `@shippie/design-tokens` ships 14 CSS variables (brand
colors, typography, spacing, motion). The platform consumes them
directly. About **30 of 58 showcase apps import them**; the rest are
either ad-hoc or partially-overriding.

**Brand language (platform):**
- Palette: sunset orange `#E8603C`, sage moss `#5E7B5C`, marigold
  `#E8C547`, on warm-pitch black `#14120F` or oat-paper light bg
- Type: Fraunces serif (headlines), Inter (body), JetBrains Mono (caps)
- Sharp corners (`border-radius: 0`), no soft shadows, 1px hairline
  borders
- Container chrome (`AppFrameHost.svelte`) is deliberately invisible
  so each showcase owns its own visual identity

**Best-in-class showcases:** Crewtrip (Fraunces italic + warm sun-halo
gradient + paper shadows), Match Room (cream + pitch-green + gold,
inset button bevels, semantic per-feature color), Mevrouw (oklch
forest + antique brass, 1rem corners, Tailwind discipline). These
succeed via **considered deviation**, not by following the brand
rigidly.

**Wild-west:** Daily Puzzle, Five Letter, Quartet, Stack, Chess all
copy-paste an identical light-mode override
(`#F8F1E0` bg, `#2A1F16` fg, `#4FA487` mint accent) with no shared
file. Voice Memo, Coffee, Tab define bespoke accents (`#A86060`
mustard) inline as hex literals. Whiteboard has **no styles.css at
all** — palette literals live in JS. Receipt Snap + Recipe import
tokens then immediately redefine `--bg` and `--fg`.

**Biggest cross-app divergences:**

| Axis | Brand | Reality across 58 apps |
|---|---|---|
| Color encoding | hex | hex + oklch + per-app CSS vars, no unified strategy |
| Type scale | platform uses `clamp()` fluid | most showcases hardcode px |
| Radius | `0` | 0 / inset-bevel / 1rem all in use |
| Shadows | none | none / layered rgba / real box-shadow |
| Spacing | `--space-xs..4xl` scale | almost nobody uses it; 12/16/18px hardcoded |
| Mode | dark default, oat-paper light variant | 40 apps go light, half use ad-hoc cream not the canonical |

## Guiding principle (locked)

**Curate polish over uniformity.** The monorepo works *because* apps
feel like designed products, not stamps from a press. The plan
strengthens the baseline (token adoption, light-mode parity, shared
atoms) and templates the *reasoning* behind a justified deviation. It
does **not** try to make every app look identical.

---

## Phase 1 — Token adoption + convention doc (2 days)

**Goal.** Every showcase imports `@shippie/design-tokens`. Document
when overriding is OK and when it isn't. Land a one-page convention
doc that future apps can copy.

### Work

- Sweep all 58 `styles.css` files. For each:
  - If no token import → add it
  - If overriding `--bg` / `--fg` without comment → either remove the
    override, or add a `/* DEVIATION: <reason> */` comment
  - If using ad-hoc hex literals for accents → either swap to the
    canonical accent tokens or document the deviation
- Write `docs/design-system/conventions.md` covering:
  - Which tokens are mandatory (bg/fg, fonts, spacing scale)
  - Which can be overridden with documented reason (accents, mode)
  - Which must never change (radius `0`, hairline border discipline)
  - The "considered deviation" template (Crewtrip + Match Room as
    worked examples)
- Add a pre-commit / CI check that flags ad-hoc hex literals in
  showcase `styles.css` without an adjacent `DEVIATION` comment

### Files

- `apps/showcase-*/src/styles.css` (sweep all)
- `docs/design-system/conventions.md` (new)
- `apps/platform/scripts/lint-showcase-styles.mjs` (new, optional CI)

### Ship criteria

1. 58/58 showcases import `@shippie/design-tokens`
2. Every override has a documented reason
3. `docs/design-system/conventions.md` exists and is linked from
   `CLAUDE.md` + showcase scaffolding template
4. `bun run health` green

---

## Phase 2 — Extract `@shippie/showcase-ui` (3 days)

**Goal.** Six repeated patterns become a thin shared CSS+JSX library
so future showcases don't rediscover them.

### Patterns to extract (from audit)

1. **AppShell** — `.app { max-width: 480px; padding: calc(20px + safe-area-inset) }`
   plus `.app-header`, `.subtitle`, `.eyebrow` typography classes
2. **Tabs** — the `.tabs / .tab-active` border-bottom pattern hand-rolled
   in Coffee, Voice Memo, Tab, others
3. **PrimaryButton** — the bottom-pinned action button with
   safe-area-clearing padding-bottom
4. **EmptyState** — Showcase-kit's `<section class="launch-recent">`
   pattern (label + ul + muted footer)
5. **ModeToggle** — standardised light/dark switch primitive built on
   `[data-theme="light"]` (matches platform convention)
6. **BottomSheet** — the pattern Phase 1A of the consolidation plan
   relies on for Coffee/Dough — extract it generically so future apps
   reach for it instead of rebuilding

### Package shape

- Pure CSS exports (no JS dependency for layout primitives)
- Optional React subpath for components that need state (BottomSheet,
  ModeToggle)
- Two tone presets: `brand` (dark default) + `cream` (oat-paper light)
- Co-locates with `@shippie/design-tokens` — UI lib *consumes* tokens,
  doesn't ship its own

### Files

- `packages/showcase-ui/` (new)
- `packages/showcase-ui/src/{app-shell,tabs,primary-button,empty-state,mode-toggle,bottom-sheet}.{css,tsx}`
- `packages/showcase-ui/package.json` — `exports.types` + `exports.import`
  → `./src/index.ts` (per CLAUDE.md workspace pattern, not `dist/`)

### Ship criteria

1. Package builds + typechecks clean
2. At least 5 existing showcases migrated to use the new primitives
   (recommend: Coffee, Voice Memo, Tab, Five Letter, Quartet — they
   all have hand-rolled versions of these patterns today)
3. Light-mode preset renders coherently across the 5 migrated apps
4. No visual regression — fresh-visit smoke before/after on real
   iPhone

---

## Phase 3 — Light-mode parity contract (2 days)

**Goal.** Sanction one canonical light mode (oat-paper / cream) and
get the 40 light-mode apps onto it. Eliminate the copy-pasted
`#F8F1E0 + #2A1F16 + #4FA487` cluster.

### Work

- Extend `@shippie/design-tokens` with an explicit `[data-theme="light"]`
  block defining `--bg`, `--fg`, `--accent-primary`, `--accent-warm`,
  etc. for cream mode (this is partially there but not surfaced as
  "use this for light mode")
- Migrate Daily Puzzle / Five Letter / Quartet / Stack / Chess off
  their copy-pasted light overrides onto the canonical set
- Document in `docs/design-system/conventions.md` (Phase 1) when an
  app should be light vs dark, and the one approved cream palette

### Files

- `packages/design-tokens/src/tokens.css` — add the light block
- `apps/showcase-{daily-puzzle,five-letter,quartet,stack,chess}/src/styles.css`
  — remove copy-pasted overrides, rely on `[data-theme="light"]`

### Ship criteria

1. The 5 listed apps render identical-or-better visually after
   migration
2. Canonical cream tokens documented and referenced by all light-mode
   apps
3. No app defines its own `#F8F1E0` literal

---

## Phase 4 — Wild-west cleanup (3 days)

**Goal.** Bring the audit's flagged apps (ad-hoc hex literals, missing
styles.css, redefining `--bg` after importing tokens) up to the
baseline established in Phases 1–3.

### Targets

| App | Issue | Fix |
|---|---|---|
| Whiteboard | No `styles.css`, palette literals in JS | Extract to `styles.css`, adopt tokens |
| Voice Memo | `--accent-strong: #A86060` ad-hoc | Either replace with canonical accent or document deviation |
| Coffee | Inline hex accents | Same |
| Tab | Mustard hex inline | Same |
| Receipt Snap | Imports tokens then overrides `--bg`/`--fg` | Either commit to override (document) or drop it |
| Recipe | Same as Receipt Snap | Same |

### Files

- The 6 apps above — `src/styles.css` + any JS that hard-codes color

### Ship criteria

1. Each app passes the Phase 1 lint check
2. Fresh-visit smoke confirms no visual regression on real iPhone
3. Each documented deviation has a defensible reason recorded inline

---

## Phase 5 — Per-app polish pass (5 days, ongoing)

**Goal.** Walk every showcase on real iPhone and score it against the
"considered deviation" template. Output is a per-app TODO of what
would lift each from "fine" to "polished."

### Score axes (per app)

- **First-screen clarity:** is there one obvious primary action?
- **Type pairing:** is the heading/body relationship intentional?
- **Color provenance:** does every non-token color have a reason?
- **Spacing rhythm:** does it use the token scale, or hardcoded px?
- **Mode coherence:** does dark/light render equally well?
- **Touch targets:** ≥44px on every interactive element?
- **Cold-load feel:** does the first paint look settled or unfinished?

### Output

Per-app TODO list in `docs/launch/showcase-polish-todo.md`, sortable
by leverage. Polish work then happens in small per-app PRs against
that list, not as one giant sweep.

### Ship criteria

1. All 58 showcases scored
2. TODO doc committed and prioritised
3. Top 10 apps' first-priority items shipped (Hero Proof apps first)

---

## Cross-cutting concerns

### Interaction with consolidation plan

Phase 2 of this plan (`@shippie/showcase-ui`) is a natural prereq for
the consolidation plan's Phase 4 (Recipe absorption — needs the
bottom-tab primitive). Sequence: design-system Phase 1 + 2 → then
consolidation Phase 4 can lean on the extracted primitives.

### Don't re-architect Crewtrip / Match Room / Mevrouw

These three are the *reference* for considered deviation. The plan
brings the baseline up to meet them, not the other way around. No
changes to these apps in any phase unless they explicitly violate a
new convention (unlikely — they were the convention informers).

### `packages/juice` is not the design system

Juice ships audio + particles + react helpers. It is **not** the
design-tokens package and shouldn't grow design-system responsibility.
Keep `@shippie/design-tokens` and the new `@shippie/showcase-ui`
separate; juice can consume them but doesn't own them.

---

## Suggested order of operations

1. **Phase 1** — token adoption + convention doc (2d, prereq for everything)
2. **Phase 3** — light-mode parity contract (2d, can run in parallel with Phase 2)
3. **Phase 2** — extract `@shippie/showcase-ui` (3d)
4. **Phase 4** — wild-west cleanup (3d, after Phase 2 so they can adopt the primitives)
5. **Phase 5** — per-app polish pass (5d, ongoing)

Total: ~12–15 days focused work, spread across 5 ship-able releases.

---

## Out of scope

- Replacing Tailwind in Mevrouw (works, no value in changing it)
- Standardising icon set (separate brainstorm; depends on whether we
  adopt Lucide / Phosphor / custom)
- Animation library (existing motion vars + per-app discretion is
  fine until a real pattern emerges)
- Container chrome redesign (`AppFrameHost.svelte` is deliberately
  invisible — leave it)
