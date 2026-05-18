# Platform mobile audit — PR0 harness

_Date: 2026-05-17. Owner: platform shell. Companion docs: `2026-05-17-showcase-mobile-pwa-review.md` (showcases, separate), `2026-05-17-showcase-uxui-simplification-plan.md` (UX simplification)._

## Goal

Every user-facing route in `apps/platform/` passes the ten acceptance criteria below at five viewports. "Feels like an app" becomes testable: a row that's all ✓ is shipped; a row with ✗ has a tracked owner and PR.

## Non-goals

- New routes or features. We fix what exists.
- Brand or visual identity changes. Tokens + primitives only.
- The showcases under `/run/[slug]/`. Each ships its own design; the showcase audit doc is separate.
- Native app store distribution.

## Acceptance criteria (per route × per viewport)

1. **No horizontal scroll.** Body width never exceeds viewport.
2. **First action visible.** A meaningful interactive element fits within the first viewport height. No long preamble of eyebrow + h1 + lede + status before the user can do anything.
3. **Tap targets ≥ 44×44 px.** Apple HIG floor on every interactive element.
4. **Inputs ≥ 16px font-size.** Prevents iOS focus-zoom on `<input>`, `<textarea>`, `<select>`.
5. **`env(safe-area-inset-bottom)` respected.** Sticky/fixed bottom regions don't clip under the home indicator.
6. **Dialogs are dialogs.** `role="dialog"` + `aria-modal="true"` + `aria-labelledby`; focus trap; escape & browser-back dismiss; body scroll lock with scroll restoration; `prefers-reduced-motion: reduce` honoured.
7. **No centred modals on mobile.** Below 640px, all dialogs render as bottom sheets.
8. **No desktop rail stacked above content.** Sidebars don't collapse by stacking; they become a route, a sheet, or a bottom nav.
9. **OSK-safe.** With the on-screen keyboard open, the primary CTA remains tappable; no `100vh` jail.
10. **PWA standalone awareness.** `matchesStandalone()` adjusts chrome: hide sign-in nav, offset bottom nav for home indicator, suppress "open in new tab" links.

## Viewport matrix

| Tag | px | Device class | Notes |
|---|---|---|---|
| **360×780** | 360w | small Android (Galaxy S8 / Pixel 3a) | tightest practical width |
| **390×844** | 390w | iPhone 12-14 Pro | typical iOS test bed |
| **430×932** | 430w | iPhone 15/16 Pro Max | widest "phone" |
| **768×1024** | 768w | iPad portrait | compact tier boundary |
| **PWA** | varies | Chrome `display-mode: standalone` | safe-areas active, no URL bar |

## Running the audit

```sh
# 1. Regenerate the route inventory + sidecar markdown table.
bun apps/platform/scripts/mobile-audit/route-inventory.mjs

# 2. Run the static-rules scan (breakpoints + tap targets).
bun apps/platform/scripts/mobile-audit/audit-static-rules.mjs

# 3. Open the per-route table at
#    apps/platform/scripts/mobile-audit/route-inventory.md
#    and step through each row × viewport in a real browser /
#    simulator, marking · → ✓ or ✗ with a note.
```

The two scripts are zero-dep `bun` modules; they don't require Playwright. A browser-based screenshot harness is a future PR.

## Current state by shell

Findings as of 2026-05-17 audit (`audit-static-rules.mjs` baseline at `static-rules-report.md`):

| Shell | Routes | Stacking sidebar above content on mobile? | Primary mobile nav | Status |
|---|---|---|---|---|
| `container` (`/container`) | 1 | **Yes** — `+page.svelte:3399` stacks at ≤900px | Hamburger (top-right of global nav) | P0 redo (PR2) |
| `dashboard` (`/dashboard/*`) | 11 | **Yes** — `dashboard/+layout.svelte:27` stacks 240px rail at ≤720px | Hamburger | P0 redo (PR3) |
| `admin` (`/admin/*`) | 5 | **Yes** — `admin/+layout.svelte:95` stacks at ≤720px | Hamburger | P3 polish (PR3) |
| `public` | 15 | No (mostly content) | Hamburger | P1-P2 polish (PR5) |
| `auth` (`/auth/*`) | 2 | No | n/a (no global nav on auth pages) | P1 polish (PR4) |
| `onboarding` (`/new`, `/invite/[token]`) | 2 | No | Hamburger | P1 polish (PR4) |
| `showcase-wrapper` (`/run/[slug]`) | 1 | n/a (renders inside container) | n/a | covered by container |
| `dev` (`/dev/*`) | 1 | n/a | n/a | not in scope |

