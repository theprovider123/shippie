/**
 * Quick-tap chips — the 8–12 most-frequently-added staples surfaced
 * as one-tap pills above the list. Tap → adds the item.
 *
 * Source data: every manual / quick-tap / voice / photo add bumps a
 * tally. We don't count meal-plan or mesh adds (those are noise for
 * "what does this user habitually buy?"). Recurring auto-adds also
 * skip the tally — they're generated, not chosen.
 */
import type { QuickTapTally, ItemSource } from './types.ts';

const MAX_CHIPS = 12;
const TALLY_CAP = 50;

/**
 * Source kinds that *should* count toward the tally — these are
 * "user picked this item" signals. Mesh/meal-plan/recurring/pantry-low
 * are all generated/synced, not chosen, so they don't tell us anything
 * about this user's habits.
 */
const COUNTING_SOURCES: ReadonlySet<ItemSource> = new Set<ItemSource>([
  'manual',
  'photo',
  'voice',
]);

/** Default seed list — gives the chips something useful before the user has any history. */
export const DEFAULT_QUICK_TAP_SEEDS: readonly string[] = [
  'milk',
  'bread',
  'eggs',
  'butter',
  'bananas',
  'apples',
  'pasta',
  'rice',
];

/**
 * Bump the tally for a given item-add. Pure; returns a new array.
 * Caps total tracked items at TALLY_CAP — the bottom of the list (by
 * count, then by lastAddedAt) gets evicted to prevent unbounded growth.
 */
export function bumpTally(
  tallies: readonly QuickTapTally[],
  name: string,
  source: ItemSource,
  now: number,
): readonly QuickTapTally[] {
  if (!COUNTING_SOURCES.has(source)) return tallies;
  const trimmed = name.trim();
  if (!trimmed) return tallies;
  const key = trimmed.toLowerCase();
  const existing = tallies.find((t) => t.name.toLowerCase() === key);
  const nowIso = new Date(now).toISOString();
  if (existing) {
    return tallies.map((t) =>
      t.name.toLowerCase() === key
        ? { ...t, count: t.count + 1, lastAddedAt: nowIso }
        : t,
    );
  }
  const next: QuickTapTally = { name: trimmed, count: 1, lastAddedAt: nowIso };
  const merged = [...tallies, next];
  if (merged.length <= TALLY_CAP) return merged;
  // Evict: lowest count first, oldest lastAddedAt as tiebreaker.
  merged.sort((a, b) => {
    if (a.count !== b.count) return a.count - b.count;
    return (a.lastAddedAt || '').localeCompare(b.lastAddedAt || '');
  });
  return merged.slice(merged.length - TALLY_CAP);
}

/**
 * Pick chips to surface. If the user has at least one tally, use
 * theirs (sorted by count, then recency). Otherwise fall back to
 * DEFAULT_QUICK_TAP_SEEDS. Excludes any names already on the live list
 * (unchecked) — there's no point offering "milk" as a chip when
 * milk is already in the list.
 */
export function pickQuickTapChips(input: {
  tallies: readonly QuickTapTally[];
  liveItemNames: readonly string[];
}): readonly string[] {
  const { tallies, liveItemNames } = input;
  const liveSet = new Set(liveItemNames.map((n) => n.toLowerCase()));
  const filterOut = (name: string) => liveSet.has(name.toLowerCase());

  if (tallies.length === 0) {
    return DEFAULT_QUICK_TAP_SEEDS.filter((n) => !filterOut(n)).slice(0, MAX_CHIPS);
  }
  const sorted = [...tallies].sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return (b.lastAddedAt || '').localeCompare(a.lastAddedAt || '');
  });
  const top = sorted.filter((t) => !filterOut(t.name)).slice(0, MAX_CHIPS).map((t) => t.name);
  if (top.length >= 4) return top;
  // Pad with seeds if the user's tally is sparse.
  const padded = [...top];
  for (const seed of DEFAULT_QUICK_TAP_SEEDS) {
    if (padded.length >= MAX_CHIPS) break;
    if (!filterOut(seed) && !padded.some((n) => n.toLowerCase() === seed.toLowerCase())) {
      padded.push(seed);
    }
  }
  return padded;
}
