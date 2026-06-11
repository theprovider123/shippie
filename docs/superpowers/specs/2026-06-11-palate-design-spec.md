# palate. — Design Spec (extracted from ~/Documents/palate design/Palate Radical.dc.html)

> Authoritative visual source: `/Users/devante/Documents/palate design/Palate Radical.dc.html` — the RADICAL design wins all conflicts with `Palate.dc.html` / `Mise.dc.html` (those are earlier, tabbier iterations kept only for context).
> Logo: `/Users/devante/Documents/palate design/assets/palate-logo.png` (also `/Users/devante/Documents/Palate/palate logo.png`, app icon `/Users/devante/Documents/Palate/palate app icon.png`).
> Philosophy: "No tabs, no grids, no cards-of-cards. Each concept bets everything on a single mechanic. … These aren't six apps — they're one app with the chrome removed."

## 1. Design tokens

| Token | Value | Usage |
|---|---|---|
| paper | `#f7f3ec` | base background |
| ink | `#2a2118` | primary text |
| secondary | `#6b5d4f` | secondary text |
| tertiary | `#b5a898` | hints, status line |
| terracotta | `#b85c26` | brand/action; hero card; pull state |
| terracotta dark | `#94481c` | pressed |
| amber | `#c47c2b` | heat/time pressure; HEAT glance bg |
| amber text | `#9a5f1c` | heat ticket time |
| sage | `#4d6647` | live/in-range/calm |
| heat tint | `#faf0de` | heat ticket bg, NEARLY probe bg |
| calm tint | `#e9eee0` | REST glance bg, in-range badge |
| cream-on-dark | `#fdf3e9` / `rgba(253,243,233,.78)` / `.35` | text on terracotta |
| hairline | `rgba(42,33,24,0.10)` (also .12/.14/.16/.18 dashed/.28 dashed) | all borders — **no shadows, no gradients** |

Fonts (self-hosted woff2):
- **Playfair Display** — numerals + wordmark "palate." only. Sizes: 116px probe temp (148 desktop), 92px scale total, 88px hero time (56 desktop), 76px glance word, 58px dial (40 desktop), 36px ticket time (28 desktop), 34px glance time, 27px formula grams. Always `font-variant-numeric: tabular-nums` for numbers.
- **Source Serif 4 italic** — human voice: ticket/recipe/cut names (15–20px), glance line 18px, probe line 16.5px, note textarea 15px, preset names 13px.
- **DM Sans** — all working text: labels 10–12px, uppercase tags ls 0.1–0.22em bold, status "offline · all local" 11px ls0.04em `#b5a898`.

Radii: 10px buttons, 12–13px tickets, 14–16px large cards. Background state transitions 600ms ease.

## 2. The five mechanics + desktop

### A · Wind it (the dial — every timer)
330px SVG dial: outer faded ticks (`rgba(42,33,24,.16)` dashed), middle ring, active arc (7px round cap, dynamic colour), 3px needle rotating from center, 196px centre face (white circle, hairline border) with Playfair 58px time + caption ("tap to start" / "running" / "done — tap to reset"). **Drag the bezel to wind** (pointer events on outer 30% radius; 0–60min); tap face to start/stop. Colour: grey idle → sage running → amber <2min → terracotta done (face fills terracotta, cream text). Egg presets beneath: soft 6:00 · jammy 7:30 · medium 9:00 · hard 11:00 (white pills, Source Serif italic + Playfair, hover border `rgba(184,92,38,.55)`). Adjustments (from prompt): size Large +0:30 / starting temp from-fridge +0:30. Footer: "drag the bezel to wind · tap the face to start".

### B · The rail (home — the multi-timer/queue)
Header: "palate." Playfair italic 17px left; "{n} on the rail" right. **Hero card** = most urgent: terracotta bg, 16px radius, two 9px paper circles notched on left/right edges at 50% height, title Source Serif italic 20px cream + uppercase tag ("NOW"/"NEXT UP"), subtitle 12.5px cream/75%, dashed cream divider, Playfair 88px time, caption "tap to clear when handled" — tap clears. **Tickets** below sorted by time-remaining: white cards (heat-context = `#faf0de` bg + amber border), title Source Serif italic 16.5px / time Playfair 36px (heat=`#9a5f1c`, long-ferment=muted `#b5a898`), subtitle 11.5px. Tap expands → "+1:00" (white hairline) + "done" (terracotta) buttons above a dashed divider. Long ferments sink to bottom ("Kimchi №3 · day 4 of 14 · burp the jar"). Footer: "tickets fall away as you clear them · long ferments sink to the bottom".

