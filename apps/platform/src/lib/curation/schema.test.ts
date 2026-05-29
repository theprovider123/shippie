import { describe, expect, test } from 'vitest';
import {
  parseMakerCuration,
  parseFirstPartyCurationEntry,
  normalizeCategory,
  DEFAULT_CATEGORY,
  VALID_SURFACES,
  VALID_CATEGORIES,
} from './schema';

describe('normalizeCategory', () => {
  test('passes controlled values through unchanged', () => {
    for (const cat of VALID_CATEGORIES) {
      expect(normalizeCategory(cat, 'strict')).toBe(cat);
    }
  });

  test('maps legacy/freeform values onto the controlled vocab', () => {
    expect(normalizeCategory('cooking', 'strict')).toBe('food-drink');
    expect(normalizeCategory('coffee', 'strict')).toBe('food-drink');
    expect(normalizeCategory('wellness', 'strict')).toBe('health-fitness');
    expect(normalizeCategory('fitness', 'strict')).toBe('health-fitness');
    expect(normalizeCategory('creativity', 'strict')).toBe('creative');
    expect(normalizeCategory('money', 'strict')).toBe('productivity');
    expect(normalizeCategory('travel', 'strict')).toBe('lifestyle');
  });

  test('is case/whitespace insensitive', () => {
    expect(normalizeCategory('  Cooking ', 'strict')).toBe('food-drink');
    expect(normalizeCategory('GAMES', 'strict')).toBe('games');
  });

  test('strict mode rejects unknown values with null', () => {
    expect(normalizeCategory('ux-research', 'strict')).toBeNull();
    expect(normalizeCategory('other', 'strict')).toBeNull();
    expect(normalizeCategory('', 'strict')).toBeNull();
    expect(normalizeCategory(null, 'strict')).toBeNull();
    expect(normalizeCategory(42, 'strict')).toBeNull();
  });

  test('lenient mode coerces unknown values to the default category', () => {
    expect(normalizeCategory('ux-research', 'lenient')).toBe(DEFAULT_CATEGORY);
    expect(normalizeCategory('other', 'lenient')).toBe(DEFAULT_CATEGORY);
    expect(normalizeCategory(undefined, 'lenient')).toBe(DEFAULT_CATEGORY);
  });

  test('lenient mode still maps known legacy values (not just defaults)', () => {
    expect(normalizeCategory('cooking', 'lenient')).toBe('food-drink');
  });

  test('defaults to strict when no mode is given', () => {
    expect(normalizeCategory('totally-unknown')).toBeNull();
  });
});

describe('parseMakerCuration', () => {
  test('accepts a clean arcade game block', () => {
    const r = parseMakerCuration({ surface: 'arcade', category: 'games' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ surface: 'arcade', category: 'games' });
  });

  test('strips successor defence-in-depth (maker cannot declare it)', () => {
    const r = parseMakerCuration({
      surface: 'arcade',
      category: 'games',
      successor: 'someone-elses-app',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ surface: 'arcade', category: 'games' });
      expect((r.value as unknown as Record<string, unknown>).successor).toBeUndefined();
    }
  });

  test('rejects unknown surface', () => {
    const r = parseMakerCuration({ surface: 'rocket', category: 'games' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('curation.surface');
  });

  test('rejects unknown category', () => {
    const r = parseMakerCuration({ surface: 'featured', category: 'pets' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('curation.category');
  });

  test('rejects non-object input', () => {
    expect(parseMakerCuration(null).ok).toBe(false);
    expect(parseMakerCuration([]).ok).toBe(false);
    expect(parseMakerCuration('arcade').ok).toBe(false);
  });
});

describe('parseFirstPartyCurationEntry', () => {
  test('accepts entry with no successor', () => {
    const r = parseFirstPartyCurationEntry({ surface: 'featured', category: 'tools' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ surface: 'featured', category: 'tools' });
  });

  test('accepts entry with successor when allow-list passes', () => {
    const r = parseFirstPartyCurationEntry(
      { surface: 'archived', category: 'tools', successor: 'tap-counter' },
      { successorMustExist: (slug) => slug === 'tap-counter' },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.successor).toBe('tap-counter');
  });

  test('rejects successor when it is not in the bake', () => {
    const r = parseFirstPartyCurationEntry(
      { surface: 'archived', category: 'tools', successor: 'ghost-app' },
      { successorMustExist: () => false },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('not in the current bake');
  });
});

describe('exported sets', () => {
  test('VALID_SURFACES includes archived', () => {
    expect(VALID_SURFACES).toContain('archived');
  });
  test('VALID_CATEGORIES includes games', () => {
    expect(VALID_CATEGORIES).toContain('games');
  });
});
