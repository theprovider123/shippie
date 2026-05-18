# Mobile-audit — static rules report

_Generated 2026-05-18T12:09:33.787Z_

Allowed shell breakpoints: max-width 640/1024, min-width 641/1025.
Allowed density (grid-column) breakpoints: min-width 1280/1536/1920.
Tap-target floor: 44px (Apple HIG).
iOS Safari zooms inputs with font-size < 16px on focus.

Findings: 14 breakpoint drift, 0 tap-target, 0 input-zoom.

## Breakpoint drift
- `apps/platform/src/lib/container/your-data/YourDataTab.svelte`
  - L220: `min-width: 1100px`
- `apps/platform/src/lib/styles/tokens.css`
  - L104: `min-width: 1440px`
  - L216: `min-width: 1440px`
- `apps/platform/src/routes/admin/+layout.svelte`
  - L95: `max-width: 720px`
- `apps/platform/src/routes/admin/profile/+page.svelte`
  - L221: `max-width: 980px`
  - L225: `max-width: 680px`
- `apps/platform/src/routes/apps/[slug]/+page.svelte`
  - L685: `max-width: 480px`
  - L903: `max-width: 520px`
- `apps/platform/src/routes/arcade/+page.svelte`
  - L99: `max-width: 720px`
- `apps/platform/src/routes/build/+page.svelte`
  - L180: `min-width: 1024px`
- `apps/platform/src/routes/container/+page.svelte`
  - L3428: `max-width: 900px`
- `apps/platform/src/routes/dashboard/+layout.svelte`
  - L27: `max-width: 720px`
- `apps/platform/src/routes/dashboard/apps/[slug]/profile/+page.svelte`
  - L94: `max-width: 720px`
- `apps/platform/src/routes/new/+page.svelte`
  - L383: `max-width: 860px`

## Tap-target floor
_None._

## Input-zoom risk (iOS Safari)
_None._
