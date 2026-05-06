/**
 * Salt sanity check. 1.8–2.2% of flour weight is the band almost every
 * good bread sits in: less and the loaf tastes flat and over-ferments,
 * more and the yeast slows hard.
 *
 * Brioche and sweet doughs run lower (1.5%); rustic naturally-leavened
 * loaves sometimes go up to 2.4%. Outside 1.0–2.8% something is wrong.
 */

import type { Severity } from './hydration-check.ts';

export interface SaltCheck {
  severity: Severity;
  message: string;
}

export function checkSalt(saltPct: number): SaltCheck {
  if (saltPct < 1.0) {
    return {
      severity: 'error',
      message: `${saltPct}% salt — the loaf will taste washed-out and ferment will run away. Most bread sits at 1.8–2.2%.`,
    };
  }
  if (saltPct > 2.8) {
    return {
      severity: 'error',
      message: `${saltPct}% salt — expect a sluggish ferment and a sharp finish. 1.8–2.2% is the safe band.`,
    };
  }
  if (saltPct < 1.5) {
    return {
      severity: 'warn',
      message: `${saltPct}% is on the low side — fine for enriched doughs, flat for lean breads.`,
    };
  }
  if (saltPct > 2.4) {
    return {
      severity: 'warn',
      message: `${saltPct}% is on the high side — deliberate? Otherwise pull back to 2.0%.`,
    };
  }
  return {
    severity: 'ok',
    message: `${saltPct}% sits in the 1.8–2.2% sweet spot.`,
  };
}