### C · Glance (cook mode — colour is the interface)
Full screen IS the status: REST = `#e9eee0` sage palette (ink `#2f4029`, sub `#5d7152`), HANDS ON = paper palette, HEAT = `#c47c2b` amber with cream text. 600ms bg transitions. Content vertically centred: mode tag (12px ls0.22em uppercase bold accent) → step word Playfair 76px → line Source Serif italic 18px → time Playfair 34px. Progress dots bottom (7px; past=accent fill, current=ink, future=outline). Tap anywhere advances. Counter "{i} / {n}" top right. Wake lock held while active; haptic on advance. Default workflow = 9-step country loaf: Autolyse ("Flour and water, covered. Walk away." 40 min, rest) → Mix → Bulk → Fold → Shape → Proof → Score ("One confident cut, base to tip." 30 s) → Bake ("Lid on at 250°, twenty minutes. Lid off at 230°, twenty-two." 42 min, heat) → Cool. Footer: "tap anywhere to advance · rest is green, hands-on is cream, heat is amber".

### D · The probe (temperature is the screen)
Tag ("TRACKING" / "ALMOST — STAY CLOSE" / "PULL NOW") → temp Playfair 116px (tap to reset) → line Source Serif italic ("beef, med-rare · pull at 52° · ~7 min"; at pull: "off the heat — carryover takes it to 54°"). Progress track 4px with accent fill + 1.5px pull marker. Cuts list (hairline dividers): dot + Source Serif italic name + Playfair temps "52° → 54°"; tap to retarget. States: tracking = paper/sage accent; nearly (≤3° away) = `#faf0de`/amber; pull = full terracotta screen, cream text. Cuts: Beef med-rare 52/54 · Beef medium 60/63 · Chicken breast 71/74 · Pork loin 60/63 · Lamb med-rare 55/57 · Salmon just-set 48/50. °C/°F toggle persists. Footer: "carryover adds 2–3° while resting". (No hardware: current temp is set by the cook — vertical drag / stepper — and the screen reacts; the design's auto-warming is demo behaviour.)

### E · The scale (the whole screen is the slider)
Header right: "formula · country loaf". Tag → total Playfair 92px "1800 g" → hint "900 g · drag anywhere ← → to scale". Formula rows bottom-anchored (hairline dividers): Source Serif italic name + 11.5px % + Playfair 27px grams. Default: Bread flour 90% · Wholemeal 10% · Water 71% · Levain 20% (100% hydration preferment) · Salt 2.1%. Footer stats: "hydration 75.5% · prefermented 9.1%" + sage badge "salt in range" (warn >2.5%). **Full-screen ew-resize drag**, 3× multiplier, 10g quantize, 600–3200g. Flour percentages always sum to 100. True hydration accounts for levain water.

### Desktop · The Counter (≥ ~1100px)
Sticky header: logo 26px + "palate." Playfair 22px; right "offline · all local · 2 devices on kitchen LAN". Grid `0.95fr 1.35fr 0.95fr`, 28px gaps, uppercase 11px ls0.14em section labels: **THE RAIL** (hero 56px + tickets 28px) | **LIVE PROBE** (full-height card, Playfair 148px) | **THE DIAL** (240px dial, hint "mirrors the phone dial — wind either one") + **TONIGHT'S NOTE** (1.5px dashed border card, Source Serif italic textarea, placeholder "Salt the duck legs tonight for tomorrow. Wind the dial when the milk goes on."). Same state, same mechanics, one codebase — desktop is a wider viewport of the same app, not a second app.

## 3. Remaining product surface (from the build prompt, folded into the radical language)
- **Ferments**: live as long tickets on the rail; tap → detail: bulk ferment (dough temp input → Q10-adjusted remaining time: `remaining = target × Q10^((Tref − T)/10)`, Q10≈2, ref 24°C; fold schedule), levain (fed-at, flat/building/peaked/falling, next feed), long ferment (day x of y timeline, burp prompt).
- **More instruments** (quiet word-list, not a grid): DDT calculator (water temp = DDT×3 − room − flour − friction; friction default 25 spiral / 28 hand; big Playfair result), convert & substitute (volume→grams per ingredient; oven conventional→fan/gas/°F; emergency substitutions searchable), bake log (Crumb Score: rise/crumb/crust/flavour/ease each 1–5 → avg ×2 = 0–10; photo attach local; "what changed" note), kitchen note (single dashed-border card, Source Serif italic, autosave on blur).
- Header status "offline · all local" with crossed-wifi icon is always visible — a statement of fact, not a feature.
- The word "smart" must not appear anywhere. No onboarding, no empty-state illustrations, no tooltips.

## 4. Navigation decision (locked)
Mobile: **the rail is home.** A single quiet switcher row (DM Sans 10.5px lowercase, hairline top, no icons): `rail · dial · glance · probe · scale · more`. Desktop ≥1100px: the Counter layout with glance/scale one tap away. This preserves "chrome removed" while making every instrument reachable.
