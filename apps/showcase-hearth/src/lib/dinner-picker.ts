/**
 * Dinner picker — friction-removing, not optimising.
 *
 * The voice doc is explicit: this isn't a meal-plan AI. The point is
 * to skip the "I don't mind / do you?" loop. We pick from a small set
 * of plausible suggestions, biased by what's in the fridge, biased
 * away from anything we've eaten in the last few days.
 *
 * No calorie scores. No budget impact. No "well-balanced" filter.
 */

import type { DinnerEntry, FridgeItem } from '../sync/hearth-doc.ts';

/**
 * A dinner candidate. `keywords` are simple words we look for in fridge
 * labels — if the fridge has anything matching, the candidate gets a
 * "we have what we need" boost.
 */
export interface DinnerCandidate {
  label: string;
  keywords: string[];
}

/**
 * The default dinner pool. Domestic, low-stakes, mostly-pantry meals
 * — the kind a housemate would suggest at 6pm on a Tuesday. Order
 * doesn't matter; the picker shuffles + filters.
 */
export const DEFAULT_CANDIDATES: ReadonlyArray<DinnerCandidate> = [
  { label: 'Pasta and a green thing', keywords: ['pasta', 'spaghetti', 'penne', 'leek', 'spinach', 'broccoli', 'kale'] },
  { label: 'Stir-fry with whatever\'s in the fridge', keywords: ['rice', 'pepper', 'onion', 'mushroom', 'carrot', 'tofu', 'chicken'] },
  { label: 'Cheese on toast and a bowl of soup', keywords: ['bread', 'cheese', 'soup', 'tomato'] },
  { label: 'Eggs on toast', keywords: ['eggs', 'bread'] },
  { label: 'A big salad and some bread', keywords: ['lettuce', 'tomato', 'cucumber', 'bread', 'feta', 'olives'] },
  { label: 'Beans on toast', keywords: ['beans', 'bread'] },
  { label: 'Curry from a jar with rice', keywords: ['rice', 'curry', 'chicken', 'chickpeas'] },
  { label: 'Pasta with butter and parmesan', keywords: ['pasta', 'butter', 'parmesan', 'cheese'] },
  { label: 'Frozen pizza, salad on the side', keywords: ['pizza', 'lettuce', 'tomato'] },
  { label: 'Jacket potato with whatever', keywords: ['potato', 'potatoes', 'beans', 'cheese', 'butter'] },
  { label: 'Omelette and toast', keywords: ['eggs', 'bread', 'cheese', 'mushroom'] },
  { label: 'Noodles and a fried egg', keywords: ['noodles', 'eggs'] },
  { label: 'Soup from the cupboard', keywords: ['soup', 'bread'] },
  { label: 'Baked beans with a fried egg on top', keywords: ['beans', 'eggs', 'bread'] },
];

export interface PickInput {
  /** Current fridge contents. */
  fridge: ReadonlyArray<FridgeItem>;
  /** Recent dinners — used to avoid repeating. */
  history: ReadonlyArray<DinnerEntry>;
  /** How many days back to consider "recent". Default 3. */
  recentDays?: number;
  /** Now (test seam). */
  now?: number;
  /** Pluggable RNG (test seam). Defaults to Math.random. */
  random?: () => number;
  /** Override candidate pool (test seam / future per-house customisation). */
  candidates?: ReadonlyArray<DinnerCandidate>;
}

export interface DinnerSuggestion {
  label: string;
  /** Words from the candidate's keyword list that we found in the fridge. */
  matched: string[];
  /** Roughly how confident we are. "We've got what we need" vs "could work". */
  hint: 'we_have_it' | 'might_work';
}

/**
 * Pick a dinner suggestion. Pure.
 *
 * Algorithm:
 *  1. Drop candidates whose label was eaten in the last `recentDays`.
 *  2. Score each by # matched keywords vs. fridge.
 *  3. Pick the highest-scored; tie-break randomly.
 *  4. Return null if everything is filtered out.
 */
export function pickDinner(input: PickInput): DinnerSuggestion | null {
  const recentDays = input.recentDays ?? 3;
  const now = input.now ?? Date.now();
  const random = input.random ?? Math.random;
  const candidates = input.candidates ?? DEFAULT_CANDIDATES;

  const cutoff = now - recentDays * 86_400_000;
  const recentLabels = new Set<string>();
  for (const e of input.history) {
    if (e.eaten_at >= cutoff) recentLabels.add(e.label.toLowerCase().trim());
  }

  const fridgeWords = new Set<string>();
  for (const item of input.fridge) {
    const tokens = item.label.toLowerCase().split(/\s+|[,/]/);
    for (const t of tokens) if (t) fridgeWords.add(t.replace(/[^a-z]/g, ''));
  }

  interface Scored {
    cand: DinnerCandidate;
    score: number;
    matched: string[];
  }
  const scored: Scored[] = [];
  for (const c of candidates) {
    if (recentLabels.has(c.label.toLowerCase().trim())) continue;
    const matched: string[] = [];
    for (const kw of c.keywords) {
      if (fridgeWords.has(kw)) matched.push(kw);
    }
    scored.push({ cand: c, score: matched.length, matched });
  }
  if (scored.length === 0) return null;

  // Pick the max-score group; tie-break with the supplied RNG.
  let max = -1;
  for (const s of scored) if (s.score > max) max = s.score;
  const top = scored.filter((s) => s.score === max);
  const pick = top[Math.floor(random() * top.length)];
  if (!pick) return null;
  return {
    label: pick.cand.label,
    matched: pick.matched,
    hint: pick.score > 0 ? 'we_have_it' : 'might_work',
  };
}
