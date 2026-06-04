import {
  rollSetStreak,
  setProgress,
  todayKeyUTC,
  type DailySetContract,
  type DailySetProgress,
} from '@shippie/arcade-kit';
import type { IntentEvent } from './store';

export const DAILY_SET_ID = 'shippie-daily';
export const DAILY_SET_VERSION = 1;
export const DAILY_SET_REQUIRED_COUNT = 3;
export const DAILY_SET_GAMES = [
  'sudoku',
  'five-letter',
  'quartet',
  'block-drop',
  'daily-puzzle',
] as const;

const PUZZLE_ID_RE = /^(.+)-(\d{4}-\d{2}-\d{2})-r\d+-c\d+$/;
const DATE_RE = /(\d{4}-\d{2}-\d{2})/;

export interface DailyStreakDay {
  date: string;
  games: string[];
  progress: DailySetProgress;
}

export interface DailyStreakSummary {
  set: DailySetContract;
  current: number;
  best: number;
  today: DailySetProgress;
  todayGames: string[];
  completedDates: string[];
  days: DailyStreakDay[];
}

export function dailySetFor(date: string = todayKeyUTC()): DailySetContract {
  return {
    dailySetId: DAILY_SET_ID,
    setVersion: DAILY_SET_VERSION,
    setDate: date,
    memberGameIds: [...DAILY_SET_GAMES],
    requiredCount: DAILY_SET_REQUIRED_COUNT,
  };
}

export function summariseDailyStreak(
  events: readonly IntentEvent[],
  today: string = todayKeyUTC(),
): DailyStreakSummary {
  const gamesByDate = new Map<string, Set<string>>();

  for (const event of events) {
    const completion = dailyCompletionFromEvent(event);
    if (!completion) continue;
    const set = dailySetFor(completion.date);
    if (!set.memberGameIds.includes(completion.gameId)) continue;
    let games = gamesByDate.get(completion.date);
    if (!games) {
      games = new Set();
      gamesByDate.set(completion.date, games);
    }
    games.add(completion.gameId);
  }

  const days = [...gamesByDate.entries()]
    .map(([date, games]) => {
      const sortedGames = [...games].sort();
      return {
        date,
        games: sortedGames,
        progress: setProgress(dailySetFor(date), sortedGames),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const completedDates = days.filter((day) => day.progress.complete).map((day) => day.date);
  const streak = rollSetStreak(completedDates, today);
  const todayGames = gamesByDate.has(today) ? [...gamesByDate.get(today)!].sort() : [];

  return {
    set: dailySetFor(today),
    current: streak.current,
    best: streak.best,
    today: setProgress(dailySetFor(today), todayGames),
    todayGames,
    completedDates,
    days,
  };
}

function dailyCompletionFromEvent(event: IntentEvent): { gameId: string; date: string } | null {
  if (event.intent !== 'game.completed') return null;
  const row = readRow(event.row);
  const puzzleId = typeof row?.puzzleId === 'string' ? row.puzzleId : null;
  if (!puzzleId) return null;

  const parsed = parsePuzzleId(puzzleId);
  if (parsed) return parsed;

  const gameId = typeof row?.game === 'string' && row.game ? row.game : appIdToGameId(event.appId);
  const date = puzzleId.match(DATE_RE)?.[1] ?? todayKeyUTC(new Date(event.ts));
  return { gameId, date };
}

function parsePuzzleId(puzzleId: string): { gameId: string; date: string } | null {
  const match = puzzleId.match(PUZZLE_ID_RE);
  if (!match) return null;
  const [, gameId, date] = match;
  return gameId && date ? { gameId, date } : null;
}

function appIdToGameId(appId: string): string {
  return appId.replace(/^app_/, '').replace(/_/g, '-');
}

function readRow(row: unknown): Record<string, unknown> | null {
  return row && typeof row === 'object' && !Array.isArray(row)
    ? (row as Record<string, unknown>)
    : null;
}
