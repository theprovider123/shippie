# Showcase design pattern — what makes a Shippie showcase standout

> Derived from the 2026-05-19 design pass on Match Room, World Cup Fantasy,
> Chiwit, and Recipe. Reference standouts: Crewtrip (sun-baked summer),
> Mevrouw (warm-cosy LDR), Lift (Iron strength), Steep (forest-amber tea).
>
> **The principle**: showcases get visual leeway over the brand-shell
> tokens. The brand-shell is the marketing surface; each showcase is a
> product that earns its atmosphere. The platform stays unmistakably
> Shippie via shared typographic moves, not enforced palette tokens.

---

## What every Shippie showcase does (the shared moves)

These four moves carry the "unmistakably Shippie" signature without
forcing a palette:

### 1. Fraunces display serif for headlines

Load via the four-weight Google Fonts subset (Italic 500, Regular 500,
Bold 600, Bold 700). `font-display: swap` so first paint never blocks.

```css
@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('https://fonts.gstatic.com/s/fraunces/v38/...') format('truetype');
}

:root {
  --font-display: 'Fraunces', 'Iowan Old Style', Georgia, serif;
}

.recipe-title, .page-hero h1, .dish-name {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.018em;
  line-height: 1.08;
}
```

Use the italic accent (`em` inside the heading) to highlight a word in
the heading. The word usually carries the warm accent colour for that
showcase. *"Two taps to log strength."*

### 2. Mono eyebrow

The small-cap section label, mono, with 0.16em letter-spacing. This is
the one element that should look identical across every showcase — it's
the platform's quiet handshake.

```css
:root {
  --font-mono: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
}

.eyebrow {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
}
```

### 3. Big numeric primitive

Every showcase has a moment where numbers matter: budget, score,
distance, weight, sets, calories, dose. Treat those moments with mono
tabular numerals at a heroic size, never with the body font.

```css
.big-numeric, .pulse-numeric, .lift-stat-value {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  letter-spacing: -0.018em;
  line-height: 0.95;
}
.big-numeric.size-hero  { font-size: clamp(2.8rem, 9vw, 5.6rem); }
.big-numeric.size-card  { font-size: clamp(1.6rem, 4vw, 2.4rem); }
.big-numeric .unit, .big-numeric .currency {
  font-size: 0.45em;
  font-weight: 600;
  color: var(--muted);
  vertical-align: 0.35em;
  margin-left: 0.2em;
}
```

### 4. Italic mono "code" affordance

The small italic mono mark that appears next to a fixture, recipe time,
session number, version. Always in the showcase's warm accent colour,
uppercase or title-cased. This is the matchday-program stamp.

```css
.match-code, .cook-code, .room-code {
  font-family: var(--font-mono);
  font-style: italic;
  font-weight: 500;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  color: var(--accent-deep);
  text-transform: uppercase;
}
```

---

## What each showcase gets to invent

The shared moves above are the platform handshake. Everything below is
the showcase's own atmosphere.

### Palette

Each showcase picks **one warm accent + one structural accent +
ink/paper/muted**. Don't try to use four equally-weighted colours; the
visual identity collapses.

Reference picks:

| Showcase | Warm | Structural | Atmosphere |
|---|---|---|---|
| Crewtrip | Sunset coral | Olive | Sun-baked summer |
| Mevrouw | Rose | Sage | Warm cosy LDR |
| Lift | Rust orange | Charcoal | Iron / barbell |
| Steep | Amber | Forest | Loose-leaf herbalist |
| Match Room | Gold leaf | Pitch green | Vintage match programme |
| WC Fantasy | Gold leaf | Pitch green | Squad sheet × programme |
| Chiwit | Coral | Sage | Field-notes botanical journal |
| Recipe | Cooking orange | Sage tile | Kitchen-tile cookbook |

### Texture / background

The "paper" of the app — what's BEHIND content. Three working patterns:

1. **Sand paper** (Crewtrip / Steep): warm-cream gradient bottom-darker,
   subtle grain or 1px-tile gridline at low opacity.
2. **Pitch grid** (Match Room / WC Fantasy): 38px-spaced vertical pitch
   lines at ~5% opacity layered over a sand gradient.
3. **Journal rule** (Chiwit): horizontal 32px rule lines at 2.5%
   opacity, mimicking a field notebook.

