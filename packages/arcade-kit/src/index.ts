/**
 * @shippie/arcade-kit — the shared daily/streak/share/seed contract for Shippie
 * games, extracted from the sudoku/stack/golazo vertical slices (strategy doc
 * `docs/superpowers/specs/2026-06-04-shippie-games-consolidation-design.md`).
 *
 * Design notes the slices surfaced:
 *  - Day boundary is UTC midnight (so "same puzzle for everyone" is literally
 *    true; the older five-letter reference used local date).
 *  - Puzzle identity is versioned per game (`rules`, `content`) so a future
 *    scoring or content change never corrupts past streaks/shares.
 *  - Pure streak logic (`rollStreak`, `recordToday`) is separated from IO
 *    (`loadStreak`/`writeStreak`) — the slices originally mixed them.
 *  - Offline-first: `share()` is server-optional (Web Share → clipboard).
 */

// ───────────────────────── seeding ─────────────────────────

/** Deterministic PRNG. Same seed → same sequence on every device. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** djb2 string hash → 32-bit unsigned seed. */
export function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

/** Today's date key at the UTC day boundary, `YYYY-MM-DD`. */
export function todayKeyUTC(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─────────────────── versioned daily identity ──────────────────

/** Per-game version stamps. Bump `rules` on scoring/rule changes, `content` on
 *  puzzle/board generation changes — old entries then never corrupt new streaks. */
export interface PuzzleVersion {
  rules: number;
  content: number;
}

/** Stable, versioned id for a game's daily: `<gameId>-<date>-r<rules>-c<content>`. */
export function puzzleId(gameId: string, date: string, v: PuzzleVersion): string {
  return `${gameId}-${date}-r${v.rules}-c${v.content}`;
}

/** Deterministic numeric seed for a game's daily (hash of the puzzleId). */
export function dailySeed(gameId: string, date: string, v: PuzzleVersion): number {
  return djb2(puzzleId(gameId, date, v));
}

// ───────────────────────── streak (pure) ─────────────────────────

export interface StreakStore {
  completedDates: string[];
  best: number;
}

function addDay(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return todayKeyUTC(new Date(Date.UTC(y, m - 1, d + delta)));
}

/**
 * `current` is the unbroken run ending today (a missed *today* still keeps the
 * streak earned through yesterday); `best` is the longest run anywhere recorded.
 */
export function rollStreak(
  completedDates: readonly string[],
  today: string,
): { current: number; best: number } {
  const set = new Set(completedDates);
  const anchor = set.has(today) ? today : addDay(today, -1);
  let current = 0;
  if (set.has(anchor)) {
    let cursor = anchor;
    while (set.has(cursor)) {
      current++;
      cursor = addDay(cursor, -1);
    }
  }
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

/** Pure: add `today` to the store (idempotent within a day). Persistence is separate. */
export function recordToday(prev: StreakStore, today: string = todayKeyUTC()): StreakStore {
  if (prev.completedDates.includes(today)) return prev;
  const completedDates = [...prev.completedDates, today].slice(-400);
  const rolled = rollStreak(completedDates, today);
  return { completedDates, best: Math.max(prev.best, rolled.best) };
}

// ─────────────────── daily-set (the combined "Today: 4/7") ───────────────────

/**
 * The combined daily set is the headline retention object. It has its OWN
 * versioned identity (separate from per-game results) so changing membership or
 * the required count never retroactively corrupts the combined streak.
 *
 * IMPORTANT (architecture): the games are separate-origin PWAs, so a hub cannot
 * read their localStorage directly. Set-completion must be aggregated where the
 * `game.completed` observations land — the platform. These helpers are the pure
 * primitives that aggregator uses; they take already-collected member completions.
 */
export interface DailySetContract {
  dailySetId: string;
  setVersion: number;
  setDate: string;
  memberGameIds: string[];
  requiredCount: number;
}

/** Has today's set been completed? (≥ requiredCount members done). */
export function isSetComplete(completedMemberCount: number, requiredCount: number): boolean {
  return completedMemberCount >= requiredCount;
}

export interface DailySetProgress {
  done: number;
  required: number;
  total: number;
  complete: boolean;
}

/** Progress for today's set, given which member gameIds were completed today. */
export function setProgress(set: DailySetContract, completedTodayGameIds: readonly string[]): DailySetProgress {
  const done = set.memberGameIds.filter((id) => completedTodayGameIds.includes(id)).length;
  return { done, required: set.requiredCount, total: set.memberGameIds.length, complete: isSetComplete(done, set.requiredCount) };
}

/**
 * Combined streak: the run of consecutive days the set was completed. `setCompletedDates`
 * is the list of dates on which ≥ requiredCount members were done (derived by the
 * platform aggregator from per-game completions). Reuses the single-game streak walk.
 */
export function rollSetStreak(setCompletedDates: readonly string[], today: string): { current: number; best: number } {
  return rollStreak(setCompletedDates, today);
}

// ───────────────────── persistence (IO, guarded) ─────────────────────

/** Envelope for in-progress daily state (save/resume), keyed by puzzleId. */
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
    return null; // legacy/corrupt → treat as fresh, never crash
  }
}

export function writeSave<T>(key: string, save: DailySave<T>): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(save));
  } catch {
    /* private mode / quota */
  }
}

export function loadStreak(key: string): StreakStore {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    if (!raw) return { completedDates: [], best: 0 };
    const parsed = JSON.parse(raw) as StreakStore;
    if (!parsed || !Array.isArray(parsed.completedDates)) return { completedDates: [], best: 0 };
    return parsed;
  } catch {
    return { completedDates: [], best: 0 };
  }
}

export function writeStreak(key: string, store: StreakStore): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(store));
  } catch {
    /* private mode / quota */
  }
}

// ───────────────────────── share (server-optional) ─────────────────────────

/** Join share lines (title + rows + url) the way every game's grid does. */
export function shareLines(lines: string[]): string {
  return lines.join('\n');
}

/** Web Share → clipboard fallback. Returns true if the text went somewhere. */
export async function share(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ text });
      return true;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* user dismissed */
  }
  return false;
}