Global nav (`Nav.svelte`) tap-target violations:
- Avatar: 32×32 (`:178`) — bump to 44.
- Hamburger toggle: 36×36 (`:194`) — bump to 44.
- AppInspector close button: 32×32 (`AppInspector.svelte:243`) — bump to 44.

## Static-rules baseline (2026-05-17)

- Breakpoint drift: **24 findings across 17 files.** Non-canonical breakpoints in active use include 520, 560, 680, 700, 720, 760, 768, 820, 860, 900, 980, 1100, 1440. Canonical: shell = {640, 1024}, density = {1280, 1536, 1920}.
- Tap-target floor: **24 findings across 10 files.** Includes Nav avatar/toggle, AppInspector close, several `.close` buttons under 32-38px.

Full report regenerates at `apps/platform/scripts/mobile-audit/static-rules-report.md` on each run.

## PR sequence (overview)

| PR | Scope | Done when |
|---|---|---|
| **PR0** _(this doc)_ | Inventory script, static-rules script, audit doc, viewport matrix, acceptance criteria | Scripts run, doc lists every route, baseline counts recorded |
| **PR1** | Primitives: `<Sheet>`, `<BottomNav>`, `<AppShell>`, `<PageHeader>`. Tokens for touch + safe-area. Migrate `TransferPromptModal` + `IntentPromptModal` to `<Sheet>`. Nav avatar 36→44, toggle 36→44. | Primitives exported; 2 modal migrations green |
| **PR2** | Container shell migration: `mode="container"` with BottomNav. Sidebar info → "≡ Shippie" sheet. | `/container` row in matrix all ✓ |
| **PR3** | Dashboard + Admin shell migration | `/dashboard/*` and `/admin/*` rows all ✓ |
| **PR4** | Marketplace + app detail + auth + invite + `/new` | All P1 rows ✓ |
| **PR5** | Content/magazine pages (`/`, `/today`, `/glance`, `/build`, `/professionals`, `/why`, `/docs`, `/labs`, `/arcade`, `/leaderboards`, `/whitepaper`, `/trust-preview`) | Public rows all ✓ |
| **PR6** | Viewport policy: drop `user-scalable=no` from platform shell only; update `pipeline.test.ts:35,46` to assert the policy split; wire `matchesStandalone()` into nav adjustments | Test green, manual standalone smoke ok |

## Route matrix

Generated from `apps/platform/scripts/mobile-audit/route-inventory.md`. Re-run the inventory script to refresh. Mark cells: `·` not-checked, `✓` pass, `✗` fail (with note).

> 38 routes — 1 container, 11 dashboard, 5 admin, 15 public, 2 auth, 2 onboarding, 1 showcase-wrapper, 1 dev.

See the sidecar file for the full table; copy it into this doc when ready to start checking.

## What gets nailed down next

Once PR0 lands the harness, **PR1 starts the primitives**. The cascading promise: PR2 is the headline mobile fix for the user's "Your Data still looks horrible" complaint — single-pane container shell + BottomNav. After PR2 ships, the gap between "the app feels desktop-first" and "feels like an app" should be obviously closed on `/container`. PR3-6 finish the rest of the platform.

---

## Revisions (2026-05-18)

PR0 (harness) and PR #13's seven showcase phases shipped to prod on 2026-05-18 07:21 UTC (worker `e2aa57c8`). With the harness in production hands, the original PR1 was too big and the sequencing put `/container` before mobile users actually arrive on it. This revision sharpens the plan against HEAD without throwing the original away.

