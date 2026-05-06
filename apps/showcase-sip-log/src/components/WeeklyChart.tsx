/**
 * 7-day bar chart — ml on top, mg as a thin caffeine ribbon below.
 *
 * Surfaces patterns: "Wednesdays you average 1.4 L — 30% short. Saturdays
 * you have 4 coffees." We compute a small text summary alongside the chart
 * so users see the pattern in words too.
 */
import type { DayTotal } from '../lib/targets.ts';
import type { Targets } from '../db.ts';

interface WeeklyChartProps {
  days: DayTotal[];
  targets: Targets;
}

export function WeeklyChart({ days, targets }: WeeklyChartProps) {
  const maxMl = Math.max(targets.water_ml, ...days.map((d) => d.ml));
  const maxMg = Math.max(targets.caffeine_max_mg, ...days.map((d) => d.mg));
  const totalMl = days.reduce((s, d) => s + d.ml, 0);
  const totalMg = days.reduce((s, d) => s + d.mg, 0);
  const metDays = days.filter((d) => d.ml >= targets.water_ml).length;

  return (
    <section className="card weekly-card" aria-label="Last 7 days">
      <header className="card-header">
        <p className="eyebrow">last 7 days</p>
        <p className="small muted">
          {metDays}/7 days hit goal · avg {Math.round(totalMl / 7)} ml · {Math.round(totalMg / 7)} mg
        </p>
      </header>
      <div className="bars">
        {days.map((d) => {
          const dayLabel = new Date(`${d.key}T00:00`).toLocaleDateString(undefined, { weekday: 'short' });
          const hMl = Math.max(2, Math.round((d.ml / maxMl) * 100));
          const hMg = d.mg > 0 ? Math.max(2, Math.round((d.mg / maxMg) * 30)) : 0;
          const met = d.ml >= targets.water_ml;
          return (
            <div key={d.key} className="day" title={`${d.key} · ${d.ml} ml · ${d.mg} mg`}>
              <div className="day-bar-track">
                <div
                  className={`day-bar ${met ? 'day-bar-met' : ''}`}
                  style={{ height: `${hMl}%` }}
                />
              </div>
              <div className="day-mg-track">
                <div className="day-mg" style={{ height: `${hMg}px` }} />
              </div>
              <p className="day-label">{dayLabel}</p>
            </div>
          );
        })}
      </div>
      <p className="small muted center">
        <span className="legend">
          <span className="swatch swatch-water" /> water
        </span>
        <span className="legend">
          <span className="swatch swatch-caffeine" /> caffeine
        </span>
      </p>
    </section>
  );
}
