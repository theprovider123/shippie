/**
 * Pure functions that turn entry rows into chart-ready bins.
 *
 * The chart in History/PrintView is a horizontal bar per day per symptom.
 * For 1-5 symptoms we show the *peak* intensity in the bin (a doctor cares
 * about the worst point, not the smoothed mean). For present-absent
 * symptoms we show 5 if any entry occurred in the bin, else 0 — so a
 * single bar height + colour scale works for both.
 *
 * Day strings are local-date `YYYY-MM-DD` so the doctor handoff reads in
 * the user's clinic's timezone, not UTC.
 */
import type { Entry, Symptom } from '../db/schema.ts';

export interface DayBin {
  /** Local YYYY-MM-DD. */
  day: string;
  /** Peak intensity in the bin (0..5). 0 means no entries that day. */
  peak: number;
  /** How many entries fell in this bin (for the doctor's eye). */
  count: number;
}

export interface SymptomChart {
  symptomId: string;
  symptomName: string;
  scale: Symptom['default_scale'];
  bins: DayBin[];
  /** Convenience: total entries across the whole range. */
  totalEntries: number;
}

/**
 * Local-date key for a timestamp. Pure — no Date.now(), no timezone
 * surprises. Uses the host's local timezone (the user's phone),
 * which is the right thing for a clinic visit.
 */
export function toLocalDay(iso: string): string {
  const d = new Date(iso);
  // Manually format to avoid reliance on toLocaleDateString format
  // surprises across hosts. YYYY-MM-DD only.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Inclusive list of YYYY-MM-DD between fromDay and toDay. Caller is
 * responsible for passing same-format strings; we just walk by 24h
 * stepping a Date constructed from `${day}T00:00:00`.
 */
export function dayRange(fromDay: string, toDay: string): string[] {
  if (fromDay > toDay) return [];
  const out: string[] = [];
  const start = new Date(`${fromDay}T00:00:00`);
  const end = new Date(`${toDay}T00:00:00`);
  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += 24 * 60 * 60 * 1000) {
    out.push(toLocalDay(new Date(cursor).toISOString()));
  }
  return out;
}

/**
 * Bin entries for one symptom into peak-per-day across the given range.
 * Days with no entries get a 0-height bar; the doctor then sees the
 * gap honestly instead of a misleading interpolation.
 */
export function binEntriesByDay(
  entries: Entry[],
  symptom: Symptom,
  fromDay: string,
  toDay: string,
): SymptomChart {
  const days = dayRange(fromDay, toDay);
  const byDay = new Map<string, { peak: number; count: number }>();
  for (const day of days) byDay.set(day, { peak: 0, count: 0 });

  let total = 0;
  for (const e of entries) {
    if (e.symptom_id !== symptom.id) continue;
    const day = toLocalDay(e.occurred_at);
    const bin = byDay.get(day);
    if (!bin) continue; // outside range
    total += 1;
    bin.count += 1;
    // Both scales use 0..5 internally for the chart.
    // 1-5: take the peak. present-absent: any presence -> 5.
    const value =
      symptom.default_scale === 'present-absent'
        ? e.intensity > 0
          ? 5
          : 0
        : Math.max(1, Math.min(5, Math.round(e.intensity)));
    if (value > bin.peak) bin.peak = value;
  }

  return {
    symptomId: symptom.id,
    symptomName: symptom.name,
    scale: symptom.default_scale,
    bins: days.map((day) => ({ day, ...byDay.get(day)! })),
    totalEntries: total,
  };
}

/**
 * Build charts for many symptoms in one pass — what the History and
 * PrintView pages render.
 */
export function buildCharts(
  entries: Entry[],
  symptoms: Symptom[],
  fromDay: string,
  toDay: string,
): SymptomChart[] {
  return symptoms.map((s) => binEntriesByDay(entries, s, fromDay, toDay));
}

/**
 * The "today minus N days" helper. Returns local-day strings.
 */
export function lastNDays(n: number, fromIso?: string): { from: string; to: string } {
  const ref = fromIso ? new Date(fromIso) : new Date();
  const to = toLocalDay(ref.toISOString());
  const fromTs = ref.getTime() - (n - 1) * 24 * 60 * 60 * 1000;
  const from = toLocalDay(new Date(fromTs).toISOString());
  return { from, to };
}

/**
 * Group medication doses by day for the timeline strip. Same shape as
 * a symptom chart so PrintView and History can lay them out together.
 */
export interface MedTimelineBin {
  day: string;
  count: number;
}

export function binDosesByDay(
  doses: ReadonlyArray<{ taken_at: string }>,
  fromDay: string,
  toDay: string,
): MedTimelineBin[] {
  const days = dayRange(fromDay, toDay);
  const counts = new Map<string, number>();
  for (const day of days) counts.set(day, 0);
  for (const d of doses) {
    const day = toLocalDay(d.taken_at);
    if (!counts.has(day)) continue;
    counts.set(day, counts.get(day)! + 1);
  }
  return days.map((day) => ({ day, count: counts.get(day)! }));
}

/** Pretty-print a YYYY-MM-DD as e.g. "Mon 5". For tick labels. */
export function shortDayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  return `${weekday} ${d.getDate()}`;
}
