import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_STORE_PROFILES,
  KNOWN_AISLES,
  aisleIndex,
  fullAislePath,
  getProfile,
  reorderAisles,
  upsertProfile,
} from './store-profiles.ts';

describe('store-profiles', () => {
  test('every default profile covers every known aisle', () => {
    for (const profile of DEFAULT_STORE_PROFILES) {
      const path = fullAislePath(profile);
      for (const aisle of KNOWN_AISLES) {
        expect(path).toContain(aisle);
      }
      // No duplicates after fullAislePath dedup.
      expect(path.length).toBe(new Set(path).size);
    }
  });

  test('Tesco and Aldi differ in the first three aisles', () => {
    const tesco = DEFAULT_STORE_PROFILES.find((p) => p.id === 'tesco')!;
    const aldi = DEFAULT_STORE_PROFILES.find((p) => p.id === 'aldi')!;
    const tescoFirst3 = tesco.aislePath.slice(0, 3).join(',');
    const aldiFirst3 = aldi.aislePath.slice(0, 3).join(',');
    expect(tescoFirst3).not.toBe(aldiFirst3);
  });

  test('aisleIndex respects profile-specific ordering', () => {
    const aldi = DEFAULT_STORE_PROFILES.find((p) => p.id === 'aldi')!;
    const tesco = DEFAULT_STORE_PROFILES.find((p) => p.id === 'tesco')!;
    // Aldi puts pantry early, produce later — opposite of Tesco.
    expect(aisleIndex(aldi, 'pantry')).toBeLessThan(aisleIndex(aldi, 'produce'));
    expect(aisleIndex(tesco, 'produce')).toBeLessThan(aisleIndex(tesco, 'pantry'));
  });

  test('getProfile falls back to generic on unknown id', () => {
    const profile = getProfile(DEFAULT_STORE_PROFILES, 'nope');
    expect(profile.id).toBe('generic');
  });

  test('reorderAisles produces a new ordering and is pure', () => {
    const tesco = DEFAULT_STORE_PROFILES.find((p) => p.id === 'tesco')!;
    const before = [...tesco.aislePath];
    const moved = reorderAisles(tesco, 0, 3);
    expect(tesco.aislePath).toEqual(before);
    expect(moved.aislePath[3]).toBe(before[0]);
  });

  test('upsertProfile inserts new and replaces existing', () => {
    const custom = {
      id: 'lidl',
      name: 'Lidl',
      aislePath: KNOWN_AISLES,
    };
    const inserted = upsertProfile(DEFAULT_STORE_PROFILES, custom);
    expect(inserted.find((p) => p.id === 'lidl')).toBeDefined();

    const replaced = upsertProfile(inserted, { ...custom, name: 'Lidl GB' });
    expect(replaced.find((p) => p.id === 'lidl')!.name).toBe('Lidl GB');
    expect(replaced.length).toBe(inserted.length);
  });
});
