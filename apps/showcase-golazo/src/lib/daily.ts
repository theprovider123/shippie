/**
 * Drafted daily/streak contract — Golazo's local copy for the Phase-1 slice
 * (strategy §3.2). This is the THIRD near-identical copy (sudoku, stack, golazo)
 * — the duplication is the concrete signal to extract `@shippie/arcade-kit` next.
 *
 * Golazo already has scores + a worldwide leaderboard + share cards; what it
 * lacked is the streak/daily meta. This adds a play-streak that coexists with
 * the existing systems without disrupting them. UTC day boundary.
 */

export const RULES_VERSION = 1;
export const CONTENT_VERSION = 1;

export function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

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

function addDay(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return todayKeyUTC(new Date(Date.UTC(y, m - 1, d + delta)));
}

export function rollStreak(
  completedDates: readonly string[],
  today: string,
): { current: number; best: number } {
  const set = new Set(completedDates);
  const anchor = set.has(today) ? today : addDay(today, -1);
  let current = 0;
  if (set.has(anchor)) {
    let cursor = anchor;
    while (set.has(cursor)) { current++; cursor = addDay(cursor, -1); }
  }
  let best = 0;
  for (const date of set) {
    if (set.has(addDay(date, -1))) continue;
    let run = 0;
    let cursor = date;
    while (set.has(cursor)) { run++; cursor = addDay(cursor, 1); }
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current) };
}

export interface StreakStore { completedDates: string[]; best: number }
const STREAK_KEY = 'golazo:streak:v1';

export function loadStreak(): StreakStore {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STREAK_KEY);
    if (!raw) return { completedDates: [], best: 0 };
    const parsed = JSON.parse(raw) as StreakStore;
    if (!parsed || !Array.isArray(parsed.completedDates)) return { completedDates: [], best: 0 };
    return parsed;
  } catch {
    return { completedDates: [], best: 0 };
  }
}

/** Record that a Golazo game was played today; returns the updated store. */
export function recordPlayToday(prev: StreakStore = loadStreak()): StreakStore {
  const today = todayKeyUTC();
  if (prev.completedDates.includes(today)) return prev;
  const completedDates = [...prev.completedDates, today].slice(-400);
  const rolled = rollStreak(completedDates, today);
  const next: StreakStore = { completedDates, best: Math.max(prev.best, rolled.best) };
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STREAK_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota */
  }
  return next;
}
