import { describe, expect, test } from 'bun:test';
import {
  BANK_VERSION,
  puzzleForDate,
  scoreGuess,
  shareGrid,
} from './wordbank';

describe('puzzleForDate', () => {
  test('deterministic from date+lang+version', () => {
    const words = ['about', 'happy', 'tower'];
    const a = puzzleForDate('2026-05-10', 'en', words);
    const b = puzzleForDate('2026-05-10', 'en', words);
    expect(a).toEqual(b);
  });

  test('different days yield different ids', () => {
    const words = ['about', 'happy', 'tower'];
    const a = puzzleForDate('2026-05-10', 'en', words);
    const b = puzzleForDate('2026-05-11', 'en', words);
    expect(a.puzzle_id).not.toEqual(b.puzzle_id);
  });

  test('puzzle_id encodes lang + bank version', () => {
    const words = ['about'];
    const p = puzzleForDate('2026-05-10', 'es', words);
    expect(p.puzzle_id).toBe(`fl-2026-05-10-es-${BANK_VERSION}`);
  });

  test('handles empty word list defensively', () => {
    const p = puzzleForDate('2026-05-10', 'en', []);
    expect(p.answer).toBe('about'); // fallback
  });
});

describe('scoreGuess', () => {
  test('all greens for exact match', () => {
    expect(scoreGuess('about', 'about')).toEqual([
      'correct', 'correct', 'correct', 'correct', 'correct',
    ]);
  });

  test('all absent for no overlap', () => {
    expect(scoreGuess('about', 'wires')).toEqual([
      'absent', 'absent', 'absent', 'absent', 'absent',
    ]);
  });

  test('handles duplicate letters in guess (no double-yellow)', () => {
    // answer "abled" has one B, one L. guess "lulls" has 3 Ls.
    // Only one L should be scored present (the first matching).
    const res = scoreGuess('abled', 'lulls');
    const presents = res.filter((s) => s === 'present').length;
    const corrects = res.filter((s) => s === 'correct').length;
    // 'l' present in 'abled' once → at most 1 present-or-correct for L.
    expect(presents + corrects).toBe(1);
  });

  test('green takes priority over yellow on the same letter', () => {
    // answer "happy", guess "apple" → first p is yellow, second p is green
    const res = scoreGuess('happy', 'apple');
    expect(res[0]).toBe('present'); // 'a' is in answer but not at position 0
    expect(res[2]).toBe('correct'); // 'p' at position 2 matches
  });
});

describe('shareGrid', () => {
  test('emits row per attempt + count + url', () => {
    const grid = shareGrid(
      [
        ['absent', 'present', 'absent', 'absent', 'absent'],
        ['correct', 'correct', 'correct', 'correct', 'correct'],
      ],
      'fl-2026-05-10-en-v1',
    );
    expect(grid).toContain('2/6');
    expect(grid).toContain('⬜🟨⬜⬜⬜');
    expect(grid).toContain('🟩🟩🟩🟩🟩');
    expect(grid).toContain('shippie.app/run/five-letter/');
  });
});
