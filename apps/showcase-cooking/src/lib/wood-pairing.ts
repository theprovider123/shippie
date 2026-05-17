/**
 * Wood-pairing recommendations for smoking. The data lives in
 * `data.ts::WOOD_PAIRINGS`; this thin module exposes a typed lookup
 * with a fallback and a "is this a good pairing?" check used by the
 * Smoking guide UI.
 */

import {
  WOOD_PAIRINGS,
  type Protein,
  type WoodPairing,
} from '../data.ts';

export type PairingTier = 'best' | 'good' | 'avoid' | 'unknown';

export function pairingFor(protein: Protein): WoodPairing {
  const found = WOOD_PAIRINGS.find((w) => w.protein === protein);
  if (found) return found;
  // Defensive fallback — should never trigger given the closed Protein union.
  return WOOD_PAIRINGS[0]!;
}

/** Classify a chosen wood against the recommended pairing tiers. */
export function classifyWood(protein: Protein, wood: string): PairingTier {
  const pair = pairingFor(protein);
  const w = wood.trim().toLowerCase();
  if (!w) return 'unknown';
  const has = (list: ReadonlyArray<string>) =>
    list.some((entry) => entry.toLowerCase().includes(w) || w.includes(entry.toLowerCase().split(' ')[0]!));
  if (has(pair.best)) return 'best';
  if (has(pair.good)) return 'good';
  if (has(pair.avoid)) return 'avoid';
  return 'unknown';
}
