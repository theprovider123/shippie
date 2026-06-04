/**
 * Sudoku's daily bindings — now a thin wrapper over `@shippie/arcade-kit`
 * (extracted from this + the stack/golazo slices). Game-specific bits (versions,
 * share copy) live here; everything else delegates to the shared kit.
 */
import {
  dailySeed as _dailySeed,
  puzzleId as _puzzleId,
  shareLines,
  type PuzzleVersion,
} from '@shippie/arcade-kit';

const V: PuzzleVersion = { rules: 1, content: 1 };

export {
  mulberry32,
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

/** Result share text for a finished daily. */
export function shareResult(input: { puzzleId: string; seconds: number; hintsUsed: number }): string {
  const m = Math.floor(input.seconds / 60);
  const s = String(input.seconds % 60).padStart(2, '0');
  const date = input.puzzleId.split('-').slice(1, 4).join('-');
  const hints = input.hintsUsed === 0 ? 'no hints 🧠' : `${input.hintsUsed} hint${input.hintsUsed === 1 ? '' : 's'}`;
  return shareLines([`Sudoku ${date} — ${m}:${s} · ${hints}`, 'shippie.app/run/sudoku/']);
}
