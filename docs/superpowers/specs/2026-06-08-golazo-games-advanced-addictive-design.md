# Golazo arcade games — "advanced & addictive" overhaul

**Date:** 2026-06-08
**Branch:** feat/dock-harmonization
**Scope:** Free Kick + Penalty Duel, plus shared primitives reusable by every Golazo game.
**Approved direction:** core + stretch (full), all four axes — skill ceiling, progression/addiction loop, juice, stakes/competition.

## Problem

Both games are mechanically solid already (drag-to-curl path tracing, power/lift, wall,
keeper prediction, a 2D save envelope, top-bins scoring, particles, shake, haptics). They
still *feel* basic because the structure around the mechanics is flat:

- **Free Kick** is a flat 8-shot run. No combo, no escalation, no shot-quality feedback,
  no slow-mo/replay juice, no competitive hook beyond a raw number.
- **Penalty Duel** has a genuinely good async link-PvP spine (the stakes axis), but the
  solo flow is thin (5 pens, 5 dives, done), the solo keeper is **pure random**
  (`[-1,0,1][random]` — reads as cheap), there is no sudden death, and no keeper *tells*
  to read either way.

## Design — level both games up through shared, testable primitives

Rather than bolt features onto each game, add three small shared libs that both games
(and future ones — KeepyUppy, TopBins, GroupOfDeath) draw from. Keeps the rewrites thin
and the new logic unit-testable.

### New shared libs

1. **`src/lib/combo.ts`** — pure, testable.
   - `gradeShot(input) -> "tidy" | "sweet" | "worldie"` from strike cleanliness
     (swipe-arc smoothness), placement (corner proximity) and pace.
   - `comboMultiplier(streak) -> number` — consecutive goals build a capped multiplier
     (e.g. 1×, 1×, 1.5×, 2×, 2.5×, 3× cap).
   - `scoreFor(basePts, grade, streak) -> number` — combines base points, grade bonus and
     multiplier into the points a goal is worth.
   - No DOM, no canvas. Full unit tests (`combo.test.ts`).

2. **`src/lib/juice.ts`** — game-feel layer on top of the existing `Particles`/`Shake`/`Trail`.
   - `Hitstop` — a slow-mo/freeze-frame controller: `kick(strength)` then `scale()` returns
     a per-frame time multiplier (1 = normal, →0 = frozen) that decays back to 1. Goals
     freeze-frame + slow-mo scaled by grade (worldie = longest).
   - `drawNetRipple(ctx, x, y, r, t)` — a decaying ripple in the goal net at the strike point.
   - `crowdPop(intensity)` — convenience that scales `Shake.kick` + `Particles.emit` count by
     grade/combo so big moments feel bigger.
   - Pure-ish: `Hitstop` math is unit-tested; the draw helpers are thin canvas calls.

3. **`src/lib/sfx.ts`** — tiny **procedural** WebAudio. Zero audio assets (offline-safe).
   - Lazy `AudioContext` (created on first user gesture), short synthesised sounds: `kick`
     (thud), `net` (ripple/swish), `save` (glove parry), `crowd` (filtered-noise swell),
     `whistle`. Each is a few oscillator/noise nodes — no files.
   - Honours a persisted mute (`golazo:muted` in localStorage) and a module-level `setMuted`.
   - Degrades silently where WebAudio is unavailable. No-op in tests (guarded by
     `typeof AudioContext`).

### Free Kick → "endless escalating"

- **Endless escalating rounds** replace the flat 8 shots. Each round ramps difficulty:
  wall creeps closer + taller, keeper sharpens (existing `rampedDifficulty`), a second
  defender can appear, the scoring target band shrinks. Player keeps going until they miss
  their "lives" (e.g. 3 misses ends the run) — an explicit **"one more go"** loop.
- **Combo multiplier** for consecutive goals (via `combo.ts`); a miss resets the streak.
- **Wind**: a per-round lateral wind shown by a small flag/arrow; the player must bend into
  or against it. Adds a readable skill variable. *(stretch)*
- **Shot grade** feedback (Tidy / Sweet / Worldie) drives points + juice intensity.
- **Juice**: slow-mo + freeze-frame + net ripple on goals (scaled by grade), procedural SFX.
- **Daily challenge**: a date-seeded deterministic wall/keeper/wind sequence so every player
  faces the same run that day → comparable, fair leaderboard scores. *(stretch)*
- **Persistent best** in localStorage; end screen shows a **rating**, best, leaderboard
  submit, and a share card.

### Penalty Duel → "real shootout"

- **Solo shootout vs a reading keeper**: replaces the random keeper. The AI keeper reads the
  player's recent placements (tendency) and shows a **tell** — an early lean/feint the player
  can read and punish. `keeper.ts` already models reaction frames + error; extend with a
  small tendency tracker (pure, testable in `duel.ts`/a new helper).
- **Sudden death** after 5–5: alternate until someone misses.
- **Mind-games when *you* keep**: the striker run-up shows a readable tell before the strike,
  so diving is a skill read, not a coin-flip.
- **Keeps async link PvP** (the existing duel codec + share) — strengthen the result screen +
  share card (grade, scoreline, rematch link).
- **Juice**: slow-mo on saves, net ripple on goals, procedural SFX, bigger celebration scaled
  by margin.

### Shared wiring

- Both games already call `onGameOver(score)` → the arcade **leaderboard** keyed by
  `profile.uid`. Overhaul keeps this; adds the **rating** + **share card** path. No identity
  changes (uid stays the stable on-device id).
- A small **mute toggle** surfaced once in the games UI (drives `sfx.setMuted`).

## Architecture / boundaries

- `combo.ts`, `juice.ts` (`Hitstop` math), and the keeper-tendency helper are **pure** and
  unit-tested — no canvas, no DOM.
- Canvas draw helpers (`drawNetRipple`, keeper tells) live next to existing `stadium.ts`
  primitives and are thin.
- `sfx.ts` is the only WebAudio surface, fully guarded + muteable + offline-safe.
- Game components (`FreeKick.tsx`, `PenaltyDuel.tsx`) stay the orchestrators: they own the
  RAF loop and call into the shared libs. No new global state.

## Testing

- `combo.test.ts` — grade thresholds, multiplier curve, `scoreFor` combinations.
- `juice.test.ts` — `Hitstop` decay + clamp; daily-seed determinism (same date → same run).
- Extend `duel.test.ts`/`keeper.test.ts` — keeper tendency read, sudden-death resolution.
- Existing 115 tests stay green; `bun run test` is the gate. Manual: play both games in dev
  (port per showcase) on desktop + mobile viewport.

## Out of scope (YAGNI)

- No audio asset files, no third-party SFX/music libraries.
- No backend for leaderboards — stays on the existing on-device + link-share model.
- No new game modes beyond the two named games (KeepyUppy/TopBins can adopt the shared libs
  later, but are not rewritten here).

## Risks

- WebAudio autoplay policies — mitigated by lazy context on first gesture + silent degrade.
- Slow-mo must not desync the keeper/ball integration — `Hitstop` returns a *time scale* the
  existing fixed-step loop multiplies, rather than changing the step count, so physics stays
  deterministic.
- Shared-worktree / Codex collision — stage only `apps/showcase-golazo/**` for these commits;
  leave the deploy-pipeline files (`wrangler.toml`, `wrap-worker-with-scheduled.mjs`) untouched.
