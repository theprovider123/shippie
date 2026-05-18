# Mobile-audit — static rules report

_Generated 2026-05-18T14:02:20.130Z_

Allowed shell breakpoints: max-width 640/1024, min-width 641/1025.
Allowed density (grid-column) breakpoints: min-width 1280/1536/1920.
Tap-target floor: 44px (Apple HIG).
iOS Safari zooms inputs with font-size < 16px on focus.

Findings: 11 breakpoint drift, 0 tap-target, 0 input-zoom.

## Breakpoint drift
- `apps/platform/src/lib/styles/tokens.css`
  - L104: `min-width: 1440px`
  - L216: `min-width: 1440px`
- `apps/platform/src/routes/admin/+layout.svelte`
  - L95: `max-width: 720px`
- `apps/platform/src/routes/admin/profile/+page.svelte`
  - L221: `max-width: 980px`
  - L225: `max-width: 680px`
- `apps/platform/src/routes/apps/[slug]/+page.svelte`
  - L708: `max-width: 480px`
  - L926: `max-width: 520px`
- `apps/platform/src/routes/arcade/+page.svelte`
  - L99: `max-width: 720px`
- `apps/platform/src/routes/build/+page.svelte`
  - L180: `min-width: 1024px`
- `apps/platform/src/routes/dashboard/+layout.svelte`
  - L27: `max-width: 720px`
- `apps/platform/src/routes/dashboard/apps/[slug]/profile/+page.svelte`
  - L94: `max-width: 720px`

## Tap-target floor
_None._

## Input-zoom risk (iOS Safari)
_None._