### What's already done (subtract from PR1)

- ✅ PR0 harness (`apps/platform/scripts/mobile-audit/`) — landed in PR #13.
- ✅ Phase 1–7 showcase mobile work — landed in PR #13 (Recipe/Steep/Ledger banner slot, onboarding fade, bottom-nav restructure for Coffee/Dough/Lift/Ledger, toolbar/modal collapse on Whiteboard/Touch, game first-screen polish on Five Letter/Quartet, Match Room hero deferral, Mevrouw full IA restructure).
- ✅ Your Data redesign as Devices/Tools/Backup segmented panes — landed in PR #13.
- ✅ SDK bottom-sheet styling for the Your Data overlay — landed in PR #13.

### New PR0.5 — Snapshot the post-deploy baseline

Re-run the harness against HEAD post-deploy; commit the snapshots to `docs/launch/mobile-audit-snapshots/`:

- `2026-05-18-route-inventory.md`
- `2026-05-18-static-rules.md`
- `2026-05-18-tokens.md`

Subsequent PRs must attach a fresh snapshot diff vs the previous date as evidence; otherwise we can't tell if drift went up or down.

Owner scripts: `route-inventory.mjs`, `audit-static-rules.mjs`, and `audit-tokens.mjs` write the working reports under `apps/platform/scripts/mobile-audit/`. PR0.5 copies those outputs to the dated snapshot paths on each run.

Current PR0.5/PR1a-c result after the first foundation pass:

- Static tap-target findings: **24 → 0**.
- Static breakpoint drift: **23 → 17**.
- Token safe-area findings: **1 → 0**.
- Token input font-size findings: **11 → 0**.

### Split PR1 into PR1a + PR1b

The original PR1 bundled four primitives + tokens + Nav fixes + two modal migrations. That's too many independent decisions in one review.

- **PR1a** — `<Sheet>` primitive only. Promote `RecoverySheet.svelte` to `lib/components/ui/Sheet.svelte` with focus trap, escape/back dismissal, body scroll lock, reduced-motion, safe-area padding, `role="dialog"` + `aria-modal` + `aria-labelledby`. Migrate `RecoverySheet` + `AppDataSheet` to consume it. **Defer** `IntentPromptModal` + `TransferPromptModal` migration to PR1c — a separate change keeps the primitive review focused on a11y, and the modal migrations focused on call-site rewrites.
- **PR1b** — Tokens + audit scripts. Add to `tokens.css`:
  - Document the canonical CSS breakpoint convention: shell edges are `max-width: 640px`, `min-width: 641px`, `max-width: 1024px`, `min-width: 1025px`; density edges are `min-width: 1280px`, `1536px`, and `1920px`. CSS vars cannot drive `@media`, so this phase keeps a documented convention plus script enforcement instead of adding a PostCSS dependency.
  - `--touch-min: 44px;` token.
  - `--type-body-mobile: 16px;` token (no iOS focus zoom).
  - `--safe-bottom: env(safe-area-inset-bottom)` already present at `tokens.css:15`; add `--safe-top` if missing.
  - Update `apps/platform/scripts/mobile-audit/audit-static-rules.mjs` to understand the canonical min/max breakpoint edges.
  - New script `apps/platform/scripts/mobile-audit/audit-tokens.mjs` — flags input font-size floors and bottom-positioned regions missing safe-area padding. Runs alongside the existing static-rules script. **No visual change.**
- **PR1c** — `IntentPromptModal` + `TransferPromptModal` migration to `<Sheet>`. Also bump Nav avatar 32→44, hamburger 36→44, AppInspector close 32→44 — the three Nav fixes from the original PR1.

### Re-sequence: public surfaces before `/container`

The user's first encounter with Shippie on a phone is `/` (apex) → `/apps` → `/apps/[slug]` → install → only THEN `/container`. The original PR2 fixed return-user feel, not first-impression feel. Re-sequence:

