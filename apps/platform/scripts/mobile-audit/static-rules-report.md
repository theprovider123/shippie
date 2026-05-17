# Mobile-audit — static rules report

_Generated 2026-05-17T17:07:17.032Z_

Allowed shell breakpoints: 640, 1024.
Allowed density (grid-column) breakpoints: 1280, 1536, 1920.
Tap-target floor: 44px (Apple HIG).

Findings: 24 breakpoint drift, 24 tap-target.

## Breakpoint drift
- `apps/platform/src/lib/components/layout/Nav.svelte`
  - L246: `min-width: 768px`
- `apps/platform/src/lib/components/marketplace/AppInspector.svelte`
  - L373: `max-width: 520px`
- `apps/platform/src/lib/container/your-data/AppDataSheet.svelte`
  - L193: `min-width: 700px`
- `apps/platform/src/lib/container/your-data/RecoverySheet.svelte`
  - L123: `min-width: 700px`
- `apps/platform/src/lib/container/your-data/YourDataTab.svelte`
  - L219: `min-width: 1100px`
- `apps/platform/src/lib/styles/tokens.css`
  - L90: `min-width: 1440px`
  - L193: `min-width: 1440px`
- `apps/platform/src/routes/+page.svelte`
  - L554: `max-width: 820px`
  - L570: `max-width: 560px`
  - L642: `min-width: 720px`
- `apps/platform/src/routes/admin/+layout.svelte`
  - L95: `max-width: 720px`
- `apps/platform/src/routes/admin/analytics/+page.svelte`
  - L303: `max-width: 980px`
  - L308: `max-width: 680px`
- `apps/platform/src/routes/admin/profile/+page.svelte`
  - L221: `max-width: 980px`
  - L225: `max-width: 680px`
- `apps/platform/src/routes/apps/[slug]/+page.svelte`
  - L685: `max-width: 480px`
  - L865: `max-width: 520px`
- `apps/platform/src/routes/arcade/+page.svelte`
  - L99: `max-width: 720px`
- `apps/platform/src/routes/container/+page.svelte`
  - L3399: `max-width: 900px`
- `apps/platform/src/routes/dashboard/+layout.svelte`
  - L27: `max-width: 720px`
- `apps/platform/src/routes/dashboard/apps/[slug]/access/+page.svelte`
  - L205: `max-width: 760px`
  - L208: `max-width: 520px`
- `apps/platform/src/routes/dashboard/apps/[slug]/profile/+page.svelte`
  - L94: `max-width: 720px`
- `apps/platform/src/routes/new/+page.svelte`
  - L383: `max-width: 860px`

## Tap-target floor
- `apps/platform/src/lib/components/dashboard/CreateInviteForm.svelte`
  - L112: `height: 40px` in `button`
- `apps/platform/src/lib/components/dashboard/PrivateSpaceShareComposer.svelte`
  - L487: `height: 40px` in `button`
- `apps/platform/src/lib/components/layout/Nav.svelte`
  - L182: `width: 32px` in `.nav-user`
  - L183: `height: 32px` in `.nav-user`
  - L199: `width: 36px` in `.nav-toggle`
  - L200: `height: 36px` in `.nav-toggle`
- `apps/platform/src/lib/components/marketplace/AppInspector.svelte`
  - L243: `width: 32px` in `.close`
  - L244: `height: 32px` in `.close`
  - L290: `min-height: 38px` in `.actions button`
- `apps/platform/src/lib/components/marketplace/LauncherCard.svelte`
  - L432: `width: 34px` in `.quick-actions button`
  - L433: `height: 34px` in `.quick-actions button`
  - L483: `width: 40px` in `.quick-actions button`
  - L484: `height: 40px` in `.quick-actions button`
- `apps/platform/src/lib/container/your-data/AccessPane.svelte`
  - L117: `min-height: 32px` in `.revoke-button`
- `apps/platform/src/lib/container/your-data/BackupPane.svelte`
  - L158: `min-height: 40px` in `.segmented button`
- `apps/platform/src/lib/container/your-data/ToolsPane.svelte`
  - L257: `min-height: 36px` in `.waiting-actions button`
  - L285: `min-height: 40px` in `.export-button`
- `apps/platform/src/routes/container/+page.svelte`
  - L3546: `width: 42px` in `.focused-chrome-button`
  - L3592: `width: 36px` in `.focused-chrome-button.input-region-all`
  - L3607: `width: 42px` in `.focused-chrome-button.input-region-all:focus-visible`
  - L3657: `width: 20px` in `.focused-chrome-button img`
  - L3658: `height: 20px` in `.focused-chrome-button img`
  - L3679: `width: 40px` in `.focused-chrome-button`
- `apps/platform/src/routes/new/upload-form.svelte`
  - L407: `min-height: 34px` in `.action-row a`
