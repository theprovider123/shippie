// apps/showcase-crossing/src/game/timer.ts
import type { FroggerState } from './state.ts';

export const TIMER_TOTAL_MS = 30_000;
export const HURRY_THRESHOLD_MS = 10_000;

/**
 * Tick the per-frog timer. Returns 'hurry' the first frame it crosses
 * the hurry threshold, 'expired' when timer hits 0, else 'ok'.
 */
export function tickTimer(state: FroggerState, dtMs: number): 'ok' | 'hurry' | 'expired' {
  if (state.phase !== 'playing') return 'ok';
  const wasAboveHurry = state.timerMs > HURRY_THRESHOLD_MS;
  state.timerMs = Math.max(0, state.timerMs - dtMs);
  if (state.timerMs === 0) return 'expired';
  if (wasAboveHurry && state.timerMs <= HURRY_THRESHOLD_MS) return 'hurry';
  return 'ok';
}

export function timerFraction(state: FroggerState): number {
  return state.timerMs / TIMER_TOTAL_MS;
}
