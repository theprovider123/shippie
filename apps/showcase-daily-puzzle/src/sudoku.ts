export type Cell = number;
export type Board = Cell[];
export type Difficulty = 'easy' | 'medium' | 'hard';

const ROWS = 9;
const COLS = 9;
const REMOVE_BUDGET: Record<Difficulty, number> = { easy: 36, medium: 46, hard: 54 };

function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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
    if (c !== col && board[row * COLS + c] === value) return false;
  }
  for (let r = 0; r < ROWS; r++) {
    if (r !== row && board[r * COLS + col] === value) return false;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      const i = r * COLS + c;
      if (i !== idx && board[i] === value) return false;
    }
  }
  return true;
}

function findEmpty(board: Board): number {
  for (let i = 0; i < board.length; i++) if (board[i] === 0) return i;
  return -1;
}

function solveFill(board: Board): boolean {
  const i = findEmpty(board);
  if (i === -1) return true;
  for (const v of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (isValidPlacement(board, i, v)) {
      board[i] = v;
      if (solveFill(board)) return true;
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

export function generateSolved(): Board {
  const board = emptyBoard();
  solveFill(board);
  return board;
}

export function generatePuzzle(diff: Difficulty = 'medium'): { puzzle: Board; solution: Board } {
  const solution = generateSolved();
  const puzzle = [...solution];
  const target = REMOVE_BUDGET[diff];
  let removed = 0;
  for (const i of shuffled(Array.from({ length: 81 }, (_, idx) => idx))) {
    if (removed >= target) break;
    const previous = puzzle[i] ?? 0;
    if (previous === 0) continue;
    puzzle[i] = 0;
    if (countSolutions([...puzzle], 2) === 1) removed++;
    else puzzle[i] = previous;
  }
  return { puzzle, solution };
}
