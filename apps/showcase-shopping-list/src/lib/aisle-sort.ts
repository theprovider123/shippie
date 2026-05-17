/**
 * Aisle sorting — re-orders the user's items so they appear in the
 * order the shopper will physically walk past them at the active
 * store. The classifier (AisleClassifier) gives us name → aisle. The
 * store profile gives us aisle → walk position. The combination is a
 * stable sort that respects checked-state so completed items can drop
 * to the bottom without losing their group.
 *
 * The sort is also the primitive we use for the "I'm at Tesco" toggle
 * in the List page — change the active profile, the list resorts.
 */
import type { Aisle } from '../AisleClassifier.tsx';
import type { ListItem, StoreProfile } from './types.ts';
import { aisleIndex } from './store-profiles.ts';

/** Resolve which aisle an item belongs to — override wins over classifier. */
export function resolveAisle(
  item: ListItem,
  classifierMap: Readonly<Record<string, Aisle>>,
): Aisle {
  if (item.aisleOverride) return item.aisleOverride;
  return classifierMap[item.name] ?? 'unsorted';
}

export interface AisleGroup {
  aisle: Aisle;
  items: ListItem[];
}

/**
 * Sort items into the store's aisle path. Returns ordered groups,
 * skipping aisles with no items. Within each aisle we keep items
 * sorted by `addedAt` (newest first) so the user always sees their
 * latest-typed items where they expect.
 *
 * Checked items are bucketed last *within their aisle* — we don't
 * yank them into a separate "done" group because shoppers tend to
 * cross things off as they walk, and a parallel group disrupts the
 * sense of place.
 */
export function groupByAisleForStore(
  items: readonly ListItem[],
  classifierMap: Readonly<Record<string, Aisle>>,
  profile: StoreProfile,
): AisleGroup[] {
  const buckets = new Map<Aisle, ListItem[]>();
  for (const item of items) {
    const aisle = resolveAisle(item, classifierMap);
    const list = buckets.get(aisle) ?? [];
    list.push(item);
    buckets.set(aisle, list);
  }

  // Sort within each bucket: unchecked first, then by addedAt desc.
  for (const [aisle, list] of buckets) {
    list.sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      return (b.addedAt || '').localeCompare(a.addedAt || '');
    });
    buckets.set(aisle, list);
  }

  // Order buckets by the profile's aisle path.
  const ordered = [...buckets.entries()].sort(
    ([a], [b]) => aisleIndex(profile, a) - aisleIndex(profile, b),
  );

  return ordered
    .map(([aisle, list]) => ({ aisle, items: list }))
    .filter((g) => g.items.length > 0);
}

/**
 * Flat sort variant — returns items reordered in walk-path order
 * without grouping. Useful for compact list mode.
 */
export function flattenByAisle(
  items: readonly ListItem[],
  classifierMap: Readonly<Record<string, Aisle>>,
  profile: StoreProfile,
): ListItem[] {
  return groupByAisleForStore(items, classifierMap, profile).flatMap(
    (g) => g.items,
  );
}
