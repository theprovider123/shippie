import { describe, expect, test } from 'vitest';
import {
  parseMakerCuration,
  parseFirstPartyCurationEntry,
  VALID_SURFACES,
  VALID_VISIBILITIES,
  VALID_TIERS,
  VALID_CATEGORIES,
} from './schema';

describe('parseMakerCuration', () => {
  test('accepts a clean arcade game block', () => {
    const r = parseMakerCuration({ surface: 'arcade', category: 'games', tier: 'production' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ surface: 'arcade', category: 'games', tier: 'production' });
  });

  test('strips successor defence-in-depth (maker cannot declare it)', () => {
    const r = parseMakerCuration({
      surface: 'arcade',
      category: 'games',
      tier: 'production',
      successor: 'someone-elses-app',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ surface: 'arcade', category: 'games', tier: 'production' });
      expect((r.value as unknown as Record<string, unknown>).successor).toBeUndefined();
    }
  });

  test('keeps tier optional for legacy maker manifests', () => {
    const r = parseMakerCuration({ surface: 'featured', category: 'tools' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ surface: 'featured', category: 'tools' });
  });

  test('rejects maker attempts to claim first-party editorial tiers', () => {
    const r = parseMakerCuration({ surface: 'featured', category: 'tools', tier: 'public-flagship' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('maker uploads');
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
    const r = parseFirstPartyCurationEntry({ surface: 'featured', category: 'tools', tier: 'supported' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ surface: 'featured', category: 'tools', tier: 'supported' });
  });

  test('accepts entry with successor when allow-list passes', () => {
    const r = parseFirstPartyCurationEntry(
      { surface: 'archived', category: 'tools', tier: 'legacy', successor: 'tap-counter' },
      { successorMustExist: (slug) => slug === 'tap-counter' },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.successor).toBe('tap-counter');
  });

  test('rejects successor when it is not in the bake', () => {
    const r = parseFirstPartyCurationEntry(
      { surface: 'archived', category: 'tools', tier: 'legacy', successor: 'ghost-app' },
      { successorMustExist: () => false },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('not in the current bake');
  });

  test('requires first-party entries to declare a tier', () => {
    const r = parseFirstPartyCurationEntry({ surface: 'featured', category: 'tools' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('curation.tier');
  });
});

describe('exported sets', () => {
  test('VALID_SURFACES includes archived', () => {
    expect(VALID_SURFACES).toContain('archived');
  });
  test('VALID_CATEGORIES includes games', () => {
    expect(VALID_CATEGORIES).toContain('games');
  });
  test('VALID_VISIBILITIES keeps private out of surface', () => {
    expect(VALID_VISIBILITIES).toContain('private');
    expect(VALID_SURFACES).not.toContain('private' as never);
  });
  test('VALID_TIERS names public and private flagship roles', () => {
    expect(VALID_TIERS).toContain('public-flagship');
    expect(VALID_TIERS).toContain('private-flagship');
  });
});
