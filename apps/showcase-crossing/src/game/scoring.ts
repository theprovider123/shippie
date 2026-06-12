// apps/showcase-crossing/src/game/scoring.ts
import type { FroggerState } from './state.ts';

export const SCORE_HOP = 10;
export const SCORE_HOME = 50;
export const SCORE_FLY = 200;
export const SCORE_LEVEL_BASE = 1000;
export const SCORE_TIME_BONUS_PER_SEC = 10;
export const EXTRA_LIFE_THRESHOLD = 10_000;

export function applyHopScore(state: FroggerState): void {
  state.score += SCORE_HOP;
}

export function applyHomeScore(state: FroggerState, hasFly: boolean): void {
  state.score += hasFly ? SCORE_FLY : SCORE_HOME;
}

export function applyLevelClearBonus(state: FroggerState): void {
  const timeBonusSec = Math.floor(state.timerMs / 1000);
  state.score += SCORE_LEVEL_BASE + timeBonusSec * SCORE_TIME_BONUS_PER_SEC;
}

export function applyExtraLife(state: FroggerState): void {
  if (!state.extraLifeAwarded && state.score >= EXTRA_LIFE_THRESHOLD) {
    state.extraLifeAwarded = true;
    state.lives += 1;
  }
}
