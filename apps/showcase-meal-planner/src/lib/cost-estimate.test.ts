import { describe, expect, test } from 'bun:test';
import { estimateWeekCost, statusForBudget } from './cost-estimate.ts';
import type { Plan, PlanCell } from './types.ts';

function cell(overrides: Partial<PlanCell> = {}): PlanCell {
  return {
    recipeName: 'Test',
    ingredients: [],
    servings: 1,
    baseServings: 1,
    ...overrides,
  };
}

describe('estimateWeekCost', () => {
  test('uses tagged costPerServing when present', () => {
    const plan: Plan = {
      Mon: { Dinner: cell({ costPerServing: 6 }) },
      Tue: { Dinner: cell({ costPerServing: 8, servings: 2, baseServings: 2 }) },
    };
    const out = estimateWeekCost(plan, 4.5);
    expect(out.weekTotal).toBe(6 + 16);
    expect(out.taggedSlots).toBe(2);
    expect(out.estimatedSlots).toBe(0);
  });

  test('falls back to per-serving default when untagged', () => {
    const plan: Plan = {
      Mon: { Dinner: cell({ servings: 2, baseServings: 2 }) },
    };
    const out = estimateWeekCost(plan, 5);
    expect(out.weekTotal).toBe(10);
    expect(out.estimatedSlots).toBe(1);
    expect(out.taggedSlots).toBe(0);
  });

  test('mixes tagged and estimated slots honestly', () => {
    const plan: Plan = {
      Mon: { Dinner: cell({ costPerServing: 7 }) },
      Tue: { Dinner: cell() },
    };
    const out = estimateWeekCost(plan, 5);
    expect(out.weekTotal).toBe(12);
    expect(out.taggedSlots).toBe(1);
    expect(out.estimatedSlots).toBe(1);
    expect(out.filledSlots).toBe(2);
  });

  test('returns zero on empty plan', () => {
    expect(estimateWeekCost({}, 5)).toEqual({
      weekTotal: 0,
      taggedSlots: 0,
      estimatedSlots: 0,
      filledSlots: 0,
    });
  });
});

describe('statusForBudget', () => {
  test('no-cap when cap is null', () => {
    expect(statusForBudget(50, null).state).toBe('no-cap');
  });

  test('under when below 85%', () => {
    expect(statusForBudget(40, 100).state).toBe('under');
  });

  test('near when between 85% and 100%', () => {
    expect(statusForBudget(90, 100).state).toBe('near');
  });

  test('over when ratio exceeds 1', () => {
    expect(statusForBudget(120, 100).state).toBe('over');
  });
});
