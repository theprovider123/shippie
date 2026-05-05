export type QuietKind = 'breath' | 'focus' | 'mood';

export interface QuietSession {
  id: string;
  kind: QuietKind;
  createdAt: number;
  durationSeconds?: number;
  score?: number;
  note?: string;
}

export interface QuietSummary {
  breath: number;
  focus: number;
  mood: number;
  totalSeconds: number;
  averageMood: number | null;
}

export function summarizeQuiet(rows: readonly QuietSession[]): QuietSummary {
  let breath = 0;
  let focus = 0;
  let mood = 0;
  let totalSeconds = 0;
  let moodTotal = 0;

  for (const row of rows) {
    if (row.kind === 'breath') breath += 1;
    if (row.kind === 'focus') focus += 1;
    if (row.kind === 'mood') {
      mood += 1;
      moodTotal += row.score ?? 0;
    }
    totalSeconds += row.durationSeconds ?? 0;
  }

  return {
    breath,
    focus,
    mood,
    totalSeconds,
    averageMood: mood === 0 ? null : moodTotal / mood,
  };
}
