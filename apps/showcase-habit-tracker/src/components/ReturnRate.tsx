import { returnPhrase, type ReturnStats } from '../lib/return-rate.ts';

/**
 * The anti-streak metric. Displayed alongside (not instead of) current
 * streak, so the user sees both shapes of consistency.
 *
 * Voice rule: "you average 4 days a week" not "consistency: 57%".
 */
export function ReturnRate({ stats }: { stats: ReturnStats }) {
  return (
    <div className="return-rate" aria-label="Return rate over the last 4 weeks">
      <span className="return-rate-value">{returnPhrase(stats)}</span>
      <span className="return-rate-foot">
        {stats.activeDays} active day{stats.activeDays === 1 ? '' : 's'} · {stats.returns} return
        {stats.returns === 1 ? '' : 's'}
      </span>
    </div>
  );
}
