# Codex handover — Games consolidation (retention spine)

**Branch:** `feat/games-consolidation` · **Author:** Claude (Opus 4.8) · **Date:** 2026-06-04
**Read first:** `docs/superpowers/specs/2026-06-04-shippie-games-consolidation-design.md` (strategy) and `docs/superpowers/plans/2026-06-04-games-phase1-daily-contract-sudoku-slice.md` (Phase-1 plan).

Goal: **retention / daily habit.** Hubs are *collections + a shared spine*, NOT replacements for per-game apps (games keep their identity/subdomains/catalog cards).

---

## ✅ DONE (committed on `feat/games-consolidation`, all tested + building under the bake base)

1. **`@shippie/arcade-kit`** — new workspace package, the finalized shared contract. **9 tests**, typecheck clean, locked into `bun.lock`. API in `packages/arcade-kit/src/index.ts`:
   - Seeding: `mulberry32(seed)`, `djb2(s)`, `todayKeyUTC(d?)` — **UTC** day boundary (decided).
   - Versioned identity: `PuzzleVersion {rules, content}`, `puzzleId(gameId, date, v)` → `<game>-YYYY-MM-DD-rN-cN`, `dailySeed(gameId, date, v)`.
   - Streak (pure): `rollStreak(dates, today)`, `recordToday(prev, today?)`.
   - Daily-set (combined "Today: 4/7"): `DailySetContract`, `setProgress(set, completedTodayGameIds)`, `isSetComplete(done, required)`, `rollSetStreak(setDates, today)`.
   - Persistence (guarded IO): `loadSave`/`writeSave` (`DailySave<T>` envelope), `loadStreak`/`writeStreak`.
   - Share: `shareLines(lines)`, `share(text)` (Web-Share → clipboard).
2. **4 games on the kit** (each `daily.ts` is a thin wrapper — game-specific versions + share copy, everything else delegates):
   - **sudoku** — Daily mode (UTC-seeded board), save/resume, streak, share. Generator made seedable (`generatePuzzle(diff, rng)`). 11 tests.
   - **stack** — Daily 7-bag (same pieces for everyone via `setBagSeed(puzzleId)`), streak, share. 16 tests.
   - **golazo** — daily play-streak in the games hub (coexists with existing scores/leaderboard/share). 70 vitest tests.
   - **block-drop** — shares its existing deterministic daily. 8 tests.
3. **`@shippie/observations`** — `game.completed` now has a typed optional `puzzleId?: string` (sudoku/stack emit it on daily plays). This is the key the platform aggregator reads.

**Verify any app:** `cd apps/showcase-<app> && bun test src && bunx vite build --base=/__shippie-run/<app>/`. NOTE the test runner differs: **sudoku/stack/block-drop use `bun test`; golazo uses `vitest` (`bun run test`)**. Screenshot harness: `apps/platform/_shotkit/` (run with `bun` from `apps/platform`).

---

## ⏳ REMAINING — in priority order

### 1. Platform `/today` cross-game daily streak (HIGHEST VALUE — the headline mechanic)
**Why platform, not a hub app:** deep-linked games are separate-origin PWAs → a hub app can't read their localStorage. The cross-game streak must aggregate where the data lands: the **`game.completed` observations** in the platform's IndexedDB intent-store.

**Exact build:**
- Add `@shippie/arcade-kit: workspace:*` to `apps/platform/package.json` (SvelteKit/Vite resolves the source export; only the **pure** kit fns are used — `setProgress`/`rollSetStreak`/`todayKeyUTC` — no localStorage in SSR).
- New module `apps/platform/src/lib/intent-store/daily-streak.ts`:
  - Input: `IntentEvent[]` from `listEventsSince(...)` (`$lib/intent-store/store`). Shape: `{ ts, appId, intent, row }`. Filter `intent === 'game.completed'` AND `row.puzzleId` present (daily plays only).
  - Derive, per **UTC** date (parse the `YYYY-MM-DD` out of `row.puzzleId`, segments 1-3, or `todayKeyUTC(new Date(ts))`), the set of member games completed.
  - Define the daily set (start: `['sudoku','five-letter','quartet','block-drop','daily-puzzle']` — the daily-capable games; `requiredCount` ~3). Build a `DailySetContract`.
  - For each date compute `setProgress`; collect dates where `complete` → `rollSetStreak(those, todayKeyUTC())`. Return `{ current, best, today: setProgress(set, completedTodayGameIds) }`.
  - Unit-test it (the platform uses vitest).
- Render in `apps/platform/src/routes/today/+page.svelte`: a "🔥 N-day streak" badge + "Today's Daily N/M" using the existing `summary`/events it already loads. (It already calls `listEventsSince`.)
- **Collision warning:** the platform is where you (Codex) are actively committing — this is intentionally yours to avoid the shared-HEAD collisions we hit (see Gotchas).

### 2. Retrofit the remaining daily/arcade games onto the kit (mechanical — copy the wrapper pattern)
Per `docs/.../2026-06-04-...-design.md` §8. Pattern = add `@shippie/arcade-kit` dep + replace/clean the app's daily helpers with kit calls + add `share()` on daily game-over (+ `puzzleId` on the `game.completed` emit).
- **Have daily-seed, need SHARE** (quick): snake, bricks, drift, maze, lustre, crossing, maze.
- **Need daily-seed + streak + share**: memory-grid, reaction, invaders, bulwark, docklands (docklands also needs SDK sound/observations — it's an island).
- **five-letter / quartet**: already premium daily — just point them at the kit + emit `puzzleId` so they feed the /today streak.
- **chess**: NEW daily tactic puzzle (biggest untapped hook) — its own slice.
- De-dup: delete the weak embedded sudoku/memory/reaction inside `daily-puzzle`; have it consume the real engines.

### 3. Shippie Arcade hub + Shippie Daily surface (collections)
The "hubs" are collection/navigation surfaces + the platform streak — NOT new apps that fork games. Smallest version: catalog collections ("Arcade", "Daily") over the existing per-game cards + the `/today` streak (item 1). A standalone embedding hub app is deferred (heavier; only it can show games inline same-origin).

### 4. Phase-2 (deferred): coins/XP/achievements, ghost/replay, server-verified leaderboards.

---

## ⚠️ Gotchas / decisions (don't re-litigate)
- **UTC day boundary** — the kit standardizes on it (old five-letter used local). "Same puzzle for everyone" requires UTC.
- **Versioned `puzzleId`** — bump `rules`/`content` on changes so old entries never corrupt streaks.
- **Cross-game streak = platform observations**, not a cross-origin hub. (Resolved in spec §2.)
- **Shared working directory** — Claude + Codex share the repo/HEAD, so "branch isolation" is partial: a Codex platform commit (`4397d515`) interleaved into this branch mid-stream. **Never `git commit --amend`** here (it rewrote a Codex commit once and diverged). Commit only files you changed.
- **Per-app test runners differ** (bun vs vitest) — check `package.json#scripts.test` before running.
- **Bake base** — always validate with `vite build --base=/__shippie-run/<slug>/`; Vite rewrites root-relative asset/font URLs to the based path.

## Commits (this branch, mine)
`docs(games) strategy` → `docs(games) review tweaks` → `docs(games) Phase-1 plan` → `feat(sudoku) generator+contract` → `feat(sudoku) daily` → `feat(stack) daily` → `feat(golazo) streak` → `feat(arcade-kit) extract+retrofit` → `chore lock` → `feat(arcade-kit) DailySetContract+resolve` → `feat(block-drop) share` → `feat(observations) puzzleId`.
