/**
 * Whose-day badge — the load-bearing "who has the kid right now" surface
 * for the home page.
 *
 * Voice rules: never characterise the other parent. The two states are
 * "with you" and "with the other parent" — that's it.
 */
import type { ParentRole } from '../sync/pairing.ts';
import type { ScheduleDay } from '../sync/coparent-doc.ts';

interface Props {
  viewer: ParentRole;
  today: ScheduleDay | null;
  todayLabel: string;
}

export function WhoseDayBadge({ viewer, today, todayLabel }: Props) {
  if (!today) {
    return (
      <div className="co-day-badge">
        <p className="co-page-eyebrow">Today · {todayLabel}</p>
        <h2>No schedule set for today.</h2>
        <p className="co-day-sub">Open Schedule to mark whose week this is.</p>
      </div>
    );
  }
  const withYou = today.with_parent === viewer;
  return (
    <div className="co-day-badge" data-with={withYou ? 'you' : 'other'}>
      <p className="co-page-eyebrow">Today · {todayLabel}</p>
      <h2>{withYou ? 'Today: with you.' : 'Today: with the other parent.'}</h2>
      {today.activities.length > 0 ? (
        <p className="co-day-sub">
          {today.activities.length} activit{today.activities.length === 1 ? 'y' : 'ies'} on the day.
        </p>
      ) : null}
      {today.note ? <p className="co-day-sub">{today.note}</p> : null}
    </div>
  );
}
