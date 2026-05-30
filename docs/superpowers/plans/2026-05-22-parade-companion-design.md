# Parade Companion — Design System (look & feel for codex)

> Companion to `2026-05-22-parade-companion.md`. This is the **visual layer** codex applies to that plan's screens.
> Source design bundle (the user's Claude Design work): `docs/superpowers/plans/parade-design-source/` — read `index.html`, `screens/*.jsx`, and `design-chat.md`. Those JSX files are HTML/CSS prototypes; **recreate the visual output**, don't copy their inline-style structure. This document distils them into a reusable system.

---

## 1. The look in one line

A **printed match-day programme**: warm cream paper, deep warm-black ink, Arsenal red as the working accent, gold reserved for trophy moments. Sharp corners everywhere. Three typefaces in strict roles. It should feel like a calm, premium utility — "luxury watch meets offline survival tool" — not a sports app. No gradients (except the gold trophy button), no glossy effects, no stock imagery.

The user iterated through three rounds (dark mode → red/white → full paper mode) and **landed on paper mode**. Paper mode is final. Don't reintroduce the dark theme.

---

## 2. Two things to fix from the mockup (important)

1. **Fonts must be self-hosted — the mockup CDN-links them, which breaks offline.** The app's #1 rule is offline-first; a remote font CDN fails on first offline load. Bundle the `woff2` files into `public/fonts/`, `@font-face` them locally (§6 CSS), and add them to `shippie.json#runtime_assets` alongside the basemap. All three families are free to self-host (Fraunces & JetBrains Mono are OFL; General Sans is free from Fontshare).
2. **The mockup's dates are placeholders.** It shows "24/25", "2024/25", "25·05·2025". The real event is **Sunday 31 May 2026**, season **2025/26**. The design must hardcode **no** dates — every date/time renders from the route pack at runtime (plan Part 7). The "Champions" wording and the "ARSENAL" wordmark are also trademark-exposed: the artwork is original (abstract trophy, no cannon, no crest — keep it that way), but the literal club name carries risk. Keep the app unmistakably **unofficial / fan-made** (persistent disclaimer, per the main plan). This is the user's call — flag it, don't block.

---

## 3. Design tokens

Verbatim from the mockup's `:root` — the source of truth. Goes at the top of `styles.css` (§6).

```
--ink: #14120F          deep warm black — all text/ink
--paper: #F5EFE4        warm paper — the background of every screen
--paper-2: #EDE6D5      slightly deeper — card surfaces, info bar, inset frames
--paper-3: #E2D7BF      deepest tint — used sparingly
--ink-dim: rgba(20,18,15,.75)    secondary text
--ink-mute: rgba(20,18,15,.5)    tertiary / meta text
--ink-faint: rgba(20,18,15,.32)  hints, disabled
--ink-bare: rgba(20,18,15,.14)
--line: rgba(20,18,15,.14)         hairlines
--line-strong: rgba(20,18,15,.25)
--red: #EF0107          Arsenal red — the working accent (route, live, CTAs, section rules)
--red-deep: #C40006
--gold: #EDBB4A         TROPHY ONLY — celebrate button, trophy marks, GPS halo
--gold-deep: #A37918
--sage: #5E7B5C         quiet "good/connected/open" status
--sunset: #E8603C       rare energy accent
```

**The accent discipline is the whole system — hold it:**
- **Red** does all the work: the map route, live pips, section rules, the primary CTA, "you are here", warnings, the wordmark band.
- **Gold** is *only* a trophy moment: the Celebrate button, small trophy glyphs, the GPS dot's warm halo. Never use gold for body UI (gold on cream has poor contrast — the user explicitly rejected it).
- **Sage** = calm positive status (station open, peer connected). **Sunset** = almost unused; keep in reserve.

---

## 4. Typography — three families, strict roles

| Family | Role | Notes |
|---|---|---|
| **Fraunces** | Display headlines | Almost always **italic**, weight 500–600. Set `font-variation-settings:"opsz" 144` at large sizes. Warm, celebratory. |
| **General Sans** | Body & UI text | Weight 400–600. 13–14px body. |
| **JetBrains Mono** | Data, labels, stats — **used aggressively** | Every coordinate, time, distance, count, status, eyebrow label. This is what gives the "local-first utility" feel. |

**The `.pc-label` eyebrow** is the system's signature: JetBrains Mono, 10px, `letter-spacing:.18em`, uppercase, weight 600, in **red**. It sits above headlines and section content everywhere. A muted variant (`--ink-mute`) is used where red would be too loud.

Headline sizes seen in the mockup (scale to context): Map header "Champions" 24px; screen titles ("The Invincibles", "The full plan") 30–32px; Celebrate "Champions" 40px; share-card hero 220px. All italic Fraunces.

---

## 5. Signature treatments & component recipes

Build these as the reusable kit. Exact values are in the CSS (§6); recipes here explain intent.

- **Sharp corners — no `border-radius`** on any card, button, input, frame. The *only* round things are true circles: the GPS dot and the Celebrate button. This is non-negotiable brand DNA.
- **Screen shell** (`ShippieShell` in `screens/Shell.jsx`): every phone screen is `status bar → ARSENAL wordmark band → content → home indicator`, all on `--paper`. The status bar shows a **slashed-signal "offline" mark** (offline is a feature, shown with pride), and a battery glyph — all hand-drawn as tiny SVGs in ink, no iOS chrome.
- **Wordmark band**: `A · R · S · E · N · A · L` in spaced mono caps (red, 700, `.28em`), a thin red rule filling the row, a tiny meta string on the right, and a `1.5px` red bottom border. It reads like a ticket-stub stamp and unifies every screen.
- **Hairline rhythm**: structure is drawn with 1px ink hairlines (`--line`) and red rules. Section headers get a `1px rgba(239,1,7,.25)` red top-rule; major footers get a `2–3px` solid red rule. No shadows for separation (the gold button is the one exception).
- **Paper grain** (`.stipple`): two faint radial-dot gradients over map and large surfaces — subtle aged-paper texture. A `~10%` vignette darkens corners.
- **Cards** (`.pc-card`): `--paper-2` surface, 1px `--line` border, 14–16px padding, optional 2px left accent strip coloured by status. A **live** variant (`.pc-card--live`) tints the surface red (`rgba(239,1,7,.05)`) and borders it red.
- **Info rows** (`.pc-row`): key/value baseline-aligned, 1px bottom hairline, value in mono and colour-coded (sage = ok, red = warn/accent). Grouped under `.pc-section` blocks with a red eyebrow + red top-rule.
- **GPS "you are here" dot**: a 14px solid red core with a layered halo (`box-shadow` rings in paper + red glow + ink outline) and two staggered expanding red pulse rings. This is the hero element of the Map screen — calm, alive, unmistakable.
- **Celebrate button**: a large (~232px) gold radial-gradient medallion with a layered "polished medallion" shadow, a soft gold halo (`goldHalo` 2.4s), a dashed gold ring, and on tap a `goldRipple` + 3px compress. Resting and pressed states both specified in the CSS.
- **Primary CTA** (`.pc-cta`): full-width **solid red** block, paper-coloured text, uppercase label + a mono sub-label. Sharp. One per screen, max.
- **Avatar chips** (`.pc-avatar`): 22px mono-initial squares — filled for connected peers, red-filled for the host, dashed-outline for lost/unreachable peers.
- **Map treatment**: the *real* corridor basemap (plan Task 3) is styled to match this — route as a `2.4px` red line over an `8px` `rgba(239,1,7,.22)` red underglow, faint ink grid, stipple, vignette, mono coordinate readout in the corner, a small ruled scale bar and N indicator. Landmarks are tiny ink squares with mono uppercase labels; open stations get a sage `✓`, closed a red `✗`, meeting points a gold `★`.
- **Share card**: 1080×1920, cream paper, the same grammar at poster scale — giant italic Fraunces, red wordmark band, gold trophy hero, mono stat strips. Rendered in-app, then captured to an image for sharing (no data leaves the device until the user shares).

---

## 6. `styles.css` — drop into `apps/showcase-parade-companion/src/styles.css`

Production port of the mockup. Replaces the template's `styles.css`. Inline styles in the prototype JSX become these classes; per-instance one-offs (exact x/y, SVG paths) stay inline in the components.

```css
/* ───────── Fonts — self-hosted for offline (add woff2 to public/fonts/) ───────── */
@font-face {
  font-family: 'Fraunces'; font-style: normal; font-weight: 400 800;
  font-display: swap; src: url('/fonts/fraunces-roman.woff2') format('woff2-variations');
}
@font-face {
  font-family: 'Fraunces'; font-style: italic; font-weight: 400 800;
  font-display: swap; src: url('/fonts/fraunces-italic.woff2') format('woff2-variations');
}
@font-face {
  font-family: 'General Sans'; font-style: normal; font-weight: 400 700;
  font-display: swap; src: url('/fonts/general-sans.woff2') format('woff2-variations');
}
@font-face {
  font-family: 'JetBrains Mono'; font-style: normal; font-weight: 400 700;
  font-display: swap; src: url('/fonts/jetbrains-mono.woff2') format('woff2-variations');
}

/* ───────── Tokens ───────── */
:root {
  --ink:#14120F; --paper:#F5EFE4; --paper-2:#EDE6D5; --paper-3:#E2D7BF;
  --ink-dim:rgba(20,18,15,.75); --ink-mute:rgba(20,18,15,.5);
  --ink-faint:rgba(20,18,15,.32); --ink-bare:rgba(20,18,15,.14);
  --line:rgba(20,18,15,.14); --line-strong:rgba(20,18,15,.25);
  --red:#EF0107; --red-deep:#C40006; --red-soft:rgba(239,1,7,.08);
  --gold:#EDBB4A; --gold-deep:#A37918; --gold-soft:rgba(237,187,74,.18);
  --sage:#5E7B5C; --sunset:#E8603C;
  --serif:'Fraunces','Cormorant Garamond',Georgia,serif;
  --sans:'General Sans',-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif;
  --mono:'JetBrains Mono','SF Mono',ui-monospace,monospace;
}

/* ───────── Base ───────── */
*{box-sizing:border-box;}
html,body{margin:0;background:var(--paper);font-family:var(--sans);color:var(--ink);}
button{font-family:inherit;}
.mono{font-family:var(--mono);font-feature-settings:'ss01';letter-spacing:0;}
.serif{font-family:var(--serif);}

/* eyebrow label — the signature mono caps */
.pc-label{font-family:var(--mono);font-size:10px;letter-spacing:.18em;
  text-transform:uppercase;font-weight:600;color:var(--red);}
.pc-label--mute{color:var(--ink-mute);font-weight:500;}
.pc-hairline{height:1px;background:var(--line);}

/* ───────── Screen shell ───────── */
.pc-screen{width:100%;height:100%;display:flex;flex-direction:column;
  position:relative;overflow:hidden;background:var(--paper);color:var(--ink);
  -webkit-font-smoothing:antialiased;}
.pc-statusbar{height:44px;padding:14px 20px 0;display:flex;align-items:center;
  justify-content:space-between;font-family:var(--mono);font-size:12px;flex-shrink:0;}
.pc-wordmark{display:flex;align-items:center;gap:8px;padding:8px 20px 10px;
  flex-shrink:0;white-space:nowrap;border-bottom:1.5px solid var(--red);}
.pc-wordmark .mark{font-family:var(--mono);font-size:11px;letter-spacing:.28em;
  font-weight:700;color:var(--red);line-height:1;flex-shrink:0;}
.pc-wordmark .rule{flex:1 1 auto;min-width:12px;height:1px;background:var(--red);}
.pc-wordmark .meta{font-family:var(--mono);font-size:9px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--ink-mute);line-height:1;flex-shrink:0;}
.pc-home-indicator{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);
  width:100px;height:3px;background:var(--ink);}

/* ───────── Cards & sections ───────── */
.pc-card{position:relative;background:var(--paper-2);border:1px solid var(--line);
  padding:14px 16px;}
.pc-card--live{background:rgba(239,1,7,.05);border-color:rgba(239,1,7,.4);}
.pc-card__accent{position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--red);}
.pc-section{margin-bottom:28px;}
.pc-section__body{border-top:1px solid rgba(239,1,7,.25);padding-top:12px;}
.pc-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;
  padding:7px 0;border-bottom:1px solid rgba(20,18,15,.08);}
.pc-row__k{font-size:13px;color:var(--ink-dim);white-space:nowrap;}
.pc-row__v{font-family:var(--mono);font-size:12px;letter-spacing:-.01em;white-space:nowrap;}
.pc-row__v--ok{color:var(--sage);} .pc-row__v--warn{color:var(--red);}

/* ───────── Controls ───────── */
.pc-icon-btn{width:32px;height:32px;padding:0;background:transparent;
  border:1px solid rgba(20,18,15,.18);color:var(--ink-dim);cursor:pointer;
  display:flex;align-items:center;justify-content:center;}
.pc-cta{width:100%;background:var(--red);border:1px solid var(--red);color:var(--paper);
  padding:16px;display:flex;align-items:center;justify-content:space-between;
  cursor:pointer;font-size:14px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;}
.pc-avatar{width:22px;height:22px;display:flex;align-items:center;justify-content:center;
  font-family:var(--mono);font-size:11px;font-weight:600;flex-shrink:0;}
.pc-avatar--connected{border:1px solid currentColor;color:var(--ink);}
.pc-avatar--host{background:var(--red);border:1px solid var(--red);color:var(--paper);}
.pc-avatar--lost{background:transparent;border:1px dashed rgba(20,18,15,.3);color:var(--ink-faint);}

/* ───────── Map texture ───────── */
.stipple{background-image:
  radial-gradient(rgba(20,18,15,.05) 1px,transparent 1px),
  radial-gradient(rgba(20,18,15,.035) 1px,transparent 1px);
  background-size:14px 14px,23px 23px;background-position:0 0,7px 11px;}

/* ───────── GPS "you are here" ───────── */
@keyframes gpsPulse{0%{transform:scale(1);opacity:.6;}
  80%,100%{transform:scale(2.6);opacity:0;}}
.gps-core{width:14px;height:14px;border-radius:50%;background:var(--red);
  box-shadow:0 0 0 3px var(--paper),0 0 24px rgba(239,1,7,.45),0 0 0 1px var(--ink);}
.gps-ring{position:absolute;inset:0;border:1.5px solid var(--red);border-radius:50%;
  animation:gpsPulse 2.2s cubic-bezier(.2,.8,.2,1) infinite;}
.gps-ring.delay{animation-delay:1.1s;}

/* ───────── Live pip ───────── */
@keyframes livePip{0%,100%{opacity:1;}50%{opacity:.25;}}
.live-pip{display:inline-block;width:6px;height:6px;background:var(--red);
  animation:livePip 1.6s ease-in-out infinite;}

/* ───────── Celebrate button ───────── */
@keyframes goldHalo{0%,100%{transform:scale(1);opacity:.45;}
  50%{transform:scale(1.06);opacity:.7;}}
@keyframes goldRipple{0%{transform:scale(.6);opacity:.8;}
  100%{transform:scale(2);opacity:0;}}
.pc-celebrate-btn{width:232px;height:232px;border-radius:50%;border:none;cursor:pointer;
  background:radial-gradient(circle at 50% 40%,#F0C460 0%,#C99A2C 70%,#A37918 100%);
  box-shadow:0 4px 0 #8C6912,0 14px 36px rgba(140,105,18,.28),
    inset 0 -6px 0 rgba(0,0,0,.16),inset 0 2px 1px rgba(255,250,235,.38);
  transition:transform 80ms ease-out,width 80ms,height 80ms,box-shadow 80ms,background 80ms;}
.pc-celebrate-btn.is-pressed{width:222px;height:222px;transform:translateY(3px);
  background:radial-gradient(circle at 50% 60%,#C99A2C 0%,#A37918 100%);
  box-shadow:inset 0 6px 18px rgba(0,0,0,.35),0 0 32px rgba(237,187,74,.25);}

/* ───────── Kit skin — required by @shippie/showcase-kit-v2 (QrShareSheet) ─────────
   The kit ships zero CSS; this paints .shippie-qr-sheet in the paper palette.
   Cross-check selectors against apps/showcase-chiwit/src/styles.css + the kit markup. */
.shippie-qr-sheet{background:var(--paper);color:var(--ink);border:1px solid var(--line);}
.shippie-qr-sheet h2,.shippie-qr-sheet h3{font-family:var(--serif);font-style:italic;font-weight:500;}
.shippie-qr-sheet .shippie-qr-sheet__code{background:var(--paper-2);border:1px solid var(--line);padding:16px;}
.shippie-qr-sheet button{background:var(--red);color:var(--paper);border:1px solid var(--red);
  font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:14px 16px;cursor:pointer;}
```

---

## 7. Screen mapping — design (5) → plan (6)

The design's IA is *tighter* than the plan's and the user iterated on it. **Adopt the design's screens**; map plan features onto them:

| Design screen | Plan screen(s) | Notes |
|---|---|---|
| 01 Map (hero) | Map | Apply the §5 map treatment over the real corridor basemap. The bottom info bar carries bus ETA + group mesh dots. |
| 02 Group | Plan + Meet + Group | The design already merges meeting-point cards, the hotspot/mesh peer list, and the "Find my group" CTA into one screen. Collapse the plan's Plan/Meet/Group into this. The relay layer (plan Rung 1) populates the peer list. |
| 03 Celebrate | *(was cut)* | The user designed it in detail and chose "build everything" — it's in. Local tap counter; pure offline. |
| 04 Info | Safety & Transport | Direct match — route, timing, transport, closures, safety, "your phone". Pure typographic, no cards. |
| 05 Share card | *(post-parade)* | 1080×1920, rendered in-app then captured to image. In scope per "build everything". |
| *(none)* | Ready | The design is deliberately anti-onboarding ("the user opens it and the map is there"). Make "Ready" a **lightweight first-run state/banner**, not a full screen — a slim offline-readiness strip on the Map screen in this same language, not a wizard. |

---

## 8. Hand-off

- **Source of truth:** `docs/superpowers/plans/parade-design-source/` — `index.html`, `screens/*.jsx`, `design-chat.md`. Recreate the visual output; the JSX inline styles are a prototype, not the target structure.
- **System:** §3 tokens + §4 type + §6 `styles.css` are the portable look-and-feel — apply across every screen, including ones the design didn't draw (Ready).
- **Before coding:** self-host the fonts (§2.1); strip all hardcoded dates (§2.2); set `shippie.json` `theme_color:"#EF0107"`, `background_color:"#F5EFE4"`.
- **Hold the line on:** sharp corners, the red/gold accent discipline, mono-for-all-data, paper mode. These are the brand; the user iterated three times to get here.
