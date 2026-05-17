import { describe, expect, test } from 'bun:test';
import { formatQuantity, scaleIngredients, scaleNutritionTotal } from './scale.ts';

describe('scaleIngredients', () => {
  test('doubles quantities when target is 2x base', () => {
    const out = scaleIngredients(
      [
        { name: 'pasta', quantity: 200, unit: 'g' },
        { name: 'tomato', quantity: 4 },
      ],
      2,
      4,
    );
    expect(out).toEqual([
      { name: 'pasta', quantity: 400, unit: 'g' },
      { name: 'tomato', quantity: 8 },
    ]);
  });

  test('halves quantities when target is half base', () => {
    const out = scaleIngredients([{ name: 'rice', quantity: 300 }], 4, 2);
    expect(out[0]?.quantity).toBe(150);
  });

  test('passes ingredients without quantity through untouched', () => {
    const out = scaleIngredients([{ name: 'salt' }], 2, 6);
    expect(out).toEqual([{ name: 'salt' }]);
  });

  test('returns a defensive copy when servings are invalid', () => {
    const input = [{ name: 'pasta', quantity: 200 }];
    const out = scaleIngredients(input, 0, 4);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });
});

describe('scaleNutritionTotal', () => {
  test('multiplies all macros by serving count', () => {
    const total = scaleNutritionTotal(
      { calories: 500, protein: 30, carbs: 60, fat: 20, fibre: 6 },
      2,
    );
    expect(total).toEqual({ calories: 1000, protein: 60, carbs: 120, fat: 40, fibre: 12 });
  });

  test('returns zeros when servings is zero', () => {
    const total = scaleNutritionTotal(
      { calories: 500, protein: 30, carbs: 60, fat: 20, fibre: 6 },
      0,
    );
    expect(total.calories).toBe(0);
    expect(total.protein).toBe(0);
  });

  test('clamps negative servings to zero', () => {
    const total = scaleNutritionTotal(
      { calories: 500, protein: 30, carbs: 60, fat: 20, fibre: 6 },
      -2,
    );
    expect(total.calories).toBe(0);
  });
});

describe('formatQuantity', () => {
  test('keeps whole numbers whole', () => {
    expect(formatQuantity(4)).toBe('4');
    expect(formatQuantity(4.02)).toBe('4');
  });

  test('rounds to one fractional digit by default', () => {
    expect(formatQuantity(2.5)).toBe('2.5');
    expect(formatQuantity(0.33)).toBe('0.3');
  });

  test('uses two digits for tiny values', () => {
    expect(formatQuantity(0.05)).toBe('0.05');
  });
});
