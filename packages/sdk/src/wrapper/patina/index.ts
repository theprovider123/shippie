/**
 * Boot the patina layer. Loads state (or seeds it), applies the warmth
 * CSS variable, fires any due milestones, and writes the updated state
 * back. Failures are swallowed — patina is cosmetic.
 */
import { loadPatinaState, savePatinaState } from './storage.ts';
import { computeWarmth, applyPageWarmth } from './page.ts';
import { maybeFireMilestone } from './milestone.ts';
import { DEFAULT_PATINA_CONFIG, type PatinaConfig } from './types.ts';

let config: PatinaConfig = { ...DEFAULT_PATINA_CONFIG };

export function configurePatina(patch: Partial<PatinaConfig>): void {
  config = { ...config, ...patch };
}

export function getPatinaConfig(): PatinaConfig {
  return { ...config };
}

export async function installPatina(now: number = Date.now()): Promise<void> {
  if (!config.enabled) return;
  let state = await loadPatinaState();
  if (!state) {
    state = { firstSeenAt: now, lastSeenAt: now, sessionCount: 1, milestonesFired: [] };
  } else {
    state = { ...state, lastSeenAt: now, sessionCount: state.sessionCount + 1 };
  }

  applyPageWarmth(computeWarmth(state, config, now));
  state = maybeFireMilestone(state, now);

  await savePatinaState(state);
}

export type { PatinaState, PatinaConfig } from './types.ts';
