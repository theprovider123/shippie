import { describe, expect, test } from 'vitest';
import {
  parseMakerCuration,
  parseFirstPartyCurationEntry,
  VALID_SURFACES,
  VALID_CATEGORIES,
} from './schema';

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
