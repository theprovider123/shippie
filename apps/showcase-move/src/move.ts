export type MoveKind = 'plan' | 'workout' | 'sleep';

export interface MoveEntry {
  id: string;
  kind: MoveKind;
  createdAt: number;
  sport?: 'run' | 'walk' | 'cycle' | 'strength' | 'mobility';
  minutes?: number;
  distanceKm?: number;
  sleepHours?: number;
  quality?: number;
}

export interface MoveSummary {
  plans: number;
  workouts: number;
  nights: number;
  totalMinutes: number;
  avgSleep: number | null;
}

export function summarizeMove(entries: readonly MoveEntry[]): MoveSummary {
  let plans = 0;
  let workouts = 0;
  let nights = 0;
  let totalMinutes = 0;
  let sleepTotal = 0;

  for (const entry of entries) {
    if (entry.kind === 'plan') plans += 1;
    if (entry.kind === 'workout') {
      workouts += 1;
      totalMinutes += entry.minutes ?? 0;
    }
    if (entry.kind === 'sleep') {
      nights += 1;
      sleepTotal += entry.sleepHours ?? 0;
    }
  }

  return {
    plans,
    workouts,
    nights,
    totalMinutes,
    avgSleep: nights === 0 ? null : sleepTotal / nights,
  };
}
