import { describe, expect, test } from 'bun:test';
import { PUZZLES, puzzleForDate, shuffledTiles, BAND_ORDER } from './puzzles';

describe('PUZZLES', () => {
  test('every puzzle has exactly 4 groups of 4 unique words', () => {
    for (const p of PUZZLES) {
      expect(p.groups.length).toBe(4);
      const all = new Set<string>();
      for (const g of p.groups) {
        expect(g.words.length).toBe(4);
        for (const w of g.words) {
          expect(all.has(w)).toBe(false);
          all.add(w);
        }
      }
      expect(all.size).toBe(16);
    }
  });

  test('all 4 bands are represented exactly once per puzzle', () => {
    for (const p of PUZZLES) {
      const bands = new Set(p.groups.map((g) => g.band));
      expect(bands.size).toBe(4);
      for (const b of BAND_ORDER) expect(bands.has(b)).toBe(true);
    }
  });
});

describe('puzzleForDate', () => {
  test('returns the same puzzle for the same date', () => {
    const a = puzzleForDate('2026-05-10');
    const b = puzzleForDate('2026-05-10');
    expect(a.id).toBe(b.id);
  });

  test('different dates produce different puzzles (within the pack size)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const d = new Date(2026, 4, i + 1).toISOString().slice(0, 10);
      ids.add(puzzleForDate(d).id);
    }
    // 60 dates against a 30-puzzle pack should hit at least 20 distinct ids.
    expect(ids.size).toBeGreaterThanOrEqual(20);
  });
});

describe('shuffledTiles', () => {
  test('returns 16 tiles', () => {
    const tiles = shuffledTiles(PUZZLES[0]!);
    expect(tiles.length).toBe(16);
  });

  test('shuffle is deterministic per puzzle', () => {
    const a = shuffledTiles(PUZZLES[0]!).map((t) => t.word).join(',');
    const b = shuffledTiles(PUZZLES[0]!).map((t) => t.word).join(',');
    expect(a).toBe(b);
  });
});
