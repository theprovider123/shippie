/**
 * Merge incoming planned items with the existing list.
 *
 * - Items already on the list keep their `checked` state.
 * - Items removed from the meal plan stay in the list (user may have
 *   edited them by hand). Future evolution: garbage-collect after N
 *   days based on `addedAt`.
 * - Source metadata is preserved so the UI can show the origin.
 */

export interface ListItem {
  id: string;
  name: string;
  checked: boolean;
  source: 'meal-plan' | 'manual' | 'mesh' | 'pantry-low';
  addedAt: string;
}

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
