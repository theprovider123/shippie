import { describe, expect, test } from 'vitest';
import { parseIntents } from './manifest';

describe('parseIntents', () => {
  test('returns undefined for null / non-object', () => {
    expect(parseIntents(null)).toBeUndefined();
    expect(parseIntents(undefined)).toBeUndefined();
    expect(parseIntents('string')).toBeUndefined();
    expect(parseIntents(42)).toBeUndefined();
  });

  test('returns undefined for empty object', () => {
    expect(parseIntents({})).toBeUndefined();
  });

  test('extracts valid provides + consumes', () => {
    const result = parseIntents({
      provides: ['shopping-list', 'meal-plan'],
      consumes: ['budget-limit'],
    });
    expect(result?.provides).toEqual(['shopping-list', 'meal-plan']);
    expect(result?.consumes).toEqual(['budget-limit']);
  });

  test('drops invalid identifiers (uppercase, special chars, too long)', () => {
    const result = parseIntents({
      provides: ['valid', 'BAD_UPPER', 'has space', 'has/slash', 'a'.repeat(60)],
      consumes: ['ok'],
    });
    expect(result?.provides).toEqual(['valid']);
    expect(result?.consumes).toEqual(['ok']);
  });

  test('drops non-string entries', () => {
    const result = parseIntents({ provides: ['ok', 42, null, true, 'fine'] });
    expect(result?.provides).toEqual(['ok', 'fine']);
  });

  test('returns undefined when nothing valid remains', () => {
    expect(parseIntents({ provides: ['BAD'], consumes: [42] })).toBeUndefined();
  });

  test('accepts kebab-case and digits but not leading digits', () => {
    const result = parseIntents({
      provides: ['kebab-case', 'with-1-digit', '1-leading-digit', '-leading-dash'],
    });
    expect(result?.provides).toEqual(['kebab-case', 'with-1-digit']);
  });
});
