/**
 * Stack's daily bindings — thin wrapper over `@shippie/arcade-kit`. Game-specific
 * version stamps + share copy live here; the rest delegates to the shared kit.
 */
import {
  dailySeed as _dailySeed,
  puzzleId as _puzzleId,
  shareLines,
  type PuzzleVersion,
} from '@shippie/arcade-kit';

const V: PuzzleVersion = { rules: 1, content: 1 };

export {
  todayKeyUTC,
  rollStreak,
  loadSave,
  writeSave,
  loadStreak,
  writeStreak,
  type DailySave,
  type StreakStore,
} from '@shippie/arcade-kit';

export const dailySeed = (gameId: string, date: string): number => _dailySeed(gameId, date, V);
export const puzzleId = (gameId: string, date: string): string => _puzzleId(gameId, date, V);

/** Result share text for today's daily run. */
export function shareStackResult(input: { puzzleId: string; score: number; lines: number }): string {
  const date = input.puzzleId.split('-').slice(1, 4).join('-');
  return shareLines([
    `Stack daily ${date} — ${input.score.toLocaleString()} pts · ${input.lines} lines`,
    'shippie.app/run/stack/',
  ]);
}
