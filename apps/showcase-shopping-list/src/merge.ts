/**
 * Merge incoming planned items with the existing list.
 *
 * - Items already on the list (case-insensitive name match) keep
 *   their `checked` state, assignee, qty, note, prices, and any
 *   user-set aisleOverride. We never clobber the user's hand-edits.
 * - Items removed from the meal plan stay in the list (user may have
 *   edited them by hand). Future evolution: garbage-collect after N
 *   days based on `addedAt`.
 * - Source metadata is preserved so the UI can show the origin.
 *
 * NOTE: this module re-exports `ListItem` from `lib/types.ts` to keep
 * the existing import path (`./merge.ts`) stable for callers and
 * tests, while giving the polish layer a richer type.
 */
import type { ListItem } from './lib/types.ts';
export type { ListItem } from './lib/types.ts';

export interface IncomingPlannedItem {
  name: string;
}

export function mergeIncoming(
  existing: readonly ListItem[],
  incoming: readonly IncomingPlannedItem[],
  now: number,
): ListItem[] {
  const byName = new Map(existing.map((it) => [it.name.toLowerCase(), it]));
  const out: ListItem[] = [...existing];
  for (const inc of incoming) {
    const key = inc.name.trim().toLowerCase();
    if (!key || byName.has(key)) continue;
    const item: ListItem = {
      id: `i_${now}_${out.length}`,
      name: inc.name.trim(),
      checked: false,
      source: 'meal-plan',
      addedAt: new Date(now).toISOString(),
    };
    out.unshift(item);
    byName.set(key, item);
  }
  return out;
}

/**
 * Coalesce two snapshots from different mesh peers. Used when
 * applying a `snapshot` event from a peer who joined mid-shop. The
 * rule: for each id, keep the most recently mutated version. We
 * approximate "recent" by `addedAt` — good enough since most fields
 * change together when the user edits an item, and we always rebump
 * `addedAt` on edit.
 *
 * Items that exist locally but not in the snapshot are preserved
 * (the snapshotting peer might be on an older list). Items that
 * exist in the snapshot but not locally are added. Items in both
 * resolve via addedAt.
 */
export function coalesceSnapshot(
  local: readonly ListItem[],
  incoming: readonly ListItem[],
): ListItem[] {
  const byId = new Map<string, ListItem>();
  for (const it of local) byId.set(it.id, it);
  for (const it of incoming) {
    const cur = byId.get(it.id);
    if (!cur) {
      byId.set(it.id, it);
      continue;
    }
    const localTs = Date.parse(cur.addedAt || '') || 0;
    const incomingTs = Date.parse(it.addedAt || '') || 0;
    byId.set(it.id, incomingTs > localTs ? it : cur);
  }
  return [...byId.values()];
}
