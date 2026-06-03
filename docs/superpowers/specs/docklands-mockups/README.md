# Docklands mockups

Static first-pass mockups for `docs/superpowers/specs/2026-06-02-shippie-docklands-game-design.md`.

Serve or open `index.html` in a browser. If the in-app browser blocks `file://`, run:

```sh
bunx vite docs/superpowers/specs/docklands-mockups --host 127.0.0.1 --port 4188
```

The sections cover:

- refined premise and day/Tide loop
- embedded browser-native canvas prototype
- character creator
- owner room as the first playable screen
- mobile build mode
- live co-op tide wave
- share, guestbook, and trust surfaces

The owner room bottom rail, character creator controls, and canvas prototype are interactive. These are still product mockups; they are not wired to the Shippie runtime.

## Standalone canvas prototypes

Two self-contained isometric canvas prototypes (open directly in a browser, no build step) demonstrate the **10-year-old test** from spec §6.0.1 — a persistent "Protect the Beacon ♥♥♥" goal, the Beacon as the obvious glowing protected object, a two-tap pointing-finger tutorial (build one zapper → press ▶ Start), a 3·2·1 countdown, and unmistakable win/lose cards:

```text
docklands-td.html             — ★ CANONICAL: maze-defence × survival-action ("Tide Siege" v2)
docklands-survival.html       — earlier round-based survival pass (v1, no dig/stamina/breach)
docklands-canvas-center.html  — Beacon dead-center defence model (pre-survival)
docklands-canvas.html         — single-lane base-at-path-end (earliest contrast)
```

**`docklands-td.html` is the current canonical mockup** — it implements the v2 revision (`../2026-06-02-docklands-survival-revision.md`): **ROUND** counter + **PREP / DEFEND** phases, **dig-to-extend the path**, enemies with **HP *and* stamina** that **tire → rest → collapse** over distance, towers (each its own kind: Zapper/Cannon/Net/Coil) thinning the route, a **perimeter wall with integrity** that **breaks → you control your captain (WASD / drag) and fight the breach by hand**, **Skimmers** that vault the wall to guarantee yard combat, **self-upgrades + evolution** that visibly boost your fighter, the Beacon **Pulse**, and a round-complete card. Spends **Credits + rare Cores**.

**The map is an isometric wooden grid** (like `docklands-survival.html`). **Every tile is tappable.** A clear **wallet** (◆ tokens + ◈ gems) sits up top. In PREP you **tap any square** → a **bottom sheet** slides up with options, each with **its own icon/colour design**, effect, price, and the **live calculation** (*"leaves ◆110"*): **Zapper / Cannon / Spark Coil** (towers) and **Block** (cheap, *just reroutes the gunk*). Some buys cost **gems** not tokens (e.g. Spark Coil ◈3, Evolve ◈2). **Towers and blocks are walls** — the gunk **pathfinds (BFS) around them**, so you build a maze; you can't fully wall off the Beacon (rejected). **Tap your captain** → a trait sheet (Power / Range / Vigor / Evolve, with before→after calcs). Tap a built tower → Tune up / Sell. Round-based PREP/DEFEND, escalating gunk, Beacon hearts, Pulse.  **Visual direction = "Harbor Blueprint"** (brass + teal + weathered-wood palette, stencil/condensed numerals, hand-drawn schematic SVG icons — no emoji, rivets + faint blueprint grid). Each weapon/power-up is a **stat card** with segmented DMG/RNG/RATE bars, a DPS headline, and a tag; captain traits show before→after. **Responsive**: mobile = bottom sheet (1 col); desktop = centered 2-column modal with hover. Verified mobile + desktop in headless chromium, zero console errors. Earlier files show the design's evolution.

Both now also demonstrate the deeper-concept upgrades from the spec:

- **Turret range rings** — every zapper shows its coverage on the floor; a bright ghost ring follows the cursor in Build mode so you see range *before* placing (§8.3.1).
- **The Beacon grows** — it gains a Beacon level and physically grows (taller tower, brighter lamp, rotating sweep at Lv3+, weather-vane at Lv4+) each time you clear a Tide (§8.1.1a).
- **Friendly-junk framing** — enemies are "the gunk" you clear, not monsters (§4.3, §8.3).

The canonical **`-center`** variant additionally shows the **Beacon Pulse** panic button + power meter (charges during a Tide, spend ⚡ to shove all gunk back to the gates — §8.1.1e) and the four-crew lineup (Mira/Penn/Jax/Sol). The `-center` variant is the room model to build: Beacon in the literal middle, gates at the edges, gunk pathing inward from two sides.
