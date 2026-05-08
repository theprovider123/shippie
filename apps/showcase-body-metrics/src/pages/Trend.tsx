/**
 * Trend page — the chart + the smoothed weekly delta + honest copy
 * about noise.
 */
import { WeightTrendChart } from '../components/WeightTrendChart.tsx';
import type { Entry, Goal } from '../lib/store.ts';
import { computeTrend, weeklyDeltaKg } from '../lib/trend.ts';

interface TrendPageProps {
  entries: readonly Entry[];
  goal: Goal | null;
}

export function TrendPage({ entries, goal }: TrendPageProps) {
  const trend = computeTrend(entries);
  const weekly = weeklyDeltaKg(entries);

  // Most recent reading vs 7-day average — surfaces water-weight noise.
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1);
  const lastSeven = sorted.slice(-7);
  const sevenAvg =
    lastSeven.length === 7
      ? lastSeven.reduce((s, e) => s + e.weightKg, 0) / 7
      : null;
  const noiseDelta = last && sevenAvg !== null ? last.weightKg - sevenAvg : null;

  return (
    <>
      <WeightTrendChart
        measurements={entries}
        goalKg={goal?.weightKg ?? null}
        goalDate={goal?.targetDate ?? null}
        windowDays={7}
      />

      <section className="trend-stats">
        <div>
          <small>Entries</small>
          <strong>{entries.length}</strong>
        </div>
        <div>
          <small>Weekly change</small>
          <strong>
            {weekly === null ? '—' : `${weekly > 0 ? '+' : ''}${weekly.toFixed(2)} kg`}
          </strong>
        </div>
        <div>
          <small>Today vs 7d avg</small>
          <strong>
            {noiseDelta === null
              ? '—'
              : `${noiseDelta > 0 ? '+' : ''}${noiseDelta.toFixed(1)} kg`}
          </strong>
        </div>
      </section>

      {trend && (
        <p className="prose">
          The dots are your daily readings; the line is the 7-day rolling
          average. Daily weight bounces with water, sleep, and what you
          ate the night before — what matters is which way the line
          drifts.
        </p>
      )}
      {!trend && (
        <p className="prose">
          We'll show a trend once you've logged seven entries. Day-to-day
          weight is noisy — water, sleep, last night's salt. Below seven
          entries, anything we calculated would be made up.
        </p>
      )}
      {noiseDelta !== null && Math.abs(noiseDelta) > 0.5 && (
        <p className="prose prose--note">
          You're {Math.abs(noiseDelta).toFixed(1)} kg
          {noiseDelta > 0 ? ' above' : ' below'} your 7-day average — most
          likely water, not actual change.
        </p>
      )}
    </>
  );
}
