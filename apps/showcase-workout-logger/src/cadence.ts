/**
 * Pure cadence detector. Reads recent session timestamps and infers a
 * weekly rest-day pattern once enough data is present. Stays heuristic-
 * light per the C2 acceptance criterion: surface a pattern only after
 * 7+ sessions, otherwise stay quiet.
 */

export interface SessionForCadence {
  createdAt: string; // ISO
}

export interface CadenceInsight {
  /** Mean days between sessions over the analysed window. */
  avgGapDays: number;
  /** Most-common day-of-week skipped (0=Sun … 6=Sat), or null when no clear signal. */
  restDay: number | null;
  /** Number of sessions used to compute the insight. */
  sampleSize: number;
}

const MIN_SESSIONS = 7;

export function inferCadence(sessions: readonly SessionForCadence[]): CadenceInsight | null {
  if (sessions.length < MIN_SESSIONS) return null;
  const sorted = [...sessions]
    .map((s) => new Date(s.createdAt).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (sorted.length < MIN_SESSIONS) return null;

  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push((sorted[i]! - sorted[i - 1]!) / (24 * 60 * 60 * 1000));
  }
  const avgGapDays = gaps.reduce((a, b) => a + b, 0) / gaps.length;

  // Day-of-week histogram of session days; the most-skipped DOW is the
  // restDay candidate. We need a clear winner — at least 1.5x the mean.
  const counts = new Array<number>(7).fill(0);
  for (const t of sorted) {
    const dow = new Date(t).getDay();
    counts[dow] = (counts[dow] ?? 0) + 1;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  const mean = total / 7;
  let restDay: number | null = null;
  let lowest = Number.POSITIVE_INFINITY;
  for (let d = 0; d < 7; d += 1) {
    if (counts[d]! < lowest) {
      lowest = counts[d]!;
      restDay = d;
    }
  }
  // Only return a clear signal — half the mean or less.
  if (lowest > mean * 0.5) restDay = null;

  return { avgGapDays, restDay, sampleSize: sorted.length };
}

export function dayName(dow: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow] ?? '';
}
