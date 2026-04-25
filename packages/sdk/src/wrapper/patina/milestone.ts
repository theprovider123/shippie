/**
 * Fire `milestone` texture at day 100 of usage age.
 *
 * Each milestone fires exactly once per origin per device; the firing is
 * recorded in PatinaState.milestonesFired so we never repeat. Milestones
 * are one-shots — they don't try to celebrate every Tuesday.
 */
import { fireTexture } from '../textures/engine.ts';
import type { PatinaState } from './types.ts';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function maybeFireMilestone(state: PatinaState, now: number = Date.now()): PatinaState {
  const ageMs = now - state.firstSeenAt;
  if (ageMs < 100 * ONE_DAY_MS) return state;
  if (state.milestonesFired.includes('milestone')) return state;
  fireTexture('milestone');
  return { ...state, milestonesFired: [...state.milestonesFired, 'milestone'] };
}
