/**
 * History — last 7 days at a glance + each day's totals expandable.
 *
 * The chart is the headline. Below it, a list of each day's totals
 * with a tap to expand to that day's individual sips for review/edit.
 */
import { useState } from 'react';
import { WeeklyChart } from '../components/WeeklyChart.tsx';
import { DrinkRow } from '../components/DrinkRow.tsx';
import type { Sip, Targets } from '../db.ts';
import { dayKey } from '../db.ts';
import { last7Days } from '../lib/targets.ts';

interface HistoryProps {
  sips: Sip[];
  targets: Targets;
  onUpdate: (id: string, patch: Partial<Omit<Sip, 'id'>>) => void;
  onRemove: (id: string) => void;
}

export function History({ sips, targets, onUpdate, onRemove }: HistoryProps) {
  const days = last7Days(sips);
  const [openDay, setOpenDay] = useState<string | null>(null);

  return (
    <div className="history">
      <WeeklyChart days={days} targets={targets} />
      <section className="card" aria-label="Day-by-day breakdown">
        <p className="eyebrow">browse days</p>
        <ul className="day-list">
          {[...days].reverse().map((d) => {
            const met = d.ml >= targets.water_ml;
            const open = openDay === d.key;
            const sipsForDay = sips
              .filter((s) => dayKey(s.logged_at) === d.key)
              .sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());
            return (
              <li key={d.key} className={`day-item ${open ? 'day-item-open' : ''}`}>
                <button
                  type="button"
                  className="day-summary"
                  onClick={() => setOpenDay(open ? null : d.key)}
                  aria-expanded={open}
                >
                  <span className="day-key">{d.key}</span>
                  <span className={`day-totals ${met ? 'day-totals-met' : ''}`}>
                    {d.ml} ml{d.mg > 0 ? ` · ${d.mg} mg` : ''}
                  </span>
                </button>
                {open ? (
                  sipsForDay.length === 0 ? (
                    <p className="muted small drink-empty">nothing logged.</p>
                  ) : (
                    <ul className="drink-list">
                      {sipsForDay.map((s) => (
                        <DrinkRow key={s.id} sip={s} onUpdate={onUpdate} onRemove={onRemove} />
                      ))}
                    </ul>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
