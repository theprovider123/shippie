# Games Phase 1 — daily contract + Sudoku vertical slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Prove the daily/streak/share/save-resume contract by adding a Daily mode to Sudoku (currently zero persistence), discovering the real shared-kit needs before extraction.

**Architecture:** A small per-app `daily.ts` module implements the *drafted* contract (§3.2 of the strategy doc) locally in `showcase-sudoku` — UTC `todayKey`, `djb2`→`mulberry32` seed, `puzzleId`, streak roll, save/resume of in-progress state, and a result share string. Seed the existing generator by threading an optional RNG. Wire a Free/Daily toggle into the app. This is deliberately *not* a shared package yet — the kit is extracted in Phase 5 from what these slices actually needed.

**Tech Stack:** Vite + React + TS, `bun test`, `@shippie/observations` (already wired). UTC day boundary (decided default).

**Branch:** `feat/games-consolidation`. Spec: `docs/superpowers/specs/2026-06-04-shippie-games-consolidation-design.md`.

---

### Task 1: Seed the generator (deterministic daily boards)

**Files:**
- Modify: `apps/showcase-sudoku/src/sudoku.ts`
- Test: `apps/showcase-sudoku/src/sudoku.test.ts` (create)

- [ ] **Step 1 — failing test:** same seed → identical puzzle; different seed → different.
```ts
import { test, expect } from 'bun:test';
import { generatePuzzle } from './sudoku';
test('seeded generation is deterministic', () => {
  const rng = (s: number) => { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const a = generatePuzzle('medium', rng(123));
  const b = generatePuzzle('medium', rng(123));
  const c = generatePuzzle('medium', rng(999));
  expect(a.puzzle).toEqual(b.puzzle);
  expect(a.puzzle).not.toEqual(c.puzzle);
});
```
- [ ] **Step 2 — run, expect FAIL** (`generatePuzzle` ignores arg 2): `cd apps/showcase-sudoku && bun test src/sudoku.test.ts`
- [ ] **Step 3 — implement:** add `rng: () => number = Math.random` param to `generatePuzzle`; thread into `shuffled(arr, rng)`, `solveFill(board, rng)`, `generateSolved(rng)`. `shuffled` uses `rng()` instead of `Math.random()`.
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit:** `git add apps/showcase-sudoku/src/sudoku.ts apps/showcase-sudoku/src/sudoku.test.ts && git commit -m "feat(sudoku): seedable generator for deterministic daily boards"`

### Task 2: The drafted daily contract module

**Files:**
- Create: `apps/showcase-sudoku/src/daily.ts`
- Test: `apps/showcase-sudoku/src/daily.test.ts`

`daily.ts` exports (the §3.2 draft, scoped to one app):
```ts
export const RULES_VERSION = 1;
export const CONTENT_VERSION = 1;
export function mulberry32(seed: number): () => number { /* standard */ }
export function djb2(s: string): number { /* from five-letter */ }
export function todayKeyUTC(d = new Date()): string { /* YYYY-MM-DD at UTC */ }
export function dailySeed(gameId: string, date: string): number { return djb2(`${gameId}-${date}-r${RULES_VERSION}-c${CONTENT_VERSION}`); }
export function puzzleId(gameId: string, date: string): string { return `${gameId}-${date}-r${RULES_VERSION}-c${CONTENT_VERSION}`; }
// streak: walk consecutive UTC dates back from today over a set of completed dates
export function rollStreak(completedDates: string[], today: string): { current: number; best: number };
// save/resume: typed read/write of an in-progress snapshot keyed by puzzleId
export interface DailySave<T> { puzzleId: string; payloadVersion: number; payload: T }
export function loadSave<T>(key: string): DailySave<T> | null;
export function writeSave<T>(key: string, save: DailySave<T>): void;
```

- [ ] **Step 1 — failing tests:** `todayKeyUTC(new Date('2026-06-04T23:30:00Z'))==='2026-06-04'`; `dailySeed('sudoku','2026-06-04')` stable; `rollStreak(['2026-06-02','2026-06-03','2026-06-04'],'2026-06-04')==={current:3,best:3}`; gap breaks current but keeps best; `loadSave`/`writeSave` round-trip (mock `localStorage`).
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement** `daily.ts` (mulberry32 + djb2 from five-letter; UTC date; streak walk; localStorage save with try/catch + graceful null on parse error / missing).
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit:** `git commit -m "feat(sudoku): drafted daily/streak/save contract module"`

### Task 3: Daily mode + save/resume + streak in the app

**Files:** Modify `apps/showcase-sudoku/src/App.tsx`, `apps/showcase-sudoku/src/styles.css`

- [ ] **Step 1:** Add a Free/Daily segmented toggle. In Daily: build the board from `generatePuzzle('medium', mulberry32(dailySeed('sudoku', todayKeyUTC())))` (daily difficulty fixed = medium for "same puzzle for everyone").
- [ ] **Step 2:** Save/resume — on every board/pencil/hint change in Daily, `writeSave('sudoku.daily.v1', {puzzleId, payloadVersion:1, payload:{board,pencils,hintsLeft,startedAt}})`. On mount in Daily, `loadSave` and restore if `puzzleId` matches today's (else fresh). A refresh mid-solve must not lose progress.
- [ ] **Step 3:** Streak — persist `sudoku.streak.v1 = {completedDates:string[], best:number}`. On daily solve, append `todayKeyUTC()` (dedup), compute `rollStreak`, show a `<StreakBadge>` (current 🔥 + best). Existing `observations.emit` keeps firing, now stamped with `puzzleId`.
- [ ] **Step 4:** Build (`bun run build`) + the existing `App.test.ts` green; manual: solve daily → streak 1; reload mid-solve → resumes.
- [ ] **Step 5 — commit:** `git commit -m "feat(sudoku): daily board + save/resume + streak"`

### Task 4: Result share card

**Files:** Modify `apps/showcase-sudoku/src/App.tsx`; add `shareResult()` to `daily.ts` + test.

- [ ] **Step 1 — failing test:** `shareResult({puzzleId:'sudoku-2026-06-04-r1-c1', seconds:312, hintsUsed:1})` contains the date, `5:12`, hint count, and `shippie.app/run/sudoku/`.
- [ ] **Step 2 — FAIL.** **Step 3 — implement** `shareResult` (text card, five-letter's `shareGrid` style). **Step 4 — PASS.**
- [ ] **Step 5:** Wire a "Share" button into the Daily solved state → `navigator.share({text})` with `navigator.clipboard.writeText` fallback (guard for undefined). Commit `feat(sudoku): daily result share card`.

---

## Self-review
- Spec coverage: exercises §3.2 (result + puzzleId + rulesVersion/contentVersion), §3.3 (cosmetic-local only — no leaderboard yet, correct for slice), §9.1 (local-data save/resume + graceful fallback). Combined-set (§3.2b) is out of scope for a single-game slice (correct — surfaces in the Daily hub).
- No placeholders: each task has real code/commands.
- Type consistency: `puzzleId`/`dailySeed`/`rollStreak`/`DailySave` names are used identically across tasks.

## Next units (subsequent plans)
Stack slice (daily-seed bag + share) → TopBins slice (streak + share) → **finalize contract** from the three → extract `@shippie/arcade-kit` → Daily hub → Arcade hub → Golazo + /today. Each its own plan.
