# Crossing — Full Frogger Rewrite Design

**Date:** 2026-06-12  
**App:** `apps/showcase-crossing`  
**Branch:** `feat/dock-harmonization`

## Problem

The existing Crossing is broken: tutorial modal blocks the board on load, arrow keys do nothing (phase guard prevents input), vehicles render as dark blocks (CSS `background` on positioned spans misread by layout engine), and portrait phone leaves a third of the screen as dead space below the playfield.

## Solution

Complete rewrite into a proper canvas-based Frogger. Single `<canvas>` with devicePixelRatio-aware rendering, fixed-timestep logic loop decoupled from `requestAnimationFrame`, pure TypeScript game modules with bun:test coverage.

## Architecture

### Files

```
src/
  game/
    state.ts       — FroggerState, GamePhase, all mutable game state
    lanes.ts       — LaneConfig per level, generateLevel(), speeds, turtle dive cycles
    physics.ts     — hop bounds, car collision, log ride drift, drown, home scoring
    scoring.ts     — hop score, home score, fly bonus, level clear, extra life
    timer.ts       — per-frog 30s countdown, hurry threshold
    audio.ts       — WebAudio blips: hop, home, death, hurry, level clear
  renderer/
    canvas.ts      — drawBoard(), drawHUD(), drawVehicles(), drawLogs(), drawFrog()
    palette.ts     — canonical colour tokens
  App.tsx          — React shell (canvas ref, game loop, input, intent emit)
  fullscreen.ts    — reuse existing
  main.tsx         — entry point (unchanged)

  game/state.test.ts    — hop bounds, collision, ride, drown, home scoring, level clear
```

### Board Layout (13 × 13 grid)

```
Row 12  — home row: 5 slots + banks between them
Row 11  — river lane 5 (fastest)
Row 10  — river lane 4
Row  9  — river lane 3
Row  8  — river lane 2
Row  7  — river lane 1 (slowest)
Row  6  — safe median
Row  5  — road lane 5 (fastest)
Row  4  — road lane 4
Row  3  — road lane 3
Row  2  — road lane 2
Row  1  — road lane 1 (slowest)
Row  0  — start verge (safe)
```

### Canvas Renderer

- Single `<canvas>` element, sized to fill its container, preserving square aspect.
- `devicePixelRatio`-aware: canvas logical size = CSS size × dpr.
- HUD strip at the top: SCORE / HI / frog-lives / LEVEL drawn via `fillText`.
- Timer bar at the bottom of the canvas.
- Game objects drawn each frame from game state: no DOM nodes, no SVG, no emoji.
- Chunky flat-colour pixel-art style: rectangles + circles only, no images/spritesheet.

### Game Logic

**State machine:** `attract → playing → dead-flash → playing | game-over → attract`

**Hop:** 120ms tween, squash-and-stretch via vertical scale transform on canvas. Key-repeat guard (ignore same-direction keydown while tween is active). Frog position = integer grid cell; tween interpolates visually only.

**Traffic lanes:** Deterministic per-lane obstacle stream (period × density × RNG seeded by `level + laneIndex`). Cars slide left or right at `laneSpeed[level][lane]`. Collision: at hop-landing frame, check if frog cell overlaps any vehicle rect.

**River lanes:** Log groups (small=2, medium=3, large=4 cells) and turtle groups (2-3 turtles). Turtles dive on a per-group cycle (8s surface, 3s submerge; vary by lane). Frog rides: each frame, frog x += log/turtle drift. Drift off-screen = drown. Standing on water when no log/turtle under centre = drown.

**Home row:** 5 slots at columns 1, 3, 5, 7, 11 (classic Frogger spacing). Between slots = bank (death). Landing occupied slot = death. Empty slot = score + lock frog sprite. Fly bonus: 1 random slot at a time, 12s lifespan, 150 pts.

**Scoring:**
- 10 pts per forward hop (only new maximum row)
- 50 pts landing home slot
- 200 pts landing home slot with fly
- 1000 pts + (remaining time × 10) for clearing all 5 homes → level up
- Extra life at 10,000 pts (once)

**Timer:** 30s per frog. Visible bar shrinks. Under 10s: hurry audio loop.

**Deaths:** 700ms flash (skull icon on canvas), respawn at start row.

**Levels:** Speed multiplier increases per level. More turtles dive at higher levels. River speeds up. Log density adjusts.

### Controls

- Keyboard: `ArrowUp/Down/Left/Right`, `WASD`. Key-repeat guard on tween.
- Touch swipe: threshold 12px, resolved on `pointerup`.
- Touch tap-zone: tap top half = forward, bottom = back, left = left, right = right.
- D-pad not rendered (swipe/zone is cleaner at full-bleed).
- Pause on `visibilitychange`.

### Page Shell

- Full-bleed `<canvas>`, no serif document header.
- Thin `<header>` above canvas: "CROSSING" wordmark + sound toggle + fullscreen button.
- Hint line below canvas: "arrows / swipe to hop" fades after first hop.
- Press Start 2P font for in-canvas HUD text (copy from arcade public/fonts/).

### Shippie Integration

- `createShippieIframeSdk({ appId: 'app_crossing' })` + `sdk.safeEdges.declareInputRegion('all')`.
- `observations.emit({ kind: 'game.completed', game: 'crossing', result: '...', at: ... })` on game-over.
- `shippie.json` `provides` updated to `['game.completed']`.

### Audio

WebAudio only, no external requests. Tones generated via OscillatorNode:
- hop: 440Hz triangle, 60ms
- home: 880Hz + 1100Hz chord, 200ms
- death: descending 440→220Hz, 700ms
- hurry: repeating 660Hz beep, every 500ms under 10s
- level clear: ascending arpeggio 440→880→1320Hz

### Tests (bun:test)

`src/game/state.test.ts`:
1. Hop bounds: can't hop past grid edges
2. Car collision: frog at car cell = dead
3. Log ride drift: frog x advances with log speed each tick
4. Drown on open water: no log at frog position = drown
5. Drown on diving turtle: turtle submerged = drown
6. Home scoring: empty slot = +50 pts + locked
7. Home scoring: occupied slot = dead
8. Home scoring: fly in slot = +200 pts
9. Level progression: all 5 homes filled → level + 1, speed multiplier increases
10. Extra life: score crosses 10,000 → lives + 1 (only once)

## Palette

| Token | Value | Usage |
|---|---|---|
| `river-deep` | `#1A5E7A` | River base |
| `river-mid` | `#2178A0` | River shimmer |
| `grass` | `#4A8C3F` | Safe lanes |
| `grass-stripe` | `#3A7230` | Safe lane stripe |
| `road` | `#2E2E2E` | Road base |
| `road-stripe` | `#F4B860` | Road centre lines |
| `frog` | `#7CE36B` | Frog body |
| `frog-dark` | `#4FA450` | Frog belly/shadow |
| `log-brown` | `#8B5E3C` | Log body |
| `car-red` | `#E84A2D` | Cars (alt: amber, cream) |
| `accent` | `#59D98E` | Home slots, HUD accent |

## Non-goals

- Multiplayer, daily seeds (removed to keep scope tight — add later)
- Character unlocks (removed)
- Eagle mechanic (removed)
- Campaign mode (removed)
- Pickups/shields/multiplier (removed)

## Success criteria

- `bun run typecheck && bun test src/ && bun run build` all green
- 10 tests passing
- Frog hops with ArrowUp, dies on car, drowns on open water, lands home slot
- Runs inside arcade iframe at `/__shippie-run/crossing/`
- No onboarding modal, no dead space on phone
