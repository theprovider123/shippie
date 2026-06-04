/**
 * Golazo's daily bindings — thin wrapper over `@shippie/arcade-kit`. Adds a
 * play-streak (the meta the hub lacked) that coexists with the existing scores /
 * leaderboard / share. Game-specific persistence key + version stamps live here.
 */
import {
  dailySeed as _dailySeed,
  puzzleId as _puzzleId,
  recordToday,
  loadStreak as _loadStreak,
  writeStreak,
  type PuzzleVersion,
  type StreakStore,
} from '@shippie/arcade-kit';

const V: PuzzleVersion = { rules: 1, content: 1 };
const STREAK_KEY = 'golazo:streak:v1';

export { todayKeyUTC, rollStreak, type StreakStore } from '@shippie/arcade-kit';

export const dailySeed = (gameId: string, date: string): number => _dailySeed(gameId, date, V);
export const puzzleId = (gameId: string, date: string): string => _puzzleId(gameId, date, V);

export function loadStreak(): StreakStore {
  return _loadStreak(STREAK_KEY);
}

/** Record that a Golazo game was played today; persists + returns the updated store. */
export function recordPlayToday(prev: StreakStore = loadStreak()): StreakStore {
  const next = recordToday(prev);
  if (next !== prev) writeStreak(STREAK_KEY, next);
  return next;
}
