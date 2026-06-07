# Dock Visual Unification Plan

> Follow-on to the Dock desktop redesign. Goal: collapse the dock's **four competing design systems** into ONE — the dark Shippie token system — and restrict accents to the brand palette. Decisions (user-confirmed 2026-06-06): **all surfaces dark (no cream/paper islands, incl. the switcher drawer + share cards)**; **accents = sunset/sage/marigold + slug-hashed warm hues only (no violet/steel-blue)**.

**Branch:** `feat/dock-desktop-redesign` (worktree). Each task: edit → `bun run build` (catches scoping) → guardrail test where sensible → commit. Final: `bun run health` + visual screenshots.

## Principle
Every dock surface consumes dark tokens (`--bg #14120F`, `--bg-pure #0F0D0A`, `--surface #1E1A15`, `--surface-alt #252019`, `--text #EDE4D3`, `--text-secondary #B8A88F`, `--border-light #2E2822`) and brand accents (`--sunset`, `--sage-moss`, `--marigold`). No raw `rgba(255,255,255,…)`/cream literals, no `--paper-warm`/`--ink-warm`/`--cream-*` as product surfaces, no `--accent-violet`/`--info`.

## Tasks (grounded in the audit; file:line targets)

### U1 — Dark empty-state hero
`apps/platform/src/lib/container/DockEmptyState.svelte`
- `.hero` bg `var(--paper-warm,#faf7ef)` → `var(--surface)`; border stays `--border-light`.
- `.hero-title` `var(--ink-warm,#2a251e)` → `var(--text)`; `.hero-sub` `var(--text-muted-warm,#8b847a)` → `var(--text-secondary)`.
- `.hero-eyebrow`/`.starters-label` keep mono but use `--text-light`/`--sunset`.
- Guardrail test: source contains no `paper-warm`/`ink-warm`/`#faf7ef`.

### U2 — Dark running-app surface
`apps/platform/src/lib/container/app-srcdoc.ts`
- Fallback `<body>` `background:#fffaf2; color:#211d18` → `background:#0F0D0A; color:#EDE4D3` (dark). Keep `app.accent` for the `.tag` (now reads as accent-on-dark).
`apps/platform/src/lib/container/AppFrameHost.svelte`
- `.frame-loader` already `var(--bg)` — keep.
- `.frame-recovery` bg `rgba(255,250,242,0.96)` → `var(--surface)`; text/border → `--text`/`--border-light`; keep the sunset error border but via `color-mix(--sunset)`.
- Guardrail: app-srcdoc has no `#fffaf2`.

### U3 — InsightStrip → dark tokens
`apps/platform/src/lib/container/InsightStrip.svelte`
- `.insight-card` `rgba(255,255,255,.6)` → `var(--surface)`; `.low` → `var(--surface)`; `.high` keep sunset tint via `color-mix(in srgb, var(--sunset) 8%, var(--surface))`; `.medium` border → `color-mix(var(--sunset)…)`.
- `.insight-body h4` add `font-family: var(--font-heading)`; `p` color `rgba(0,0,0,.62)` → `var(--text-secondary)`.
- `.insight-dismiss` colors → `--text-light` / `--text`.
- Guardrail: no `rgba(255, 255, 255` and no `rgba(0, 0, 0` in InsightStrip.

### U4 — Switcher drawer → dark
`apps/platform/src/lib/container/AppSwitcherGesture.svelte`
- `.drawer` block: remove the cream token overrides (`--text/--surface-alt/--border/--border-light` reassignments + `background:var(--cream-bg)`/`color:var(--cream-text)`). Set `background: var(--bg)`, `color: var(--text)`, `border` via `--border-light`. Children (ToolRow/ToolSwitcherSheet) then inherit dark.
`apps/platform/src/routes/dock/+page.svelte`
- `.focused-drawer-head` `var(--cream-bg,#faf7ef)` → `var(--surface)` (+ border `--border-light`).
- `.focused-insight` `var(--cream-bg,…)` → `var(--surface)`.
- `.focused-share-card`/`.focused-share-card-qr` `var(--paper-warm,…)` + `--cream-secondary` → `var(--surface)` / `--text-secondary`.
- `.focused-shell` `var(--bg-pure,#fff)` → `var(--bg-pure)` (drop the white fallback; use `#0F0D0A`).
- Guardrail (in +page or a new test): focused-drawer-head/share-card no longer reference `cream`/`paper-warm`.

### U5 — category-color → brand palette only
`apps/platform/src/lib/container/category-color.ts`
- Remove `--accent-violet` / `--info` mappings. Map every category to `--sunset` / `--sage-moss` / `--marigold` (warm trio). Anything previously violet/steel-blue → nearest brand hue. (Tile fallback already slug-hashes a warm hue via `accentColor`, so off-category tools stay on-palette.)
- Update `category-color.test.ts` to assert only brand tokens are returned.

### U6 — +page.svelte remaining hardcoded colors → tokens
`apps/platform/src/routes/dock/+page.svelte`
- `.private-join-toast` / `.transfer-pending-chip` `rgba(255,253,247,.94)` → `var(--surface)`; borders/shadows via tokens; state borders (`ready`/`error`) via `color-mix(--sage-moss / --sunset)`.
- `.mesh-badge.active` `rgba(94,167,119,…)` → `color-mix(in srgb, var(--sage-moss) …, transparent)`.
- `.focused-dock-nub` warm-white/dark rgba → tokens (`--surface`, `--text`, `color-mix`).
- Inline `.app-icon` hexes `#74A57F`/`#4E7C9A`/`#B6472D` (line ~3769) → brand tokens (sage/…/sunset). Better: drop the inline style and let the icon use ToolGlyph/category-color.
- `shippie-mark-pulse` keyframe sunset rgba → `color-mix(var(--sunset)…)` (cosmetic; optional).

### U7 — Token hygiene + typography
`apps/platform/src/lib/styles/tokens.css` (+ packages/design-tokens parity if shared)
- Resolve duplicate/divergent fallbacks: ensure `--paper-warm` etc. have ONE canonical value (used only by the formal `[data-theme="light"]` path now, not dark surfaces).
`apps/platform/src/lib/container/DashboardHome.svelte`
- `.section-head h1` add `font-family: var(--font-heading)` (currently inherits Inter).
- Decide section-label font: keep mono eyebrows consistent (`--font-mono`) OR Fraunces — pick one for `.update-group-head h3` vs `.dock-section-head h3` (currently mono vs serif). Recommend: section group heads = Fraunces (`--font-heading`) to match; reserve mono for true eyebrows/labels.

### U8 — Verify
- `bun run health` green.
- Screenshots: `/dock` empty-state (dark hero), the switcher drawer (dark), a running app fallback (dark), InsightStrip (dark). Confirm one consistent dark feel.

## Notes
- Third-party showcase apps render their OWN internal backgrounds inside the iframe — we control the fallback srcdoc, loader, and recovery, not an app's own palette. The "orange/brown running app" the user saw is the fallback srcdoc (`#fffaf2`) + category accent; U2 fixes our surfaces.
