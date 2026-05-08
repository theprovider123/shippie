import type { WeekStats } from '../lib/review-prompt.ts';
import { reviewLines, rampWarning } from '../lib/review-prompt.ts';
import type { Habit } from '../types.ts';

/**
 * The end-of-week prompt. Shown once per ISO week — the parent owns
 * the "have we shown this already?" gate via `lastReviewedWeek`.
 *
 * Voice rule: actionable, plain, never judgemental. The "lower the
 * target" line is offered, not pushed.
 */
export function WeeklyReviewCard({
  stats,
  habits,
  onDismiss,
  onAcknowledge,
}: {
  stats: readonly WeekStats[];
  habits: readonly Habit[];
  onDismiss: () => void;
  onAcknowledge: () => void;
}) {
  const lines = reviewLines(stats);
  const ramp = rampWarning(habits);

  return (
    <section className="review-card" role="dialog" aria-label="Weekly review">
      <header className="review-card-head">
        <h2>Weekly review</h2>
        <p className="muted">A snapshot, not a scorecard.</p>
      </header>
      <ul className="review-lines">
        {lines.slice(0, 4).map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      {ramp ? <p className="review-ramp">{ramp}</p> : null}
      <div className="review-actions">
        <button type="button" className="ghost" onClick={onDismiss}>
          Later
        </button>
        <button type="button" className="primary" onClick={onAcknowledge}>
          Got it
        </button>
      </div>
    </section>
  );
}
