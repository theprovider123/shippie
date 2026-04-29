import { describe, expect, test } from 'bun:test';
import { mealPlanningStrategy } from './meal-planning.ts';
import type { AgentContext } from '../types.ts';

const NOW = new Date('2026-04-28T12:00:00Z').getTime();
const ONE_HOUR = 60 * 60 * 1000;

const recipeApp = {
  slug: 'recipe',
  name: 'Recipe Saver',
  category: 'cooking',
  provides: ['shopping-list'],
} as const;
const plannerApp = {
  slug: 'meal-planner',
  name: 'Meal Planner',
  consumes: ['shopping-list'],
} as const;

function ctx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    now: NOW,
    apps: [recipeApp, plannerApp],
    rows: [],
    ...overrides,
  };
}

describe('mealPlanningStrategy', () => {
  test('stays silent when only the recipe app is installed', () => {
    expect(mealPlanningStrategy.evaluate(ctx({ apps: [recipeApp] }))).toEqual([]);
  });

  test('stays silent when only the planner app is installed', () => {
    expect(mealPlanningStrategy.evaluate(ctx({ apps: [plannerApp] }))).toEqual([]);
  });

  test('stays silent when no recipes were added in the last 24h', () => {
    const rows = [
      {
        appSlug: 'recipe',
        table: 'recipes',
        payload: { title: 'old recipe' },
        createdAt: NOW - 30 * ONE_HOUR,
      },
    ];
    expect(mealPlanningStrategy.evaluate(ctx({ rows }))).toEqual([]);
  });

  test('fires when a fresh recipe lands and a planner is installed', () => {
    const rows = [
      {
        appSlug: 'recipe',
        table: 'recipes',
        payload: { title: 'new recipe' },
        createdAt: NOW - ONE_HOUR,
      },
    ];
    const out = mealPlanningStrategy.evaluate(ctx({ rows }));
    expect(out).toHaveLength(1);
    expect(out[0]?.target.app).toBe('meal-planner');
    expect(out[0]?.urgency).toBe('medium'); // no recent meal-plan rows
  });

  test('drops to low urgency when the planner has been used in the last week', () => {
    const rows = [
      {
        appSlug: 'recipe',
        table: 'recipes',
        payload: { title: 'fresh' },
        createdAt: NOW - ONE_HOUR,
      },
      {
        appSlug: 'meal-planner',
        table: 'plans',
        payload: { week: 'now' },
        createdAt: NOW - 24 * ONE_HOUR,
      },
    ];
    const out = mealPlanningStrategy.evaluate(ctx({ rows }));
    expect(out[0]?.urgency).toBe('low');
  });

  test('id is stable within a day so dedupe works across multiple ticks', () => {
    const rows = [
      {
        appSlug: 'recipe',
        table: 'recipes',
        payload: { title: 'x' },
        createdAt: NOW - ONE_HOUR,
      },
    ];
    const a = mealPlanningStrategy.evaluate(ctx({ rows }));
    const b = mealPlanningStrategy.evaluate(ctx({ rows, now: NOW + 60_000 }));
    expect(a[0]?.id).toBe(b[0]?.id);
  });
});
