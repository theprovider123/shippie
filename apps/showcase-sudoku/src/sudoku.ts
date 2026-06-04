/**
 * Tiny Sudoku generator + solver. Grid is a flat 81-int array
 * (0 = empty, 1–9 = filled).
 *
 * Algorithm: produce a fully solved board via randomised backtracking,
 * then dig holes by removing values one at a time so long as the
 * resulting puzzle still solves uniquely (uniqueness check uses a
 * solve-count solver capped at 2). Difficulty controls the target
 * number of removals.
 */

export type Cell = number;
export type Board = Cell[];

const ROWS = 9;
const COLS = 9;

/** Fisher-Yates using an injectable RNG (defaults to Math.random for free play). */
function shuffled<T>(arr: T[], rng: () => number = Math.random): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

export function emptyBoard(): Board {
  return new Array(81).fill(0);
}

export function isValidPlacement(board: Board, idx: number, value: number): boolean {
  if (value === 0) return true;
  const row = Math.floor(idx / COLS);
  const col = idx % COLS;
  for (let c = 0; c < COLS; c++) {
    if (c === col) continue;
    if (board[row * COLS + c] === value) return false;
  }
  for (let r = 0; r < ROWS; r++) {
    if (r === row) continue;
    if (board[r * COLS + col] === value) return false;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      const i = r * COLS + c;
      if (i === idx) continue;
      if (board[i] === value) return false;
    }
  }
  return true;
}

function findEmpty(board: Board): number {
  for (let i = 0; i < board.length; i++) if (board[i] === 0) return i;
  return -1;
}

function solveFill(board: Board, rng: () => number = Math.random): boolean {
  const i = findEmpty(board);
  if (i === -1) return true;
  for (const v of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)) {
    if (isValidPlacement(board, i, v)) {
      board[i] = v;
      if (solveFill(board, rng)) return true;
      board[i] = 0;
    }
  }
  return false;
}

function countSolutions(board: Board, cap = 2): number {
  let count = 0;
  function recur(): void {
    if (count >= cap) return;
    const i = findEmpty(board);
    if (i === -1) {
      count++;
      return;
    }
    for (let v = 1; v <= 9 && count < cap; v++) {
      if (isValidPlacement(board, i, v)) {
        board[i] = v;
        recur();
        board[i] = 0;
      }
    }
  }
  recur();
  return count;
}

export function generateSolved(rng: () => number = Math.random): Board {
  const board = emptyBoard();
  solveFill(board, rng);
  return board;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

const REMOVE_BUDGET: Record<Difficulty, number> = { easy: 36, medium: 46, hard: 54 };

export function generatePuzzle(
  diff: Difficulty = 'medium',
  rng: () => number = Math.random,
): { puzzle: Board; solution: Board } {
  const solution = generateSolved(rng);
  const puzzle = [...solution];
  const target = REMOVE_BUDGET[diff];
  let removed = 0;
  // Iterate over indices in a random order so puzzles vary in shape.
  const order = shuffled(Array.from({ length: 81 }, (_, i) => i), rng);
  for (const i of order) {
    if (removed >= target) break;
    const previous = puzzle[i] ?? 0;
    if (previous === 0) continue;
    puzzle[i] = 0;
    const trial = [...puzzle];
    if (countSolutions(trial, 2) === 1) {
      removed++;
    } else {
      puzzle[i] = previous;
    }
  }
  return { puzzle, solution };
}
