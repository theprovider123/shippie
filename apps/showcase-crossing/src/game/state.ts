// apps/showcase-crossing/src/game/state.ts

import { generateLevel, HOME_SLOTS, COLS, type Level } from './lanes.ts';

export type GamePhase =
  | 'attract'     // title screen, waiting for start
  | 'playing'     // frog active
  | 'dead-flash'  // 700ms death animation then respawn or game-over
  | 'level-clear' // brief celebration before next level
  | 'game-over';  // final score screen

export interface FrogPos {
  /** Integer grid column [0, COLS) */
  col: number;
  /** Integer grid row [0, ROWS) */
  row: number;
  /** Fractional horizontal offset from log/turtle riding (cells) */
  drift: number;
}

export interface HomeSlot {
  occupied: boolean;
  hasFly: boolean;
}

export interface HopTween {
  fromCol: number;
  fromRow: number;
  toCol: number;
  toRow: number;
  /** ms timestamp when the tween started */
  startMs: number;
  /** duration in ms */
  durationMs: number;
}

export interface FroggerState {
  phase: GamePhase;
  level: Level;
  levelNumber: number;

  frog: FrogPos;
  lives: number;
  score: number;
  bestScore: number;
  extraLifeAwarded: boolean;

  /** Maximum row the frog has reached in current life (for hop scoring) */
  maxRow: number;

  homeSlots: HomeSlot[];  // length 5, indexed by HOME_SLOTS position
  homesFilledThisLevel: number;

  /** Active hop tween, null when frog is standing */
  hopTween: HopTween | null;

  /** ms remaining on per-frog 30s timer */
  timerMs: number;

  /** ms remaining in dead-flash phase */
  deathFlashMs: number;

  /** ms remaining in level-clear phase */
  levelClearMs: number;

  /** Fly: active slot index (0-4), or -1 for none */
  flySlotIndex: number;
  /** ms until fly disappears */
  flyRemainingMs: number;

  /** Accumulated simulation time in seconds (drives lane animation) */
  simTimeSec: number;

  /** Screen-shake magnitude in pixels, decays each frame */
  shakeMag: number;

  /** Whether the hurry audio loop is active */
  hurryActive: boolean;

  /** Whether the first hop has happened (for hint fade) */
  firstHopDone: boolean;
}

const FROG_TIMER_MS = 30_000;
const FLY_DURATION_MS = 12_000;
const FLY_INTERVAL_MS = 8_000;

let _flyTimerMs = FLY_INTERVAL_MS;

export function createState(levelNumber = 1, bestScore = 0): FroggerState {
  const level = generateLevel(levelNumber);
  return {
    phase: 'attract',
    level,
    levelNumber,
    frog: { col: Math.floor(COLS / 2), row: 0, drift: 0 },
    lives: 3,
    score: 0,
    bestScore,
    extraLifeAwarded: false,
    maxRow: 0,
    homeSlots: Array.from({ length: HOME_SLOTS.length }, () => ({ occupied: false, hasFly: false })),
    homesFilledThisLevel: 0,
    hopTween: null,
    timerMs: FROG_TIMER_MS,
    deathFlashMs: 0,
    levelClearMs: 0,
    flySlotIndex: -1,
    flyRemainingMs: 0,
    simTimeSec: 0,
    shakeMag: 0,
    hurryActive: false,
    firstHopDone: false,
  };
}

export function resetFrog(state: FroggerState): void {
  state.frog = { col: Math.floor(COLS / 2), row: 0, drift: 0 };
  state.hopTween = null;
  state.timerMs = FROG_TIMER_MS;
  state.maxRow = 0;
  state.hurryActive = false;
  _flyTimerMs = FLY_INTERVAL_MS;
}

export function advanceLevel(state: FroggerState): void {
  state.levelNumber += 1;
  state.level = generateLevel(state.levelNumber);
  state.homeSlots = Array.from({ length: HOME_SLOTS.length }, () => ({ occupied: false, hasFly: false }));
  state.homesFilledThisLevel = 0;
  state.flySlotIndex = -1;
  state.flyRemainingMs = 0;
  _flyTimerMs = FLY_INTERVAL_MS;
  resetFrog(state);
}

/** Call each frame with dtMs elapsed. Returns true if a new fly spawned. */
export function tickFlyTimer(state: FroggerState, dtMs: number): boolean {
  if (state.phase !== 'playing') return false;
  if (state.flySlotIndex >= 0) {
    state.flyRemainingMs -= dtMs;
    if (state.flyRemainingMs <= 0) {
      state.flySlotIndex = -1;
      state.flyRemainingMs = 0;
    }
    return false;
  }
  _flyTimerMs -= dtMs;
  if (_flyTimerMs <= 0) {
    _flyTimerMs = FLY_INTERVAL_MS;
    // Pick an unoccupied slot
    const free = state.homeSlots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => !s.occupied);
    if (free.length > 0) {
      const pick = free[Math.floor(Math.random() * free.length)]!;
      state.flySlotIndex = pick.i;
      state.flyRemainingMs = FLY_DURATION_MS;
      return true;
    }
  }
  return false;
}
