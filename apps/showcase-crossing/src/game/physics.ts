// apps/showcase-crossing/src/game/physics.ts

import { COLS, ROWS, HOME_SLOTS, obstaclesForLane, rideableUnder } from './lanes.ts';
import {
  type FroggerState,
  type HopTween,
  resetFrog,
  advanceLevel,
} from './state.ts';
import { applyHopScore, applyHomeScore, applyLevelClearBonus, applyExtraLife } from './scoring.ts';

export const HOP_DURATION_MS = 120;
const DEATH_FLASH_MS = 700;
const LEVEL_CLEAR_MS = 1200;
const SHAKE_ON_DEATH = 8;

export type DeathReason = 'car' | 'drown' | 'off-screen' | 'home-bank' | 'home-occupied' | 'timer';

/** Start a hop in direction (dc, dr). dc/dr ∈ {-1,0,1}. */
export function startHop(state: FroggerState, dc: number, dr: number, nowMs: number): void {
  if (state.phase !== 'playing') return;
  if (state.hopTween !== null) return; // key-repeat guard

  const fromCol = state.frog.col + state.frog.drift;
  const fromRow = state.frog.row;
  const toCol = Math.max(0, Math.min(COLS - 1, Math.round(fromCol) + dc));
  const toRow = Math.max(0, Math.min(ROWS - 1, fromRow + dr));

  // No-op if clamped to same cell
  if (toCol === Math.round(fromCol) && toRow === fromRow) return;

  state.hopTween = {
    fromCol,
    fromRow,
    toCol,
    toRow,
    startMs: nowMs,
    durationMs: HOP_DURATION_MS,
  };
  state.firstHopDone = true;
}

/** Resolve a completed hop: updates frog position, checks collision, scores. */
export function resolveHop(state: FroggerState): void {
  const tween = state.hopTween!;
  state.hopTween = null;
  // Snap frog to integer column, incorporating any drift that accumulated
  state.frog.col = tween.toCol;
  state.frog.row = tween.toRow;
  state.frog.drift = 0;

  const row = tween.toRow;
  const lane = state.level.lanes[row]!;

  // ── Home row ──────────────────────────────────────────────────────
  if (lane.kind === 'home') {
    const slotIdx = HOME_SLOTS.indexOf(tween.toCol);
    if (slotIdx === -1) {
      // Landed on a bank between slots → death
      killFrog(state, 'home-bank');
      return;
    }
    const slot = state.homeSlots[slotIdx]!;
    if (slot.occupied) {
      killFrog(state, 'home-occupied');
      return;
    }
    // Score the home
    const hasFly = state.flySlotIndex === slotIdx;
    applyHomeScore(state, hasFly);
    slot.occupied = true;
    slot.hasFly = false;
    if (hasFly) {
      state.flySlotIndex = -1;
      state.flyRemainingMs = 0;
    }
    state.homesFilledThisLevel += 1;

    if (state.homesFilledThisLevel >= HOME_SLOTS.length) {
      // All homes filled → level clear
      applyLevelClearBonus(state);
      state.phase = 'level-clear';
      state.levelClearMs = LEVEL_CLEAR_MS;
    } else {
      resetFrog(state);
    }
    return;
  }

  // ── Road: check collision with car ────────────────────────────────
  if (lane.kind === 'road') {
    const frogX = state.frog.col;
    for (const obs of obstaclesForLane(lane, state.simTimeSec)) {
      if (frogX + 1 > obs.x && frogX < obs.x + obs.width) {
        killFrog(state, 'car');
        return;
      }
    }
  }

  // ── Score forward hops ────────────────────────────────────────────
  if (tween.toRow > tween.fromRow && tween.toRow > state.maxRow) {
    state.maxRow = tween.toRow;
    applyHopScore(state);
  }

  applyExtraLife(state);
}

/**
 * Tick riding physics for the frog while standing on a river lane.
 * Returns false if the frog drowned.
 */
export function tickRiver(state: FroggerState, dtSec: number): boolean {
  if (state.hopTween !== null) return true; // don't drift mid-hop
  const lane = state.level.lanes[state.frog.row];
  if (!lane || lane.kind !== 'river') return true;

  const frogX = state.frog.col + state.frog.drift;
  const drift = rideableUnder(lane, state.simTimeSec, frogX);
  if (drift === null) {
    killFrog(state, 'drown');
    return false;
  }
  state.frog.drift += drift * dtSec;

  // Drifted off screen
  const effectiveX = state.frog.col + state.frog.drift;
  if (effectiveX < -0.5 || effectiveX > COLS - 0.5) {
    killFrog(state, 'off-screen');
    return false;
  }
  return true;
}

/**
 * Check road collision while the frog is standing still (between hops).
 * Returns false if frog was hit.
 */
export function tickRoad(state: FroggerState): boolean {
  if (state.hopTween !== null) return true;
  const lane = state.level.lanes[state.frog.row];
  if (!lane || lane.kind !== 'road') return true;

  const frogX = state.frog.col + state.frog.drift;
  for (const obs of obstaclesForLane(lane, state.simTimeSec)) {
    if (frogX + 0.8 > obs.x && frogX + 0.2 < obs.x + obs.width) {
      killFrog(state, 'car');
      return false;
    }
  }
  return true;
}

function killFrog(state: FroggerState, _reason: DeathReason): void {
  state.phase = 'dead-flash';
  state.deathFlashMs = DEATH_FLASH_MS;
  state.shakeMag = SHAKE_ON_DEATH;
  state.hopTween = null;
  state.lives -= 1;
  if (state.bestScore < state.score) state.bestScore = state.score;
}

/** Call each frame while phase === 'dead-flash'. Returns true when flash ends. */
export function tickDeathFlash(state: FroggerState, dtMs: number): boolean {
  state.deathFlashMs -= dtMs;
  state.shakeMag = Math.max(0, state.shakeMag - dtMs * 0.02);
  if (state.deathFlashMs <= 0) {
    state.deathFlashMs = 0;
    if (state.lives <= 0) {
      state.phase = 'game-over';
    } else {
      resetFrog(state);
      state.phase = 'playing';
    }
    return true;
  }
  return false;
}

/** Call each frame while phase === 'level-clear'. Returns true when done. */
export function tickLevelClear(state: FroggerState, dtMs: number): boolean {
  state.levelClearMs -= dtMs;
  if (state.levelClearMs <= 0) {
    advanceLevel(state);
    state.phase = 'playing';
    return true;
  }
  return false;
}

// Suppress unused import warning for HopTween
export type { HopTween };
