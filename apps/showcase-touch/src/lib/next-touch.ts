/**
 * Next-touch math.
 *
 * Given a `last_touch_at` and a per-person cadence (days), figure out
 * (a) when the next touch is "due" and (b) which urgency band the
 * person is in right now.
 *
 *   overdue  → past due_at by 7+ days; surface in red on Today
 *   due-soon → within 7 days either side of due_at; amber pill
 *   fresh    → comfortably ahead of schedule; neutral pill
 *
 * "No last_touch_at recorded" is treated as overdue (you haven't
 * spoken to them since you added them — that's the whole point).
 */
import { effectiveCadenceDays } from './cadence.ts';

export type TouchBand = 'overdue' | 'due-soon' | 'fresh';

export interface NextTouchReading {
  /** ISO timestamp when the next touch is due (or null if no last touch). */
  nextTouchAt: string | null;
  /** Days until next touch (negative = overdue). */
  daysUntil: number;
  band: TouchBand;
  /** Human-friendly relative phrase: "due in 4 days", "overdue 12 days". */
  label: string;
}

const MS_PER_DAY = 86_400_000;
const SOON_WINDOW_DAYS = 7;

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function computeNextTouchAt(
  lastTouchAt: string | null | undefined,
  cadenceDays: number | null | undefined,
): string | null {
  if (!lastTouchAt) return null;
  const last = new Date(lastTouchAt).getTime();
  if (Number.isNaN(last)) return null;
  const days = effectiveCadenceDays(cadenceDays);
  return new Date(last + days * MS_PER_DAY).toISOString();
}

export function daysUntil(nextTouchAt: string | null | undefined, now: Date = new Date()): number {
  if (!nextTouchAt) return Number.NEGATIVE_INFINITY;
  const t = new Date(nextTouchAt).getTime();
  if (Number.isNaN(t)) return Number.NEGATIVE_INFINITY;
  const today = startOfUtcDay(now);
  const day = startOfUtcDay(new Date(t));
  return Math.round((day - today) / MS_PER_DAY);
}

export function bandFor(days: number): TouchBand {
  if (days <= -SOON_WINDOW_DAYS) return 'overdue';
  if (days <= SOON_WINDOW_DAYS) return 'due-soon';
  return 'fresh';
}

export function labelFor(days: number): string {
  if (days === Number.NEGATIVE_INFINITY) return 'no touches yet';
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  if (days === -1) return 'overdue 1 day';
  if (days < 0) return `overdue ${Math.abs(days)} days`;
  return `due in ${days} days`;
}

export function read(
  lastTouchAt: string | null | undefined,
  cadenceDays: number | null | undefined,
  now: Date = new Date(),
): NextTouchReading {
  const nextTouchAt = computeNextTouchAt(lastTouchAt, cadenceDays);
  const days = daysUntil(nextTouchAt, now);
  const band = nextTouchAt === null ? 'overdue' : bandFor(days);
  return { nextTouchAt, daysUntil: days, band, label: labelFor(days) };
}
