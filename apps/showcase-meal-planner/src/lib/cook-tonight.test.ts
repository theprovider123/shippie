import { describe, expect, test } from 'bun:test';
import { cookTonightFromPlan, gatherCandidates, rankCookTonight } from './cook-tonight.ts';
import type { CookedMealRow, Plan, PlanCell } from './types.ts';

function cell(overrides: Partial<PlanCell> = {}): PlanCell {
  return {
    recipeName: 'Pasta',
    ingredients: [{ name: 'pasta' }, { name: 'tomato' }, { name: 'basil' }],
    servings: 2,
    baseServings: 2,
    ...overrides,
  };
}

describe('gatherCandidates', () => {
  test('dedupes planned + cooked by name (planned wins)', () => {
    const plan: Plan = { Mon: { Dinner: cell({ recipeName: 'Pasta' }) } };
    const cooked: CookedMealRow[] = [
      { title: 'pasta', cookedAt: '2026-01-01T00:00:00Z', ingredients: ['old'] },
    ];
    const out = gatherCandidates(plan, cooked);
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe('planned');
  });

  test('returns cooked-only entries when not planned', () => {
    const cooked: CookedMealRow[] = [
      { title: 'Soup', cookedAt: '2026-01-01T00:00:00Z', ingredients: ['stock', 'carrot'] },
    ];
    const out = gatherCandidates({}, cooked);
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe('cooked');
    expect(out[0]?.ingredients.map((i) => i.name)).toEqual(['stock', 'carrot']);
  });
});

describe('rankCookTonight', () => {
  test('sorts by fewest missing first', () => {
    const out = rankCookTonight(
      [
        {
          recipeName: 'Pasta',
          ingredients: [{ name: 'pasta' }, { name: 'tomato' }, { name: 'basil' }],
          source: 'planned',
        },
        {
          recipeName: 'Soup',
          ingredients: [{ name: 'stock' }],
          source: 'cooked',
        },
      ],
      [{ name: 'stock' }],
    );
    expect(out[0]?.recipeName).toBe('Soup');
    expect(out[0]?.missing).toHaveLength(0);
    expect(out[1]?.recipeName).toBe('Pasta');
  });

  test('reports both have and missing transparently', () => {
    const out = rankCookTonight(
      [
        {
          recipeName: 'Pasta',
          ingredients: [{ name: 'pasta' }, { name: 'tomato' }, { name: 'basil' }],
          source: 'planned',
        },
      ],
      [{ name: 'pasta' }, { name: 'basil' }],
    );
    expect(out[0]?.have).toEqual(['pasta', 'basil']);
    expect(out[0]?.missing).toEqual(['tomato']);
  });

  test('handles empty pantry by listing everything as missing', () => {
    const out = rankCookTonight(
      [
        {
          recipeName: 'Pasta',
          ingredients: [{ name: 'pasta' }, { name: 'tomato' }],
          source: 'cooked',
        },
      ],
      [],
    );
    expect(out[0]?.missing).toHaveLength(2);
    expect(out[0]?.have).toHaveLength(0);
  });
});

describe('cookTonightFromPlan', () => {
  test('integrates plan + cooked + pantry end to end', () => {
    const plan: Plan = { Mon: { Dinner: cell({ recipeName: 'Pasta' }) } };
    const cooked: CookedMealRow[] = [
      { title: 'Soup', cookedAt: '2026-01-01T00:00:00Z', ingredients: ['stock'] },
    ];
    const out = cookTonightFromPlan(plan, cooked, [{ name: 'stock' }, { name: 'pasta' }]);
    // Soup ranks first (0 missing), Pasta has 2 missing.
    expect(out[0]?.recipeName).toBe('Soup');
    expect(out[1]?.missing).toHaveLength(2);
  });
});
