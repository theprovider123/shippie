/**
 * CycleBars — variability chart. One horizontal bar per past closed
 * cycle. Bar length ∝ length_days. The visual purpose is to show
 * stability/variability at a glance.
 */
import type { Cycle } from '../db/schema.ts';

export interface CycleBarsProps {
  cycles: ReadonlyArray<Cycle>;
}

export function CycleBars({ cycles }: CycleBarsProps) {
  const closed = cycles.filter((c): c is Cycle & { length_days: number } =>
    typeof c.length_days === 'number' && c.length_days > 0,
  );
  if (closed.length === 0) {
    return <p className="empty">Logging two cycles back to back is enough to start showing length.</p>;
  }
  const max = Math.max(...closed.map((c) => c.length_days), 30);
  return (
    <ol className="cycle-bars" aria-label="Past cycle lengths">
      {closed.map((c) => {
        const pct = Math.round((c.length_days / max) * 100);
        return (
          <li key={c.id}>
            <span className="bar-label">{c.started_on}</span>
            <span className="bar-track" aria-hidden="true">
              <span className="bar-fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="bar-value">{c.length_days}d</span>
          </li>
        );
      })}
    </ol>
  );
}
