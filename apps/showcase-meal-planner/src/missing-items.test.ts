import { describe, expect, test } from 'bun:test';
import { computeShoppingList, computeShoppingListFromPlan } from './missing-items.ts';
import type { Plan, PlanCell } from './lib/types.ts';

function cell(overrides: Partial<PlanCell> = {}): PlanCell {
  return {
    recipeName: 'Test',
    ingredients: [],
    servings: 1,
    baseServings: 1,
    ...overrides,
  };
}

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

  test('aggregates quantities when units agree', () => {
    const list = computeShoppingList(
      [
        { name: 'pasta', quantity: 200, unit: 'g' },
        { name: 'pasta', quantity: 100, unit: 'g' },
      ],
      [],
    );
    expect(list[0]).toEqual({ name: 'pasta', count: 2, quantity: 300, unit: 'g' });
  });

  test('drops aggregated quantity when units disagree', () => {
    const list = computeShoppingList(
      [
        { name: 'milk', quantity: 200, unit: 'ml' },
        { name: 'milk', quantity: 1, unit: 'cup' },
      ],
      [],
    );
    expect(list[0]?.quantity).toBeUndefined();
    expect(list[0]?.count).toBe(2);
  });
});

describe('computeShoppingListFromPlan', () => {
  test('scales ingredient quantities by servings/baseServings', () => {
    const plan: Plan = {
      Mon: {
        Dinner: cell({
          ingredients: [{ name: 'pasta', quantity: 200, unit: 'g' }],
          baseServings: 2,
          servings: 4,
        }),
      },
    };
    const list = computeShoppingListFromPlan(plan, []);
    expect(list[0]?.quantity).toBe(400);
  });

  test('subtracts pantry items from the plan-level shopping list', () => {
    const plan: Plan = {
      Mon: { Dinner: cell({ ingredients: [{ name: 'pasta' }, { name: 'tomato' }] }) },
    };
    const list = computeShoppingListFromPlan(plan, [{ name: 'tomato' }]);
    expect(list.map((i) => i.name)).toEqual(['pasta']);
  });

  test('returns empty for empty plan', () => {
    expect(computeShoppingListFromPlan({}, [])).toEqual([]);
  });
});
