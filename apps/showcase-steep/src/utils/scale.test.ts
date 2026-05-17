import { describe, expect, it } from 'bun:test';
import { DEFAULT_BATCHES, batchPreset, formatGrams, scaleToBatch } from './scale.ts';

describe('batchPreset', () => {
  it('defaults to "cup" when key is null/undefined/unknown', () => {
    expect(batchPreset(null).key).toBe('cup');
    expect(batchPreset(undefined).key).toBe('cup');
    expect(batchPreset('cup').key).toBe('cup');
    expect(batchPreset('pot').totalGrams).toBe(12);
  });
});

describe('scaleToBatch', () => {
  it('splits target grams proportionally to parts', () => {
    const result = scaleToBatch(
      [
        { id: 'a', herb_id: 'cham', parts: 3 },
        { id: 'b', herb_id: 'lav', parts: 1 },
      ],
      4,
    );
    expect(result.map((r) => r.grams)).toEqual([3, 1]);
  });

  it('rounds to 1 decimal place', () => {
    const result = scaleToBatch(
      [
        { id: 'a', herb_id: 'cham', parts: 1 },
        { id: 'b', herb_id: 'lav', parts: 1 },
        { id: 'c', herb_id: 'mint', parts: 1 },
      ],
      4,
    );
    // 4/3 = 1.333... → 1.3
    expect(result[0]?.grams).toBe(1.3);
  });

  it('returns 0g per ingredient when totalParts is 0', () => {
    const result = scaleToBatch(
      [{ id: 'a', herb_id: 'cham', parts: 0 }],
      4,
    );
    expect(result[0]?.grams).toBe(0);
  });

  it('preserves the ingredient reference', () => {
    const ing = { id: 'a', herb_id: 'cham', parts: 1 };
    const result = scaleToBatch([ing], 4);
    expect(result[0]?.ingredient).toBe(ing);
  });

  it('default presets total cleanly: 4g cup, 12g pot, 60g tin', () => {
    expect(DEFAULT_BATCHES.map((b) => b.totalGrams)).toEqual([4, 12, 60]);
  });
});

describe('formatGrams', () => {
  it('trims trailing .0 for whole numbers', () => {
    expect(formatGrams(3)).toBe('3g');
    expect(formatGrams(3.0)).toBe('3g');
  });

  it('keeps fractional precision', () => {
    expect(formatGrams(1.5)).toBe('1.5g');
    expect(formatGrams(1.3)).toBe('1.3g');
  });

  it('returns 0g for zero, em-dash for non-finite', () => {
    expect(formatGrams(0)).toBe('0g');
    expect(formatGrams(Number.NaN)).toBe('—');
    expect(formatGrams(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
