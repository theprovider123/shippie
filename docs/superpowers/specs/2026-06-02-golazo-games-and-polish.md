# Golazo — game polish, two new games, app pass (2026-06-02)

Approved direction: polish Keepy Uppy + Top Bins to "almost real, still simple";
add **Penalty Shootout** (async head-to-head by link) and **Free Kick** (solo);
then a full app pass to **trim + theme** for World Cup relatability. Offline,
no-login, share-by-link throughout. Build in the `golazo-next-level` worktree.

## 1. Shared stadium stage — `src/lib/stadium.ts`
One canvas toolkit all four games use, so they share a look. Pure canvas, no image
assets, 60fps-minded.
- `drawStadium(ctx, W, H, t, opts)` — sky gradient → blurred crowd band → floodlight
  cones → pitch (perspective stripes + optional markings: `'goal' | 'penalty' | 'none'`).
- `drawBall(ctx, x, y, r, spin, squash)` — radial shading + pentagon hint + rotation.
- `drawBallShadow(ctx, x, groundY, r, heightFrac)` — ellipse that shrinks with height.
- `Trail` — recent positions, fading ghost circles behind a moving ball.
- `Particles` — `emit(x,y,kind)` (`'dust' | 'spark'`), `update(dt)`, `draw(ctx)`.
- `shakeOffset(intensity)` — screen-shake translate applied by the game.
Retrofit `KeepyUppy` + `TopBins` to use these (backdrop, shadow, trail, particles,
squash). Top Bins also gets: a **diving keeper** (animates toward the ball), a **net
that ripples/bulges** on a goal, and a dotted **aim/power arc** while dragging.

## 2. Penalty Shootout — `src/lib/penalty.ts` + `components/games/Penalty.tsx`
Async head-to-head; the link is the match.
- **Play:** 5 spot-kicks. Swipe = direction + power. Keeper dive per kick is
  **deterministic from a seed** (shared via the link) so both players face the same
  difficulty. Outcome per kick: `goal | saved | miss`.
- **Codec:** `#pk=` encodes `{ seed, name, kicks: ("g"|"s"|"m")[] }` (base64url, like the
  bracket/sweep codecs).
- **Flow:** challenger plays → "Challenge a mate" link. Responder opens → sees challenger's
  tally → plays their 5 (same seed) → **result screen "You 4–3 Sam"**. Level → "Level —
  rematch" link. Zero backend.
- **Logic (test-first):** `resolveShootout(mine, theirs)` → `{ me, them, outcome:
  'win'|'lose'|'draw' }`; `keeperDiveFor(seed, kickIndex)` deterministic.

## 3. Free Kick — `components/games/FreeKick.tsx`
Solo skill, feeds the existing leaderboard (`GameId` gains `freekick`).
- Swipe with **curl**: the curvature of the swipe bends the ball mid-flight. Defensive
  **wall** + diving keeper. Limited attempts (8). Top-corner bonus. Scoring → same
  local/worldwide board as Keepy + Top Bins.

## 4. Games surface — `components/Games.tsx`
Four games now. Replace the 2-item segmented toggle with a compact **game-select**: a
small card per game (name · one-line how · your best), tap to play; Penalty shows a
**H2H** badge. Back returns to the select. Leaderboard shows under solo games.

## 5. App pass — trim + theme
- **Trim:** fold **Live** (match-day reactions/presence) into the **Home** screen, drop
  to **4 tabs** (My Call · Predict · Play · Pools). Apply the earlier-noted empty/error
  cleanups where cheap.
- **Theme (relatability):** thread **your nation** (favTeam) through Home — countdown to
  *your* first match, your nation's route, a "group of death" tag — so it reads as *your*
  World Cup. Real flags already strong; lean in.
- Walk the whole app with mobile + desktop screenshots; list + apply concrete cleanups.

## Testing & verification
- Pure logic test-first: penalty resolve + keeper determinism, penalty/challenge codecs,
  free-kick scoring, board merge (existing).
- Games verified via CDP-driven screenshots (seed state, drive to each game).
- `tsc --noEmit` + `vitest run` + `vite build` green per slice. Fresh-visit check on
  mobile + a wide desktop viewport before calling done.

## Slices (commit per slice, unmerged in worktree)
1. Shared stadium stage + retrofit Keepy + Top Bins.
2. Penalty Shootout (logic + UI + codec).
3. Free Kick (logic + UI).
4. Games-surface redesign (4-game select).
5. App pass — trim (Live→Home, 4 tabs) + theme (your-nation Home).
6. Screenshot walkthrough + final polish.
