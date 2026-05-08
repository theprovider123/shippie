import { describe, expect, test } from 'bun:test';
import { flattenByAisle, groupByAisleForStore, resolveAisle } from './aisle-sort.ts';
import { DEFAULT_STORE_PROFILES } from './store-profiles.ts';
import type { ListItem } from './types.ts';

const tesco = DEFAULT_STORE_PROFILES.find((p) => p.id === 'tesco')!;
const aldi = DEFAULT_STORE_PROFILES.find((p) => p.id === 'aldi')!;

function mk(name: string, extra?: Partial<ListItem>): ListItem {
  return {
    id: `i_${name}`,
    name,
    checked: false,
    source: 'manual',
    addedAt: '2026-04-30T10:00:00.000Z',
    ...extra,
  };
}

const map = {
  apples: 'produce',
  milk: 'dairy',
  beans: 'pantry',
} as const;

describe('aisle-sort', () => {
  test('resolveAisle prefers user override over classifier', () => {
    const item = mk('apples', { aisleOverride: 'snacks' });
    expect(resolveAisle(item, map)).toBe('snacks');
  });

  test('groupByAisleForStore orders groups by Tesco walk-path', () => {
    const items = [mk('beans'), mk('milk'), mk('apples')];
    const groups = groupByAisleForStore(items, map, tesco);
    expect(groups.map((g) => g.aisle)).toEqual(['produce', 'dairy', 'pantry']);
  });

  test('groupByAisleForStore produces a different order at Aldi', () => {
    const items = [mk('beans'), mk('milk'), mk('apples')];
    const groups = groupByAisleForStore(items, map, aldi);
    // Aldi puts pantry first, then produce (per default profile).
    expect(groups[0]?.aisle).toBe('pantry');
  });

  test('checked items drop to the bottom of their aisle group', () => {
    const items = [
      mk('apples-1', { addedAt: '2026-04-30T11:00:00.000Z' }),
      mk('apples-2', { checked: true, addedAt: '2026-04-30T12:00:00.000Z' }),
      mk('apples-3', { addedAt: '2026-04-30T10:00:00.000Z' }),
    ];
    const classifier = { 'apples-1': 'produce', 'apples-2': 'produce', 'apples-3': 'produce' } as const;
    const [group] = groupByAisleForStore(items, classifier, tesco);
    expect(group?.items.map((i) => i.name)).toEqual(['apples-1', 'apples-3', 'apples-2']);
  });

  test('flattenByAisle returns items in walk-path order', () => {
    const items = [mk('beans'), mk('apples'), mk('milk')];
    const flat = flattenByAisle(items, map, tesco);
    expect(flat.map((i) => i.name)).toEqual(['apples', 'milk', 'beans']);
  });
});
