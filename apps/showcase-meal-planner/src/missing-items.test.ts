import { describe, expect, test } from 'bun:test';
import { computeShoppingList } from './missing-items.ts';

describe('computeShoppingList', () => {
  test('returns empty when no ingredients are planned', () => {
    expect(computeShoppingList([], [{ name: 'pasta' }])).toEqual([]);
  });

  test('lists missing ingredients regardless of pantry', () => {
    const list = computeShoppingList(
      [{ name: 'pasta' }, { name: 'tomato' }, { name: 'basil' }],
      [{ name: 'basil' }],
    );
    expect(list.map((i) => i.name)).toEqual(['pasta', 'tomato']);
  });

  test('counts duplicate ingredients across recipes', () => {
    const list = computeShoppingList(
      [{ name: 'tomato' }, { name: 'tomato' }, { name: 'tomato' }, { name: 'pasta' }],
      [],
    );
    expect(list[0]).toEqual({ name: 'tomato', count: 3 });
    expect(list[1]).toEqual({ name: 'pasta', count: 1 });
  });

  test('is case-insensitive on item names', () => {
    expect(
      computeShoppingList([{ name: 'Pasta' }], [{ name: 'pasta' }]),
    ).toEqual([]);
  });

  test('drops empty/whitespace ingredient names', () => {
    expect(computeShoppingList([{ name: '   ' }, { name: 'pasta' }], [])).toEqual([
      { name: 'pasta', count: 1 },
    ]);
  });
});
