/**
 * Dough schedule generator — pure, deterministic.
 *
 * Given a start time and a target cold-fermentation length, lay out
 * the milestones a home baker actually wants on the counter:
 *   - mix      → start
 *   - fold #1  → start + 30 min
 *   - fold #2  → start + 60 min
 *   - shape    → start + 4h (bulk ferment)
 *   - cold     → start + 4h (into fridge)
 *   - bake     → start + cold_hours
 *
 * Bulk ferment defaults to 4 hours unless told otherwise. Cold hours
 * are passed in and represent the *total* time from start to bake —
 * so a `cold_hours = 12` schedule mixes at 5 PM and bakes at 5 AM.
 *
 * No clocks, no timezones. The function takes a Date in, returns
 * Dates out. UI does the formatting.
 */

export interface ScheduleInput {
  start: Date;
  cold_hours: number;
  bulk_hours?: number;
}

export interface ScheduleStep {
  key: 'mix' | 'fold-1' | 'fold-2' | 'shape' | 'cold-rest' | 'bake';
  label: string;
  at: Date;
  /** Notes the home baker can use right at that moment. */
  hint: string;
}

export const COLD_HOURS_MIN = 1;
export const COLD_HOURS_MAX = 72;

export function clampColdHours(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 12;
  return Math.max(COLD_HOURS_MIN, Math.min(COLD_HOURS_MAX, Math.round(n * 10) / 10));
}

export function buildSchedule(input: ScheduleInput): ScheduleStep[] {
  const start = new Date(input.start.getTime());
  const cold = clampColdHours(input.cold_hours);
  const bulk = input.bulk_hours ?? Math.min(4, cold * 0.4);
  const bake = new Date(start.getTime() + cold * 3_600_000);

  const at = (mins: number) => new Date(start.getTime() + mins * 60_000);

  const steps: ScheduleStep[] = [
    { key: 'mix', label: 'Mix', at: start, hint: 'Combine flour, water, leaven. Rest 30 min.' },
    { key: 'fold-1', label: 'Fold 1', at: at(30), hint: 'Add salt. Stretch and fold four times.' },
    { key: 'fold-2', label: 'Fold 2', at: at(60), hint: 'Stretch and fold again. Cover.' },
    {
      key: 'shape',
      label: 'Shape',
      at: at(bulk * 60),
      hint: 'Pre-shape, rest 20 min, then final shape into a banneton.',
    },
    {
      key: 'cold-rest',
      label: 'Cold rest',
      at: at(bulk * 60 + 20),
      hint: 'Into the fridge until bake time. Cold and slow develops flavour.',
    },
    {
      key: 'bake',
      label: 'Bake',
      at: bake,
      hint: 'Preheat 30 min before. Bake covered 20 min, lid off 20 more.',
    },
  ];

  return steps;
}

/** Format an ISO datetime to "Mon 5:42 PM" — used by the UI. */
export function formatStepTime(d: Date, locale = 'en-US'): string {
  return d.toLocaleString(locale, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
