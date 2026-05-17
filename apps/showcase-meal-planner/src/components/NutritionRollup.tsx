import { roundDisplay, type WeekRollup } from '../lib/nutrition-rollup.ts';

interface NutritionRollupProps {
  rollup: WeekRollup;
}

/**
 * Plain numbers, no grades. If the user wants to know they ate 14000
 * kcal across 5 dinners, here it is. If they don't, it's a quiet panel.
 */
export function NutritionRollup({ rollup }: NutritionRollupProps) {
  if (rollup.trackedSlots === 0 && rollup.untrackedSlots === 0) {
    return (
      <p className="empty">
        Plan a meal with nutrition info and the weekly totals appear here.
      </p>
    );
  }

  const { weekTotals } = rollup;
  return (
    <div className="nutri-rollup">
      <div className="nutri-week">
        <Stat label="kcal" value={roundDisplay(weekTotals.calories, 'kcal')} />
        <Stat label="protein" value={roundDisplay(weekTotals.protein, 'g')} suffix="g" />
        <Stat label="carbs" value={roundDisplay(weekTotals.carbs, 'g')} suffix="g" />
        <Stat label="fat" value={roundDisplay(weekTotals.fat, 'g')} suffix="g" />
        <Stat label="fibre" value={roundDisplay(weekTotals.fibre, 'g')} suffix="g" />
      </div>

      {rollup.untrackedSlots > 0 ? (
        <p className="caveat">
          {rollup.untrackedSlots} slot{rollup.untrackedSlots === 1 ? '' : 's'} skipped — no
          nutrition info attached. Open the slot to add per-serving numbers if you care.
        </p>
      ) : null}

      <details className="nutri-by-day">
        <summary>By day</summary>
        <ul>
          {rollup.byDay.map((d) => (
            <li key={d.day}>
              <strong>{d.day}</strong>
              <span>{roundDisplay(d.totals.calories, 'kcal')} kcal</span>
              <span className="muted">
                {roundDisplay(d.totals.protein, 'g')}p · {roundDisplay(d.totals.carbs, 'g')}c ·{' '}
                {roundDisplay(d.totals.fat, 'g')}f
              </span>
              {d.untrackedSlots > 0 ? (
                <span className="muted small">+{d.untrackedSlots} untracked</span>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="stat">
      <strong>
        {value.toLocaleString()}
        {suffix ? <small>{suffix}</small> : null}
      </strong>
      <span>{label}</span>
    </div>
  );
}
