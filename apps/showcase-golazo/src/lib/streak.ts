// Tip streak — days in a row you've opened the app. Pure + offline; the store
// bumps it once on launch with today's key.

export interface StreakState {
  days: number;
  lastDay: string; // "YYYY-MM-DD" (UTC)
}

export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Advance the streak for today's visit. Consecutive day → +1, gap → reset to 1. */
export function bumpStreak(prev: StreakState | null, todayKey: string): StreakState {
  if (!prev) return { days: 1, lastDay: todayKey };
  if (prev.lastDay === todayKey) return prev;
  const gap = (Date.parse(todayKey) - Date.parse(prev.lastDay)) / 86_400_000;
  if (gap === 1) return { days: prev.days + 1, lastDay: todayKey };
  return { days: 1, lastDay: todayKey };
}
