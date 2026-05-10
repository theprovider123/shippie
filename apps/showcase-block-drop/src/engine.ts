/**
 * Block Drop engine.
 *
 * 8×8 grid. Each round the bag offers 3 random shapes; the player
 * places them one at a time. Clearing happens after every placement:
 * any full row, any full column, or any full 3×3 sub-square clears.
 * Bonus: clearing two-or-more in one drop = combo (multiplier).
 *
 * Game ends when none of the remaining bag shapes can fit anywhere.
 */

export const SIZE = 8;

export type Cell = 0 | 1;
export type Board = Cell[][]; // [row][col]

/**
 * Shape = list of (row, col) offsets from the shape's top-left
 * bounding-box corner. All shape data is normalised so the smallest
 * row/col offset is 0.
 */
export type Shape = ReadonlyArray<readonly [number, number]>;

const N = (cells: ReadonlyArray<readonly [number, number]>): Shape => {
  const minR = Math.min(...cells.map((c) => c[0]));
  const minC = Math.min(...cells.map((c) => c[1]));
  return cells.map(([r, c]) => [r - minR, c - minC] as const);
};

/** Catalogue of shapes — single cells, lines (1-5), small squares,
 *  L/J/T variants, and a couple of 3×3 patterns. Drawn loosely from
 *  the 1010!/Block Blast piece bag.
 */
export const SHAPES: Shape[] = [
  // Single
  N([[0, 0]]),
  // 2-line H/V
  N([[0, 0], [0, 1]]),
  N([[0, 0], [1, 0]]),
  // 3-line H/V
  N([[0, 0], [0, 1], [0, 2]]),
  N([[0, 0], [1, 0], [2, 0]]),
  // 4-line H/V
  N([[0, 0], [0, 1], [0, 2], [0, 3]]),
  N([[0, 0], [1, 0], [2, 0], [3, 0]]),
  // 5-line H/V
  N([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]),
  N([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]),
  // 2x2 square
  N([[0, 0], [0, 1], [1, 0], [1, 1]]),
  // 3x3 square
  N([
    [0, 0], [0, 1], [0, 2],
    [1, 0], [1, 1], [1, 2],
    [2, 0], [2, 1], [2, 2],
  ]),
  // L (small)
  N([[0, 0], [1, 0], [1, 1]]),
  N([[0, 1], [1, 0], [1, 1]]),
  N([[0, 0], [0, 1], [1, 0]]),
  N([[0, 0], [0, 1], [1, 1]]),
  // L (large)
  N([[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]),
  N([[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]]),
  N([[0, 2], [1, 2], [2, 0], [2, 1], [2, 2]]),
  N([[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]]),
  // T
  N([[0, 0], [0, 1], [0, 2], [1, 1]]),
  N([[0, 1], [1, 0], [1, 1], [1, 2]]),
  N([[0, 0], [1, 0], [1, 1], [2, 0]]),
  N([[0, 1], [1, 0], [1, 1], [2, 1]]),
  // Z/S
  N([[0, 0], [0, 1], [1, 1], [1, 2]]),
  N([[0, 1], [0, 2], [1, 0], [1, 1]]),
];

export interface World {
  board: Board;
  /** Three offered shapes; null means already placed. */
  bag: (Shape | null)[];
  score: number;
  level: number;
  combo: number;
  cleared: number; // total cells cleared (drives level-up)
  state: 'playing' | 'over';
  seed: number;
  /** Stable RNG state for daily mode. */
  rngState: number;
}

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0 as Cell));
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailySeed(date = todayKey()): number {
  return djb2(`block-drop-${date}-v1`);
}

export function createWorld(seed?: number): World {
  const sd = seed ?? Math.floor(Math.random() * 0x7fffffff);
  const w: World = {
    board: emptyBoard(),
    bag: [null, null, null],
    score: 0,
    level: 1,
    combo: 0,
    cleared: 0,
    state: 'playing',
    seed: sd,
    rngState: sd,
  };
  refillBag(w);
  return w;
}

export function refillBag(world: World): void {
  const rng = mulberry32(world.rngState);
  const next = (): Shape => SHAPES[Math.floor(rng() * SHAPES.length)]!;
  world.bag = [next(), next(), next()];
  // Advance the seed deterministically for the next refill.
  world.rngState = (world.rngState ^ ((world.rngState << 13) >>> 0) ^ ((world.rngState >>> 17) >>> 0)) >>> 0;
  if (!anyShapeFits(world)) {
    // Game over — none of the freshly-rolled shapes fit.
    world.state = 'over';
  }
}

