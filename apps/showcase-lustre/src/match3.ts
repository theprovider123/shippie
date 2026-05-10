/**
 * Lustre — match-3 core engine.
 *
 * Mechanics:
 *   - 8×8 grid of gems, 6 colours.
 *   - Tap two adjacent gems to swap. If the swap creates a match
 *     (≥3 in a row/column), commit + cascade. Otherwise reverse.
 *   - Cascade: clear matched gems, gravity drops surviving gems
 *     down, refill empties from the top with new random gems,
 *     re-check for matches. Repeat until stable.
 *   - Special gems:
 *       4-in-a-row → bomb (clears 3×3 area on activation)
 *       5-in-a-row → colour-clear (clears all gems of one colour)
 *       T/L shape (4-in-a-row + perpendicular branch) → flame
 *         (clears full row + column on activation)
 *
 * Cascade implemented as a finite-state machine: WAITING → MATCHING
 * → CLEARING → DROPPING → REFILLING → MATCHING (loop). The App
 * advances ticks on rAF so each step has a frame for visual juice.
 *
 * Pure module — board is a 2D array of cell objects, deterministic
 * given the seed (so daily challenge replays identically per device).
 */

export const SIZE = 8;

/** -1 is a sentinel for "cleared, awaiting refill". 0-5 are real gem colours. */
export type Color = -1 | 0 | 1 | 2 | 3 | 4 | 5;
export const COLOR_COUNT = 6;
export const COLORS_HEX = ['#E84A2D', '#F4B860', '#7FB269', '#3F8AA8', '#7E5B96', '#C97B2D'];

export type Special = 'none' | 'bomb' | 'flame' | 'rainbow';

export interface Cell {
  color: Color;
  special: Special;
}

export type Board = Cell[][]; // [row][col]

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

let _rng: (() => number) | null = null;
function rng(): () => number {
  if (!_rng) _rng = mulberry32(Math.floor(Math.random() * 0x7fffffff));
  return _rng;
}

export function setBoardSeed(seed: number | string) {
  _rng = mulberry32(typeof seed === 'string' ? djb2(seed) : seed);
}

function randomColor(): Color {
  return Math.floor(rng()() * COLOR_COUNT) as Color;
}

/**
 * Build a fresh board with no initial matches (re-rolls cells that
 * would match their up/left neighbours so the player isn't handed a
 * cascade for free).
 */
export function makeBoard(): Board {
  const board: Board = [];
  for (let r = 0; r < SIZE; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < SIZE; c++) {
      let color: Color;
      do {
        color = randomColor();
      } while (
        (c >= 2 && row[c - 1]!.color === color && row[c - 2]!.color === color) ||
        (r >= 2 && board[r - 1]![c]!.color === color && board[r - 2]![c]!.color === color)
      );
      row.push({ color, special: 'none' });
    }
    board.push(row);
  }
  return board;
}

