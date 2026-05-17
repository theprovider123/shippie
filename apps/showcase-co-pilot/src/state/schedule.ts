/**
 * Pure date math for the schedule. Kept separate from coparent-doc.ts
 * so it's trivially unit-testable without spinning up a Y.Doc.
 */
import type { ParentRole } from '../sync/pairing.ts';
import { isoDateOf, type ScheduleDay } from '../sync/coparent-doc.ts';

export interface WeekDay {
  iso: string;
  date: Date;
  /** true when iso === today's iso. */
  isToday: boolean;
  /** Day of week, 0 = Mon to align with weeks-start-Monday. */
  dow: number;
}

export function buildWeek(start: Date): WeekDay[] {
  const todayIso = isoDateOf(new Date());
  const out: WeekDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = isoDateOf(d);
    out.push({
      iso,
      date: d,
      isToday: iso === todayIso,
      dow: i,
    });
  }
  return out;
}

export function shiftWeek(start: Date, weeks: number): Date {
  const d = new Date(start);
  d.setDate(start.getDate() + weeks * 7);
  return d;
}

/**
 * "Swap window" — a stretch of days assigned to one parent. Useful for
 * highlighting "this is during the other parent's week" on the schedule.
 */
export interface SwapWindow {
  startISO: string;
  endISO: string;
  with_parent: ParentRole;
  /** Inclusive day count. */
  days: number;
}

export function detectSwapWindows(
  days: WeekDay[],
  schedule: ReadonlyMap<string, ScheduleDay>,
): SwapWindow[] {
  const windows: SwapWindow[] = [];
  let current: SwapWindow | null = null;
  for (const day of days) {
    const sch = schedule.get(day.iso);
    if (!sch) {
      if (current) windows.push(current);
      current = null;
      continue;
    }
    if (current && current.with_parent === sch.with_parent) {
      current.endISO = day.iso;
      current.days += 1;
    } else {
      if (current) windows.push(current);
      current = {
        startISO: day.iso,
        endISO: day.iso,
        with_parent: sch.with_parent,
        days: 1,
      };
    }
  }
  if (current) windows.push(current);
  return windows;
}

export function dayLabel(d: Date): string {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][((d.getDay() + 6) % 7)] ?? '';
}

export function dayOfMonth(d: Date): number {
  return d.getDate();
}

export function formatDateLong(d: Date): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[d.getMonth()] ?? ''} ${d.getDate()}, ${d.getFullYear()}`;
}
