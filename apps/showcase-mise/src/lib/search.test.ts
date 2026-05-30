import { describe, expect, test } from 'bun:test';
import { SEED_FOODS } from './foods-data';
import { parseFreeText, scoreFood, searchFoods, slotForHour } from './search';

const egg = SEED_FOODS.find((f) => f.id === 'seed_egg')!;

describe('searchFoods', () => {
  test('empty query returns nothing', () => {
    expect(searchFoods('', SEED_FOODS)).toEqual([]);
    expect(searchFoods('   ', SEED_FOODS)).toEqual([]);
  });

  test('prefix match ranks the obvious food first', () => {
    const results = searchFoods('chicken', SEED_FOODS);
    expect(results[0]!.name.toLowerCase()).toContain('chicken');
  });

  test('multi-token AND match finds greek yogurt', () => {
    const results = searchFoods('greek yog', SEED_FOODS);
    expect(results.map((f) => f.id)).toContain('seed_greek_yogurt');
  });

  test('handles typos via subsequence fallback', () => {
    const results = searchFoods('brocoli', SEED_FOODS);
    expect(results.map((f) => f.id)).toContain('seed_broccoli');
  });

  test('favorite gives a small boost between equal matches', () => {
    const plain = scoreFood('oats', { ...SEED_FOODS.find((f) => f.id === 'seed_oats_cooked')! });
    const faved = scoreFood('oats', {
      ...SEED_FOODS.find((f) => f.id === 'seed_oats_cooked')!,
      favorite: true,
    });
    expect(faved).toBeGreaterThan(plain);
  });

  test('respects the result limit', () => {
    expect(searchFoods('a', SEED_FOODS, 3).length).toBeLessThanOrEqual(3);
  });
});

describe('parseFreeText', () => {
  test('"2 eggs" → egg food, 2 servings', () => {
    const p = parseFreeText('2 eggs', SEED_FOODS);
    expect(p.food?.id).toBe('seed_egg');
    expect(p.qty).toBeCloseTo(2, 2);
    expect(p.grams).toBeCloseTo(egg.serving.grams * 2, 0);
    expect(p.explicit).toBe(true);
  });

  test('"200g chicken breast" → explicit grams', () => {
    const p = parseFreeText('200g chicken breast', SEED_FOODS);
    expect(p.food?.id).toBe('seed_chicken_breast');
    expect(p.grams).toBe(200);
    expect(p.explicit).toBe(true);
  });

  test('"200 g rice" with spaced unit also parses grams', () => {
    const p = parseFreeText('200 g white rice', SEED_FOODS);
    expect(p.grams).toBe(200);
    expect(p.food?.id).toBe('seed_rice_white');
  });

  test('"handful of almonds" → portion grams', () => {
    const p = parseFreeText('handful of almonds', SEED_FOODS);
    expect(p.food?.id).toBe('seed_almonds');
    expect(p.grams).toBe(30);
    expect(p.explicit).toBe(true);
  });

  test('"large bowl of oatmeal" → size × portion', () => {
    const p = parseFreeText('large bowl of oatmeal', SEED_FOODS);
    expect(p.grams).toBe(Math.round(250 * 1.4));
  });

  test('bare food name → one default serving, not marked explicit', () => {
    const p = parseFreeText('banana', SEED_FOODS);
    expect(p.food?.id).toBe('seed_banana');
    expect(p.qty).toBeCloseTo(1, 2);
    expect(p.explicit).toBe(false);
  });

  test('detects a slot hint', () => {
    const p = parseFreeText('apple snack', SEED_FOODS);
    expect(p.slotHint).toBe('snack');
    expect(p.food?.id).toBe('seed_apple');
  });

  test('unmatched text still yields a loggable candidate', () => {
    const p = parseFreeText('grandmas mystery stew', SEED_FOODS);
    expect(p.food).toBeNull();
    expect(p.name.length).toBeGreaterThan(0);
    expect(p.grams).toBeGreaterThan(0);
  });
});

describe('slotForHour', () => {
  test('maps the clock to a sensible default slot', () => {
    expect(slotForHour(8)).toBe('breakfast');
    expect(slotForHour(13)).toBe('lunch');
    expect(slotForHour(19)).toBe('dinner');
    expect(slotForHour(23)).toBe('snack');
  });
});