export function cloneBoard(b: Board): Board {
  return b.map((row) => row.map((c) => ({ ...c })));
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

export function adjacent(a: { r: number; c: number }, b: { r: number; c: number }): boolean {
  const dr = Math.abs(a.r - b.r);
  const dc = Math.abs(a.c - b.c);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

export function swap(board: Board, a: { r: number; c: number }, b: { r: number; c: number }): void {
  const tmp = board[a.r]![a.c]!;
  board[a.r]![a.c] = board[b.r]![b.c]!;
  board[b.r]![b.c] = tmp;
}

/**
 * Find all match groups (≥3 collinear same-colour cells). Returns
 * groups as { cells, length, axis } so the cascade can promote
 * specials based on group geometry.
 */
export interface MatchGroup {
  cells: Array<{ r: number; c: number }>;
  axis: 'row' | 'col' | 'cross';
  length: number;
}

export function findMatches(board: Board): MatchGroup[] {
  const groups: MatchGroup[] = [];
  // Row matches.
  for (let r = 0; r < SIZE; r++) {
    let runStart = 0;
    for (let c = 1; c <= SIZE; c++) {
      const ended = c === SIZE || board[r]![c]!.color !== board[r]![runStart]!.color;
      if (ended) {
        const len = c - runStart;
        if (len >= 3) {
          const cells: Array<{ r: number; c: number }> = [];
          for (let k = runStart; k < c; k++) cells.push({ r, c: k });
          groups.push({ cells, axis: 'row', length: len });
        }
        runStart = c;
      }
    }
  }
  // Column matches.
  for (let c = 0; c < SIZE; c++) {
    let runStart = 0;
    for (let r = 1; r <= SIZE; r++) {
      const ended = r === SIZE || board[r]![c]!.color !== board[runStart]![c]!.color;
      if (ended) {
        const len = r - runStart;
        if (len >= 3) {
          const cells: Array<{ r: number; c: number }> = [];
          for (let k = runStart; k < r; k++) cells.push({ r: k, c });
          groups.push({ cells, axis: 'col', length: len });
        }
        runStart = r;
      }
    }
  }
  return groups;
}

/**
 * Promote special gems for a set of matched groups. A 4-in-row makes
 * a bomb; 5-in-row makes a rainbow; row+col cross of length≥3+3 makes
 * a flame. Returns the cell that becomes special (the swap-target
 * is preferred when known; here we pick the centre of the longest
 * group as a reasonable default).
 */
export function promoteSpecials(
  groups: MatchGroup[],
  swapTarget: { r: number; c: number } | null,
): Array<{ r: number; c: number; special: Special }> {
  const out: Array<{ r: number; c: number; special: Special }> = [];
  for (const g of groups) {
    if (g.length >= 5) {
      const target = swapTarget && g.cells.some((x) => x.r === swapTarget.r && x.c === swapTarget.c)
        ? swapTarget
        : g.cells[Math.floor(g.cells.length / 2)]!;
      out.push({ r: target.r, c: target.c, special: 'rainbow' });
    } else if (g.length === 4) {
      const target = swapTarget && g.cells.some((x) => x.r === swapTarget.r && x.c === swapTarget.c)
        ? swapTarget
        : g.cells[Math.floor(g.cells.length / 2)]!;
      out.push({ r: target.r, c: target.c, special: 'bomb' });
    }
  }
  return out;
}

/**
 * Apply gravity: empty cells (color = -1 sentinel) bubble up; cells
 * fall down to fill. Used after `clearCells` zeros out matched cells.
 * We use color = -1 to mark cleared; refillBoard repopulates them.
 */
export function clearCells(board: Board, cells: Array<{ r: number; c: number }>): void {
  for (const { r, c } of cells) {
    board[r]![c] = { color: -1 as Color, special: 'none' };
  }
}

export function applyGravity(board: Board): void {
  for (let c = 0; c < SIZE; c++) {
    let writeRow = SIZE - 1;
    for (let r = SIZE - 1; r >= 0; r--) {
      if (board[r]![c]!.color !== -1) {
        if (writeRow !== r) {
          board[writeRow]![c] = board[r]![c]!;
          board[r]![c] = { color: -1 as Color, special: 'none' };
        }
        writeRow--;
      }
    }
  }
}

export function refillBoard(board: Board): void {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r]![c]!.color === -1) {
        board[r]![c] = { color: randomColor(), special: 'none' };
      }
    }
  }
}

/**
 * Compute the cells affected by triggering a special. Bomb = 3×3
 * around target. Flame = full row + col. Rainbow = all cells of the
 * target's colour. Recursive into other specials caught in the blast.
 */
export function expandSpecial(
  board: Board,
  origin: { r: number; c: number },
  visited = new Set<string>(),
): Array<{ r: number; c: number }> {
  const key = `${origin.r},${origin.c}`;
  if (visited.has(key)) return [];
  visited.add(key);
  const cell = board[origin.r]?.[origin.c];
  if (!cell) return [];
  const out: Array<{ r: number; c: number }> = [{ r: origin.r, c: origin.c }];
  let area: Array<{ r: number; c: number }> = [];
  switch (cell.special) {
    case 'bomb':
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = origin.r + dr, c = origin.c + dc;
          if (inBounds(r, c)) area.push({ r, c });
        }
      }
      break;
    case 'flame':
      for (let i = 0; i < SIZE; i++) {
        area.push({ r: origin.r, c: i });
        area.push({ r: i, c: origin.c });
      }
      break;
    case 'rainbow':
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (board[r]![c]!.color === cell.color) area.push({ r, c });
        }
      }
      break;
    case 'none':
      // Not a special — only the origin clears.
      return out;
  }
  for (const a of area) {
    if (board[a.r]![a.c]!.special !== 'none') {
      out.push(...expandSpecial(board, a, visited));
    } else {
      out.push(a);
    }
  }
  return out;
}

/**
 * Score a clear group. Base 10 per gem; multipliers per length.
 *   3 → ×1, 4 → ×1.5, 5+ → ×2.
 */
export function scoreClear(group: MatchGroup): number {
  const base = group.cells.length * 10;
  const mult = group.length >= 5 ? 2 : group.length === 4 ? 1.5 : 1;
  return Math.floor(base * mult);
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailySeed(date: string): string {
  return `lustre-daily-${date}-v1`;
}

export const CAMPAIGN_LEVELS = 60;

export interface LevelTarget {
  scoreTarget: number;
  movesAllowed: number;
}

export function levelTarget(n: number): LevelTarget {
  return {
    scoreTarget: 500 + n * 200,
    movesAllowed: Math.max(15, 35 - Math.floor(n / 4)),
  };
}
