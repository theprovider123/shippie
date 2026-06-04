/**
 * Drafted daily/streak/save contract — Stack's local copy for the Phase-1
 * slice (see strategy §3.2). Intentionally mirrors showcase-sudoku/src/daily.ts;
 * the duplication is the signal that justifies extracting `@shippie/arcade-kit`.
 * UTC day boundary; versioned puzzleId so content/rules bumps never corrupt streaks.
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
  let anchor = set.has(today) ? today : addDay(today, -1);
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
    return null;
  }
}

export function writeSave<T>(key: string, save: DailySave<T>): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(save));
  } catch {
    /* private mode / quota */
  }
}

/** Result share text for today's daily run. */
export function shareStackResult(input: { puzzleId: string; score: number; lines: number }): string {
  const date = input.puzzleId.split('-').slice(1, 4).join('-');
  return [
    `Stack daily ${date} — ${input.score.toLocaleString()} pts · ${input.lines} lines`,
    'shippie.app/run/stack/',
  ].join('\n');
}