| New PR | Replaces | Scope | Why this order |
|---|---|---|---|
| **PR0.5** | — | Baseline snapshot | Without a dated "before," no PR has measurable pass/fail. |
| **PR1a** | half of PR1 | `<Sheet>` primitive | Foundation for every dialog migration. |
| **PR1b** | half of PR1 | Tokens + `audit-tokens.mjs` | Foundation for every shell PR. Zero visual change. |
| **PR1c** | other half of PR1 | Existing modal → `<Sheet>` migrations + Nav tap targets | Quick visible wins; unblocks dialog work in PR2+. |
| **PR2 (new)** | old PR5 partial | `/`, `/apps`, `/apps/[slug]` mobile-first pass | First-visit = first-impression. 60-second README promise. |
| **PR3 (new)** | old PR2 | `/container` launcher-mode shell migration | Headline fix for "Your Data still looks horrible". **Scope explicitly excludes `?focused=1` mode** — that path already strips chrome and is single-pane; touching it would regress the marketplace one-button-collapse contract. |
| **PR4 (new)** | old PR3 | `/dashboard/*` + `/admin/*` shell migration | Both have desktop rails that stack — share one fix. |
| **PR5 (new)** | old PR4 | `/auth/login`, `/invite/[token]`, `/c/[hash]`, `/new` | Invite acceptance is mobile-critical. |
| **PR6 (new)** | old PR5 + old PR6 | Content pages (`/today`, `/glance`, `/build`, `/professionals`, `/why`, `/docs`, `/labs`, `/arcade`, `/leaderboards`, `/whitepaper`, `/trust-preview`) + viewport policy review + standalone polish | Lowest-risk last; viewport policy needs deliberate `pipeline.test.ts` update. |

### Showcase mobile-certification — parallel track

PR #13 made 12 of 62 showcases mobile-first. The remaining 50 lag. After the platform shell migrates (PR3+), the mismatch will be the next complaint: launcher chrome feels app-like; the apps themselves don't. Two options, **pick one before PR2 lands**:

- **Cert gate**: `apps/platform/scripts/prepare-showcases.mjs` runs each showcase through a mobile-cert check (`@viewport`, no horizontal scroll, tap floor, input font-size, sticky CTA safe-area). Failing showcases get excluded from `/apps` until they pass. Mechanical, harsh, ships hygiene.
- **Parallel track**: separate workstream sweeps the remaining 50 showcases. Doesn't gate launch, but doesn't fix the mismatch automatically either.

### Conflict-management

PRs 3–6 all touch shared platform files. To avoid merge conflicts cascading:

- **Moratorium**: no edits to `apps/platform/src/routes/container/+page.svelte`, `dashboard/+layout.svelte`, `admin/+layout.svelte`, or `lib/components/layout/Nav.svelte` outside the migration PRs while PR3–PR6 are in flight. Other Codex tracks must stage feature work and rebase after PR6 merges.
- **Or worktree**: do the shell migration on a feature branch via git worktree. Adds setup cost but isolates conflict surface.

### Per-PR evidence requirement

Every PR after PR0.5 attaches as evidence:

1. Fresh `audit-static-rules.mjs` report → diff vs prior snapshot (delta in findings count).
2. Fresh `audit-tokens.mjs` report → diff vs prior snapshot (after PR1b lands).
3. Manual screenshots at the four viewport widths from the matrix for every route the PR touched.

Screenshots can be captured manually until the screenshot harness exists; eventually a Playwright script in `apps/platform/scripts/mobile-audit/screenshot-matrix.mjs` would emit them as CI artifacts.

### Acceptance criteria — unchanged

The ten criteria above remain canonical. PR3–6 each cite which criteria they discharge for which routes. A PR is mergeable only when every route × viewport cell in its scope reads ✓.

### Open decisions (block PR2 until resolved)

1. **Cert gate vs parallel track for showcases** — pick one.
2. **Snapshot destination** — locked to both: PR artifact for review, repo file for trend.
3. **One operator or two** — if Claude + Codex run in parallel, the moratorium is binding. If solo, advisory.
