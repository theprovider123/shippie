# Shippie-Native Checklist

Apply this rubric to any new or existing showcase to measure brand alignment. Each item is a yes/no question. Aim for 9/10. The only acceptable miss is dark-mode default if the app's purpose genuinely calls for cream (rare).

1. **Display headlines use Fraunces** (`var(--font-heading)`) with weight 600, tight tracking (-0.025em to -0.035em), and italic accents in `var(--sunset)` on key words.
2. **Sharp corners everywhere** — `border-radius: 0` on buttons, cards, inputs, icons. No 12px / 999px / 14px. The only exception is circular avatars (`border-radius: var(--radius-full)`).
3. **Eyebrow pattern present** on section headers: mono uppercase, 0.75rem, 0.12em letter-spacing, in `var(--text-light)` or `var(--marigold)`. Use the `.eyebrow` class shipped in tokens.css.
4. **Primary action button** uses `var(--sunset)` background with `var(--bg-pure)` text. No stock blue / green / Tailwind defaults.
5. **All accent colours map to canonical palette** — sunset / sage variants / marigold / cream variants. No ad-hoc blues, purples, sky-500, emerald-500, slate-100, etc.
6. **Font stack** is Fraunces (display) + General Sans / Inter (body) + JetBrains Mono (labels). Not `-apple-system` / `system-ui` as primary.
7. **Dark default** (`var(--bg)`); cream inversion (`[data-theme="light"]`) opt-in only.
8. **Cards / surfaces** use `border: 1px solid var(--border)` (not shadow-based depth) with optional `border-top: 3px solid var(--accent)` for semantic sections.
9. **Ghost button variant** exists: transparent background, currentColor outline, muted hover state.
10. **Motion** uses `var(--spring)` (`cubic-bezier(0.22, 1, 0.36, 1)`) and `var(--duration)` (~0.6s) on state transitions. Respects `prefers-reduced-motion`.

## How to apply

1. `bun add @shippie/design-tokens` (workspace dep, already present in the monorepo).
2. In the app's entry CSS, replace any local `--accent` / `--bg` / etc with:
   ```css
   @import "@shippie/design-tokens/tokens.css";
   ```
   For Tailwind v4 apps, also add:
   ```css
   @import "@shippie/design-tokens/tailwind-theme.css";
   ```
3. Sweep the existing CSS — `border-radius: 12px / 14px / 999px → 0`, `font-family: -apple-system, ... → var(--font-body)`.
4. Replace local `--accent: #4E7C9A` (or whatever ad-hoc colour) with `var(--sunset)` or `var(--sage-leaf)` etc.
5. Run on a real iPhone Safari + Android Chrome. The page should read as *unmistakably Shippie* within 1.5 seconds. If not, iterate.
