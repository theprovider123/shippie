/**
 * Number Trail — find 1 through 25 in order on a 5×5 grid.
 *
 * Deterministic by date: every device sees the same shuffle on a given
 * day. Bank version is encoded in the puzzle id so future tweaks don't
 * rewrite history.
 */

export const BANK_VERSION = 'v1';
export const GRID = 5;
export const TARGET = GRID * GRID; // 25

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

export interface Puzzle {
  puzzle_id: string;        // dp-YYYY-MM-DD-v1
  date: string;
  grid: number[];           // length 25, contains 1..25 shuffled
}

export function puzzleForDate(date: string): Puzzle {
  const seed = djb2(`dp-${date}-${BANK_VERSION}`);
  const rng = mulberry32(seed);
  const nums = Array.from({ length: TARGET }, (_, i) => i + 1);
  // Fisher-Yates with seeded RNG.
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = nums[i]!;
    const b = nums[j]!;
    nums[i] = b;
    nums[j] = a;
  }
  return {
    puzzle_id: `dp-${date}-${BANK_VERSION}`,
    date,
    grid: nums,
  };
}

export function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Build a 5x5 emoji share grid. Filled squares mark the cells along
 * the user's tap path — empty squares mark cells they never touched.
 * Result: a quick visual brag that fits into a tweet or a share sheet.
 */
export function shareGrid(puzzle: Puzzle, durationMs: number): string {
  // The user always taps every cell in a complete run, so the grid
  // shape is always full. Encode the cells in the order they were
  // tapped via a sparkline-ish gradient — but for v1 we keep it
  // simple: 5 lines of 5 squares all filled, plus a result line.
  const seconds = (durationMs / 1000).toFixed(1);
  const rows: string[] = [];
  for (let r = 0; r < GRID; r++) {
    let row = '';
    for (let c = 0; c < GRID; c++) {
      const v = puzzle.grid[r * GRID + c]!;
      // Three buckets so the pattern shows the puzzle's shape, not
      // user solving order.
      if (v <= 8) row += '🟧';
      else if (v <= 17) row += '🟨';
      else row += '🟩';
    }
    rows.push(row);
  }
  return [
    `Daily Puzzle ${puzzle.date} — ${seconds}s`,
    ...rows,
    'shippie.app/run/daily-puzzle/',
  ].join('\n');
}
