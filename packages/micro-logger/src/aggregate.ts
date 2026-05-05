/**
 * Pure aggregation helpers feeding the chart variants.
 *
 *   - `bucketByDay`     → ordered (oldest-first) day-key + count list.
 *   - `countToday`      → fast lookup for the count-vs-target chart.
 *   - `heatmapMatrix`   → 7 weekdays × N week columns, count per cell.
 */
import type { LoggedRow } from './types.ts';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export interface DayBucket {
  date: string;
  count: number;
}

export function bucketByDay(
  rows: readonly LoggedRow[],
  windowDays: number,
  now: number = Date.now(),
): DayBucket[] {
  const cutoff = now - windowDays * MS_PER_DAY;
  const counts = new Map<string, number>();
  // Pre-seed every day in the window so the chart has a stable
  // x-axis even on days with zero rows.
  for (let i = windowDays - 1; i >= 0; i--) {
    counts.set(dayKey(now - i * MS_PER_DAY), 0);
  }
  for (const row of rows) {
    if (row.loggedAt < cutoff) continue;
    const key = dayKey(row.loggedAt);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([date, count]) => ({ date, count }));
}

export function countToday(rows: readonly LoggedRow[], now: number = Date.now()): number {
  const today = dayKey(now);
  let total = 0;
  for (const row of rows) {
    if (dayKey(row.loggedAt) === today) total += 1;
  }
  return total;
}

export interface HeatmapCell {
  weekColumn: number;
  weekday: number;
  date: string;
  count: number;
}

/**
 * 7-row heatmap (Sun..Sat) over the last `windowDays`. The number of
 * week columns is `Math.ceil(windowDays / 7)`. Cells before the
 * earliest day are returned with `count: 0` so the grid stays
 * rectangular.
 */
export function heatmapMatrix(
  rows: readonly LoggedRow[],
  windowDays: number,
  now: number = Date.now(),
): HeatmapCell[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = dayKey(row.loggedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const cells: HeatmapCell[] = [];
  const weeks = Math.ceil(windowDays / 7);
  // Anchor on today; column 0 is the oldest week.
  const todayDate = new Date(now);
  for (let w = weeks - 1; w >= 0; w--) {
    for (let d = 0; d < 7; d++) {
      const offsetDays = w * 7 + (todayDate.getDay() - d);
      const cellDate = new Date(now - offsetDays * MS_PER_DAY);
      const key = dayKey(cellDate.getTime());
      cells.push({
        weekColumn: weeks - 1 - w,
        weekday: d,
        date: key,
        count: counts.get(key) ?? 0,
      });
    }
  }
  return cells;
}
