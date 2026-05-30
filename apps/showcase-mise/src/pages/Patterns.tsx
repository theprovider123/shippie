import type { Goals } from '../lib/types';
import type { Insight } from '../lib/insights';
import { InsightCard } from '../components/InsightCard';
import { clamp01, fmt } from '../lib/format';

export interface WeekDay {
  key: string;
  label: string;
  kcal: number;
  protein: number;
  logged: boolean;
}

interface Props {
  insights: Insight[];
  week: WeekDay[];
  goals: Goals;
}

export function Patterns({ insights, week, goals }: Props) {
  const maxKcal = Math.max(goals.targets.kcal, ...week.map((d) => d.kcal), 1);
  const loggedDays = week.filter((d) => d.logged);
  const avgProtein = loggedDays.length
    ? Math.round(loggedDays.reduce((s, d) => s + d.protein, 0) / loggedDays.length)
    : 0;

  return (
    <div className="stack">
      <div className="card">
        <div className="section-title">
          <span>Last 7 days</span>
          <span className="num">{avgProtein} g protein/day avg</span>
        </div>
        <div className="week">
          {week.map((d) => (
            <div className="day" key={d.key}>
              <div className="col">
                <i style={{ height: `${clamp01(d.kcal / maxKcal) * 100}%` }} />
              </div>
              <span className="kc">{d.logged ? fmt(d.kcal) : '–'}</span>
              <span className="dk">{d.label}</span>
            </div>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          Bars show energy logged each day against your {fmt(goals.targets.kcal)} kcal reference. Gaps are just unlogged days — no streak to break.
        </p>
      </div>

      <div>
        <div className="section-title">What we're noticing</div>
        {insights.length ? (
          <div className="stack">
            {insights.map((ins) => (
              <InsightCard key={ins.id} insight={ins} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <div className="big">Patterns appear as you log</div>
            <div>Log a few meals and useful, judgement-free notes will show up here.</div>
          </div>
        )}
      </div>
    </div>
  );
}
