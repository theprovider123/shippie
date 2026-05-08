/**
 * Goal projection card. Pulls projection from `lib/goal-projection.ts`
 * and renders the honest copy.
 */
import { describeProjection, projectGoal } from '../lib/goal-projection.ts';
import type { Goal } from '../lib/store.ts';
import type { Measurement } from '../lib/trend.ts';

interface GoalProjectionCardProps {
  goal: Goal;
  measurements: readonly Measurement[];
  onEdit?: () => void;
}

export function GoalProjectionCard({ goal, measurements, onEdit }: GoalProjectionCardProps) {
  const projection = projectGoal(goal, measurements);
  const text = describeProjection(projection, goal);

  return (
    <section className="goal-card" data-status={projection.status}>
      <header>
        <strong>Goal</strong>
        <span>
          {goal.weightKg.toFixed(1)} kg by {goal.targetDate}
        </span>
        {onEdit && (
          <button type="button" className="ghost-btn" onClick={onEdit}>
            Edit
          </button>
        )}
      </header>
      <p className="goal-card__copy">{text}</p>
      <dl className="goal-card__stats">
        <div>
          <dt>Required</dt>
          <dd>
            {projection.requiredDeltaKg > 0 ? '+' : ''}
            {projection.requiredDeltaKg.toFixed(1)} kg
          </dd>
        </div>
        <div>
          <dt>Pace needed</dt>
          <dd>
            {projection.requiredWeeklyKg > 0 ? '+' : ''}
            {projection.requiredWeeklyKg.toFixed(2)} kg/wk
          </dd>
        </div>
        <div>
          <dt>Current pace</dt>
          <dd>
            {projection.currentWeeklyKg === null
              ? '—'
              : `${projection.currentWeeklyKg > 0 ? '+' : ''}${projection.currentWeeklyKg.toFixed(2)} kg/wk`}
          </dd>
        </div>
      </dl>
    </section>
  );
}
