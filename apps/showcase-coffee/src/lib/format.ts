// Small display formatters shared across screens.

import type { Bag } from '../types.ts';
import { freshness, type Freshness } from './freshness.ts';

/** "Ethiopia · Yirgacheffe · Natural" from whatever origin fields are set. */
export function originLine(bag: Pick<Bag, 'originCountry' | 'originRegion' | 'process'>): string {
  return [bag.originCountry, bag.originRegion, bag.process].filter(Boolean).join(' · ');
}

export interface BagFreshness extends Freshness {
  /** Display label, accounting for finished bags. */
  displayLabel: string;
  /** Marker day clamped for the bar (finished bags sit at the far end). */
  barDay: number;
}

/** Freshness for a bag, folding in its status. */
export function bagFreshness(bag: Bag, now?: Date): BagFreshness {
  const f = freshness({ roastDate: bag.roastDate, roastLevel: bag.roastLevel, now });
  if (bag.status === 'finished') {
    return { ...f, displayLabel: 'Finished', barDay: f.peakWindowEnd + 7 };
  }
  return { ...f, displayLabel: f.label, barDay: f.day };
}
