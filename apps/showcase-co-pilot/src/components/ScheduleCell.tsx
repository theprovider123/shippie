/**
 * One cell in the week grid.
 *
 * Shows day-of-week, day-of-month, and a tiny "with" pill. Clickable —
 * passes ISO date up to the parent so the SchedulePage can open a
 * day-detail editor.
 */
import type { ParentRole } from '../sync/pairing.ts';
import type { ScheduleDay } from '../sync/coparent-doc.ts';
import { dayLabel, dayOfMonth, type WeekDay } from '../state/schedule.ts';

interface Props {
  day: WeekDay;
  schedule: ScheduleDay | null;
  viewer: ParentRole;
  onSelect: (iso: string) => void;
}

export function ScheduleCell({ day, schedule, viewer, onSelect }: Props) {
  const withCode: 'a' | 'b' | undefined = schedule?.with_parent;
  const withLabel = !withCode
    ? '·'
    : withCode === viewer
      ? 'you'
      : 'other';
  return (
    <button
      type="button"
      className="co-week-cell"
      data-with={withCode ?? ''}
      data-today={day.isToday}
      onClick={() => onSelect(day.iso)}
      aria-label={`${dayLabel(day.date)} ${dayOfMonth(day.date)}, ${
        withCode ? `with ${withLabel === 'you' ? 'you' : 'the other parent'}` : 'unset'
      }`}
    >
      <span className="co-week-dow">{dayLabel(day.date)}</span>
      <span className="co-week-num">{dayOfMonth(day.date)}</span>
      <span className="co-week-with">{withLabel}</span>
    </button>
  );
}
