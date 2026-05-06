/**
 * Hydration sanity check. Different flours hold different amounts of
 * water before the dough turns soupy or, worse, clenches into a brick.
 *
 * Numbers below come from the rough bands most home bakers respect:
 *   - bread flour (~12% protein): 65–80% works; >85% needs an
 *     experienced hand.
 *   - all-purpose (~10% protein): tops out around 75% before the
 *     dough loses its window.
 *   - "00" pizza flour: 55–70% — Naples is 58–62%.
 *   - whole-wheat / rye: thirsty; dilute total hydration upward, but
 *     watch for the dough turning to paste with too much rye.
 *
 * The check returns severity and a baker-readable note. UI decides
 * presentation.
 */

import type { FlourKind, FlourPart } from './percentages.ts';

export type Severity = 'ok' | 'warn' | 'error';

export interface HydrationCheck {
  severity: Severity;
  message: string;
}

interface Band {
  min: number;
  max: number;
  /** Below this, dough is stiff but functional. Above max → soup. */
  hardMin?: number;
  hardMax?: number;
}

/** Per-flour comfortable hydration bands. */
const BANDS: Record<FlourKind, Band> = {
  bread: { min: 65, max: 80, hardMin: 55, hardMax: 88 },
  'all-purpose': { min: 60, max: 72, hardMin: 55, hardMax: 78 },
  'whole-wheat': { min: 70, max: 85, hardMin: 60, hardMax: 95 },
  rye: { min: 75, max: 90, hardMin: 65, hardMax: 100 },
  spelt: { min: 65, max: 78, hardMin: 55, hardMax: 85 },
  durum: { min: 60, max: 70, hardMin: 55, hardMax: 78 },
  '00': { min: 55, max: 70, hardMin: 50, hardMax: 75 },
};

/**
 * Weighted-average band across the flour mix, then compare against
 * the recipe's hydration.
 */
export function checkHydration(
  flours: ReadonlyArray<FlourPart>,
  hydration: number,
): HydrationCheck {
  if (flours.length === 0) {
    return { severity: 'error', message: 'Add at least one flour to check hydration.' };
  }
  let minSum = 0;
  let maxSum = 0;
  let hardMinSum = 0;
  let hardMaxSum = 0;
  let totalPct = 0;
  for (const f of flours) {
    const b = BANDS[f.kind];
    minSum += b.min * f.pct;
    maxSum += b.max * f.pct;
    hardMinSum += (b.hardMin ?? b.min) * f.pct;
    hardMaxSum += (b.hardMax ?? b.max) * f.pct;
    totalPct += f.pct;
  }
  if (totalPct === 0) {
    return { severity: 'error', message: 'Flour mix sums to 0%.' };
  }
  const min = minSum / totalPct;
  const max = maxSum / totalPct;
  const hardMin = hardMinSum / totalPct;
  const hardMax = hardMaxSum / totalPct;

  if (hydration < hardMin) {
    return {
      severity: 'error',
      message: `${hydration}% is parched — for this flour mix, ${Math.round(min)}–${Math.round(max)}% is the comfortable band.`,
    };
  }
  if (hydration > hardMax) {
    const tip = topThirsty(flours)
      ? 'wetter is fine for whole-grain or rye, but expect a slack dough.'
      : 'consider switching to a higher-protein flour or pulling back to bread-flour territory.';
    return {
      severity: 'error',
      message: `${hydration}% is well past the safe band — ${tip}`,
    };
  }
  if (hydration < min) {
    return {
      severity: 'warn',
      message: `${hydration}% will give you a tight crumb. Bump to ${Math.round(min)}%+ for an open structure.`,
    };
  }
  if (hydration > max) {
    return {
      severity: 'warn',
      message: `${hydration}% is on the wet side — workable but slack. Comfortable band is ${Math.round(min)}–${Math.round(max)}%.`,
    };
  }
  return {
    severity: 'ok',
    message: `${hydration}% sits inside the ${Math.round(min)}–${Math.round(max)}% comfort band.`,
  };
}

/** True when the mix is dominated by thirsty flours (rye + WW > 50%). */
function topThirsty(flours: ReadonlyArray<FlourPart>): boolean {
  const thirsty = flours
    .filter((f) => f.kind === 'rye' || f.kind === 'whole-wheat')
    .reduce((acc, f) => acc + f.pct, 0);
  return thirsty > 50;
}
