import { test, expect } from 'bun:test';
import { generatePuzzle, isValidPlacement, type Board } from './sudoku';
import { mulberry32 } from './daily';

function solvedCount(b: Board): number {
  return b.filter((v) => v !== 0).length;
}

test('seeded generation is deterministic for the same seed', () => {
  const a = generatePuzzle('medium', mulberry32(123));
  const b = generatePuzzle('medium', mulberry32(123));
  expect(a.puzzle).toEqual(b.puzzle);
  expect(a.solution).toEqual(b.solution);
});

test('different seeds produce different boards', () => {
  const a = generatePuzzle('medium', mulberry32(123));
  const c = generatePuzzle('medium', mulberry32(999));
  expect(a.puzzle).not.toEqual(c.puzzle);
});

test('generated puzzle is a valid, solvable shape', () => {
  const { puzzle, solution } = generatePuzzle('easy', mulberry32(42));
  expect(puzzle.length).toBe(81);
  expect(solution.length).toBe(81);
  // every given clue is consistent with sudoku rules
  for (let i = 0; i < 81; i++) {
    if (puzzle[i] !== 0) expect(isValidPlacement(puzzle, i, puzzle[i]!)).toBe(true);
  }
  // easy leaves more clues than hard
  const hard = generatePuzzle('hard', mulberry32(42));
  expect(solvedCount(puzzle)).toBeGreaterThan(solvedCount(hard.puzzle));
});
