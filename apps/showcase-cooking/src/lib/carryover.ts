/**
 * Carryover cooking — after you pull a roast/steak from the heat, the
 * surface keeps conducting heat inward. Internal temp rises a known
 * amount during the rest. Pulling at target = overshoot.
 *
 * Empirical rules (Modernist Cuisine + ChefSteps):
 *   - Steak / chop (thin):           +1 to 3°C
 *   - Roast (medium, ~2 kg):         +3 to 5°C
 *   - Whole bird / large roast:      +5 to 8°C
 *   - Sous vide (already at temp):   ~0°C
 *   - Smoked low-and-slow:           ~0–2°C (already plateaued)
 */

import type { Method } from '../data.ts';

export interface CarryoverEstimate {
  /** °C the centre will rise during rest. */
  rise_c: number;
  /** Suggested pull temp = target − rise. */
  pull_at_c: number;
  /** Recommended rest minutes for this size + method. */
  rest_minutes: number;
  /** One-line plain-language advice. */
  advice: string;
}

/**
 * Estimate carryover for a given method + size.
 *
 * @param method The cooking method.
 * @param target_c The desired final centre temp.
 * @param weight_kg Optional weight — bigger = more thermal mass = more rise.
 */
export function estimateCarryover(
  method: Method,
  target_c: number,
  weight_kg: number | null,
): CarryoverEstimate {
  if (method === 'sous-vide') {
    return {
      rise_c: 0,
      pull_at_c: target_c,
      rest_minutes: 0,
      advice: 'Sous vide is at-temp; no carryover. Sear straight from the bag, then plate.',
    };
  }
  if (method === 'smoke') {
    // Stall-and-low cooks have already climbed slowly; carryover is small.
    return {
      rise_c: 2,
      pull_at_c: Math.round(target_c - 2),
      rest_minutes: weight_kg && weight_kg >= 4 ? 60 : 30,
      advice:
        'Low-and-slow has minimal carryover, but rest is essential — the muscle relaxes and reabsorbs juices for 30–60 min in a cooler or vented foil.',
    };
  }
  if (method === 'pan' || method === 'grill') {
    // Thin cuts. 2°C bump on a steak.
    const rise = 2;
    return {
      rise_c: rise,
      pull_at_c: target_c - rise,
      rest_minutes: 4,
      advice:
        `Rest 4 minutes loose-tented. Thin cuts climb ${rise}°C off-heat. Cutting early dumps the juice on the board.`,
    };
  }
  // roast — biggest rise, scales with mass.
  const w = weight_kg ?? 1.5;
  let rise: number;
  let rest: number;
  if (w >= 4) {
    rise = 7; // whole turkey, large bone-in roast
    rest = 30;
  } else if (w >= 1.5) {
    rise = 5; // mid roast / whole chicken
    rest = 15;
  } else {
    rise = 3;
    rest = 10;
  }
  return {
    rise_c: rise,
    pull_at_c: target_c - rise,
    rest_minutes: rest,
    advice:
      `Pull ${rise}°C below target — centre will climb to ${target_c}°C during a ${rest}-minute rest. Tent loosely; do not seal in foil or skin softens.`,
  };
}
