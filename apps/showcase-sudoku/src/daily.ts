/**
 * Drafted daily/streak/save contract — scoped to this app for the Phase-1
 * vertical slice. The kit (`@shippie/arcade-kit`) is extracted later from
 * what these slices actually need; until then this is the single source of
 * truth for Sudoku's daily mode.
 *
 * Contract (strategy §3.2): every daily result is identified by a versioned
 * `puzzleId = <gameId>-<seedDate>-r<RULES_VERSION>-c<CONTENT_VERSION>`. Bumping
 * RULES_VERSION (scoring/rules) or CONTENT_VERSION (board generation) means old
 * entries never corrupt new streaks. The day boundary is UTC midnight (decided
 * default — note: the existing five-letter reference uses local date; this slice
 * standardises on UTC so "same puzzle for everyone" is literally true).
 */

export const RULES_VERSION = 1;
export const CONTENT_VERSION = 1;

/** Deterministic PRNG (mulberry32) — same as the seed pattern used across games. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** djb2 string hash → 32-bit unsigned seed (ported from five-letter/wordbank). */
export function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

/** Today's date key at UTC midnight, `YYYY-MM-DD`. */
export function todayKeyUTC(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dailySeed(gameId: string, date: string): number {
  return djb2(`${gameId}-${date}-r${RULES_VERSION}-c${CONTENT_VERSION}`);
}

export function puzzleId(gameId: string, date: string): string {
  return `${gameId}-${date}-r${RULES_VERSION}-c${CONTENT_VERSION}`;
}

/** Add one UTC day to a `YYYY-MM-DD` key. */
function addDay(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return todayKeyUTC(dt);
}

/**
 * Walk consecutive UTC dates back from `today` over the set of completed dates.
 * `current` is the unbroken run ending today (or yesterday — a missed today
 * doesn't yet break a streak earned through yesterday); `best` is the longest
 * run ever seen in the set.
 */
export function rollStreak(
  completedDates: readonly string[],
  today: string,
): { current: number; best: number } {
  const set = new Set(completedDates);
  // current: count back from today; if today not done, allow yesterday as the anchor.
  let anchor = set.has(today) ? today : addDay(today, -1);
  let current = 0;
  if (set.has(anchor)) {
    let cursor = anchor;
    while (set.has(cursor)) {
      current++;
      cursor = addDay(cursor, -1);
    }
  }
  // best: longest consecutive run anywhere in the set.
  let best = 0;
  for (const date of set) {
    if (set.has(addDay(date, -1))) continue; // only start at run-heads
    let run = 0;
    let cursor = date;
    while (set.has(cursor)) {
      run++;
      cursor = addDay(cursor, 1);
    }
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current) };
}

export interface DailySave<T> {
  puzzleId: string;
  payloadVersion: number;
  payload: T;
}

export function loadSave<T>(key: string): DailySave<T> | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailySave<T>;
    if (!parsed || typeof parsed.puzzleId !== 'string') return null;
    return parsed;
  } catch {
    return null; // legacy/corrupt data → treat as fresh, never crash
  }
}

export function writeSave<T>(key: string, save: DailySave<T>): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(save));
  } catch {
    /* private mode / quota — keep the live game working */
  }
}

/** Result share text for a finished daily (five-letter `shareGrid` style). */
export function shareResult(input: { puzzleId: string; seconds: number; hintsUsed: number }): string {
  const m = Math.floor(input.seconds / 60);
  const s = String(input.seconds % 60).padStart(2, '0');
  const date = input.puzzleId.split('-').slice(1, 4).join('-'); // gameId-YYYY-MM-DD-...
  const hints = input.hintsUsed === 0 ? 'no hints 🧠' : `${input.hintsUsed} hint${input.hintsUsed === 1 ? '' : 's'}`;
  return [`Sudoku ${date} — ${m}:${s} · ${hints}`, 'shippie.app/run/sudoku/'].join('\n');
}
