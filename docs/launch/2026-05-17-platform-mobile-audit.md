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
