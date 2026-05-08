/**
 * Weekly cost rollup — emphasis on *estimate*.
 *
 * If a planned recipe carries a `costPerServing`, we use it. Otherwise
 * we fall back to a configurable default (`DEFAULT_COST_PER_SERVING`)
 * — chosen at the call site so the user can dial it. The output
 * carries `estimatedSlots` vs `taggedSlots` so the UI can be honest:
 * "12 of 14 slots used a fallback estimate".
 *
 * No "exact" math, no taxes, no shrinkage. Pantry isn't subtracted —
 * the user's cap is the *spending plan*, not their fridge audit.
 */

import { DAYS, SLOTS } from './types.ts';
import type { Plan } from './types.ts';

export const DEFAULT_COST_PER_SERVING = 4.5; // user-overridable in Settings

export interface CostRollup {
  weekTotal: number;
  taggedSlots: number;
  estimatedSlots: number;
  filledSlots: number;
}

export function estimateWeekCost(
  plan: Plan,
  fallbackPerServing: number = DEFAULT_COST_PER_SERVING,
): CostRollup {
  let weekTotal = 0;
  let taggedSlots = 0;
  let estimatedSlots = 0;
  let filledSlots = 0;
  for (const day of DAYS) {
    for (const slot of SLOTS) {
      const cell = plan[day]?.[slot];
      if (!cell) continue;
      filledSlots += 1;
      const servings = Math.max(0, cell.servings || 0);
      if (typeof cell.costPerServing === 'number' && Number.isFinite(cell.costPerServing)) {
        weekTotal += cell.costPerServing * servings;
        taggedSlots += 1;
      } else {
        weekTotal += fallbackPerServing * servings;
        estimatedSlots += 1;
      }
    }
  }
  return { weekTotal, taggedSlots, estimatedSlots, filledSlots };
}

export interface BudgetStatus {
  estimate: number;
  cap: number | null;
  /** 0–1+ (can exceed 1 when over budget). null when no cap is set. */
  ratio: number | null;
  state: 'no-cap' | 'under' | 'near' | 'over';
}

/** Compare an estimate against an optional cap. Pure helper — no copywriting here. */
export function statusForBudget(estimate: number, cap: number | null): BudgetStatus {
  if (cap === null || cap <= 0) {
    return { estimate, cap, ratio: null, state: 'no-cap' };
  }
  const ratio = estimate / cap;
  let state: BudgetStatus['state'] = 'under';
  if (ratio > 1) state = 'over';
  else if (ratio >= 0.85) state = 'near';
  return { estimate, cap, ratio, state };
}
