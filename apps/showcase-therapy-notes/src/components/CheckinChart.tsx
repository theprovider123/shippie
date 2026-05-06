/**
 * CheckinChart — small horizontal bar chart of a single metric over
 * recent days. No charting library; just <div>s with width %.
 *
 * Range: mood and anxiety are 1..5; sleep is 0..12 hours. We pass
 * `max` per chart. Empty days render as a faint placeholder so the
 * eye can see "didn't check in" without the bar disappearing.
 */
import type { Checkin } from '../db/schema.ts';

interface CheckinChartProps {
  /** Check-ins, oldest first; the chart renders left-to-right oldest-newest. */
  data: ReadonlyArray<Checkin>;
  /** Field on the Checkin to plot. */
  field: 'mood_1to5' | 'anxiety_1to5' | 'sleep_hours';
  /** Inclusive max for the bar width (1..5 or 0..12). */
  max: number;
  /** Caption / accessible label. */
  label: string;
}

export function CheckinChart({ data, field, max, label }: CheckinChartProps) {
  return (
    <figure className="checkin-chart" aria-label={label}>
      <figcaption className="checkin-chart-caption">{label}</figcaption>
      <ul className="checkin-bars">
        {data.map((c) => {
          const raw = c[field];
          const value = typeof raw === 'number' ? raw : null;
          const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
          const dayLabel = new Date(`${c.occurred_on}T00:00:00`).toLocaleDateString(undefined, {
            weekday: 'short',
          });
          return (
            <li key={c.id} className="checkin-bar-row">
              <span className="checkin-bar-day">{dayLabel}</span>
              <span className="checkin-bar-track" aria-hidden="true">
                <span
                  className={`checkin-bar-fill ${field}`}
                  style={{ width: `${pct}%` }}
                  data-empty={value === null ? 'true' : 'false'}
                />
              </span>
              <span className="checkin-bar-value">
                {value === null ? '—' : value}
              </span>
            </li>
          );
        })}
        {data.length === 0 ? (
          <li className="checkin-bar-empty muted small">No check-ins this week.</li>
        ) : null}
      </ul>
    </figure>
  );
}