### Corner radius

Sharp corners ARE the brand-shell hallmark, but showcases get leeway —
the only rule is **be consistent within the showcase**. Mevrouw + Lift
+ Steep round corners; Crewtrip + Match Room mostly sharp; Chiwit has
6px subtle corners (the journal feel).

Whatever you pick, stick with it. Mixed 14px-and-8px is the design
sin.

### Type pairing

Fraunces is universal. The body font is the showcase's choice:

- Inter — Crewtrip, Match Room, WC Fantasy, Chiwit, Recipe
- IBM Plex Sans — Lift (engineering / strength club)
- General Sans — platform default; works for any showcase

Mono is universal: JetBrains Mono.

### Hero moment

Every showcase has one. Make it large and confident:

```css
.page-hero h1 {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(2.4rem, 7vw, 4.7rem);
  line-height: 0.95;
  letter-spacing: -0.022em;
}
.page-hero h1 em {
  font-style: italic;
  color: var(--accent);
}
```

---

## The 10-point self-check

Before merging a showcase, run this:

1. ☐ Fraunces loaded via `@font-face`, used on at least one display heading
2. ☐ `.eyebrow` uses mono caps with 0.16em letter-spacing
3. ☐ One numeric primitive (`.big-numeric`, `.pulse-numeric`, etc.) exists for the showcase's key moments
4. ☐ One italic-mono "code" primitive for fixtures / recipes / sessions
5. ☐ Palette is **one warm + one structural + ink/paper/muted** — not four equal weights
6. ☐ Texture / background is intentional (sand paper / pitch grid / journal rule / etc.)
7. ☐ Corner radius is consistent across the app (sharp throughout OR rounded throughout)
8. ☐ Focus ring uses the showcase's structural accent, not browser default blue
9. ☐ Hero heading uses Fraunces + display weight, ≥2.4rem, with `letter-spacing: -0.022em`
10. ☐ Body builds cleanly at <12 KB gzipped CSS; no Google Fonts CSS imports (only direct `@font-face`)

A showcase that hits 9/10 is shippable. Below 7/10 looks like a generic
SaaS starter and undermines the platform's design story.

---

## Anti-patterns

What NOT to do:

- **Don't use `font-family: system-ui` for headlines.** Showcase headings should never look like a browser default. If you don't load Fraunces, you should be using *something* with character.
- **Don't use Tailwind sky-500 / emerald-500 / rose-500.** These are the colours every weekend hackathon ships. Pick your own warm + structural pair.
- **Don't put a 12px corner radius on buttons and a 4px corner on cards.** Pick a consistent scale.
- **Don't make every text element a different size.** Display / heading / body / small / mono is the entire scale you need.
- **Don't use box-shadow for depth on cards if the rest of the showcase uses 1px borders.** Pick a depth language and stick to it.
- **Don't lazy-load Fraunces from `fonts.googleapis.com/css2`.** That's a render-blocking stylesheet. Use the four direct `@font-face` declarations against `fonts.gstatic.com/s/fraunces/...` instead — same fonts, no extra round trip.
- **Don't import the platform's design-tokens.css and then override every variable.** Either fully inherit (most generic showcases) or fully invent (Crewtrip-style). Half-inheriting is the worst of both.

---

## Quickstart for the next showcase

1. Copy the `:root` + `@font-face` block from `showcase-chiwit/src/styles.css` (smallest reference).
2. Replace `--coral` / `--sage` / `--coral-soft` with your showcase's warm + structural pair.
3. Adjust the body background gradient to match the atmosphere.
4. Use the 4 shared moves (Fraunces / mono eyebrow / big numeric / italic code).
5. Run the 10-point check.

Reference files to crib from:

- **Pitch / matchday** → `apps/showcase-match-room/src/styles.css` lines 1–145
- **Squad / tournament** → `apps/showcase-world-cup-fantasy/src/styles.css` lines 1–230
- **Field journal / wellness** → `apps/showcase-chiwit/src/styles.css` lines 1–245
- **Cookbook / kitchen** → `apps/showcase-recipe/src/styles.css` lines 1–95 + the tail "cookbook typography" block
- **Sun-baked summer** (Crewtrip) — the gold standard for "showcase visual leeway"