export function canPlace(board: Board, shape: Shape, row: number, col: number): boolean {
  for (const [dr, dc] of shape) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return false;
    if (board[r]![c] !== 0) return false;
  }
  return true;
}

/** Place + clear; returns the cell-count cleared (so renderer can emit FX). */
export interface PlaceResult {
  cleared: number;
  rowsCleared: number;
  colsCleared: number;
  squaresCleared: number;
  /** Total earned this drop. */
  earned: number;
  /** Whether this drop kicked off a combo (≥2 group cleared). */
  comboHit: boolean;
}

export function place(world: World, bagIndex: 0 | 1 | 2, row: number, col: number): PlaceResult | null {
  if (world.state !== 'playing') return null;
  const shape = world.bag[bagIndex];
  if (!shape) return null;
  if (!canPlace(world.board, shape, row, col)) return null;
  // Stamp.
  for (const [dr, dc] of shape) {
    world.board[row + dr]![col + dc] = 1;
  }
  // Score the placement itself (1 per cell).
  let earned = shape.length;
  // Clear lines + squares.
  const fullRows = new Set<number>();
  const fullCols = new Set<number>();
  for (let r = 0; r < SIZE; r++) {
    if (world.board[r]!.every((v) => v === 1)) fullRows.add(r);
  }
  for (let c = 0; c < SIZE; c++) {
    if (world.board.every((row) => row[c] === 1)) fullCols.add(c);
  }
  // 3x3 squares — corners aligned to multiples of 3 within first 9
  // rows/cols. With SIZE=8 we only check (0,0),(0,3),(3,0),(3,3),
  // (0,5),(5,0),(5,5) — basically anywhere a 3x3 fits.
  const fullSquares: Array<[number, number]> = [];
  for (let r = 0; r + 2 < SIZE; r++) {
    for (let c = 0; c + 2 < SIZE; c++) {
      let full = true;
      for (let dr = 0; dr < 3 && full; dr++) {
        for (let dc = 0; dc < 3 && full; dc++) {
          if (world.board[r + dr]![c + dc] !== 1) full = false;
        }
      }
      if (full) fullSquares.push([r, c]);
    }
  }
  // Eliminate overlapping squares — keep only top-left non-overlapping.
  // (For scoring fairness — each cell only counted once.)
  const cleared = new Set<string>();
  for (const r of fullRows) for (let c = 0; c < SIZE; c++) cleared.add(`${r},${c}`);
  for (const c of fullCols) for (let r = 0; r < SIZE; r++) cleared.add(`${r},${c}`);
  for (const [sr, sc] of fullSquares) {
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        cleared.add(`${sr + dr},${sc + dc}`);
      }
    }
  }
  for (const cell of cleared) {
    const [rs, cs] = cell.split(',');
    world.board[+rs!]![+cs!] = 0;
  }
  const cellsCleared = cleared.size;
  // Per-cell bonus for clears + combo multiplier.
  const groups = fullRows.size + fullCols.size + fullSquares.length;
  const comboHit = groups >= 2;
  if (groups > 0) {
    world.combo = comboHit ? world.combo + 1 : Math.max(1, world.combo);
    earned += cellsCleared * 10 * world.combo;
  } else {
    world.combo = 0;
  }
  world.score += earned;
  world.cleared += cellsCleared;
  world.level = 1 + Math.floor(world.cleared / 80);
  // Mark this bag slot consumed.
  world.bag[bagIndex] = null;
  // Refill if all 3 placed.
  if (world.bag.every((s) => s === null)) {
    refillBag(world);
  } else if (!anyShapeFits(world)) {
    world.state = 'over';
  }
  return {
    cleared: cellsCleared,
    rowsCleared: fullRows.size,
    colsCleared: fullCols.size,
    squaresCleared: fullSquares.length,
    earned,
    comboHit,
  };
}

export function anyShapeFits(world: World): boolean {
  for (const s of world.bag) {
    if (!s) continue;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (canPlace(world.board, s, r, c)) return true;
      }
    }
  }
  return false;
}

export function isPerfectClear(world: World): boolean {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (world.board[r]![c] === 1) return false;
  return true;
}
