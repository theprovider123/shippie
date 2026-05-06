/**
 * History — list of past cycles with their summaries + length bars.
 *
 * Voice doc: plain. No "your beautiful cycles". Just data.
 */
import { useEffect, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { CycleBars } from '../components/CycleBars.tsx';
import { listCycles, summariseCycle } from '../db/queries.ts';
import type { Cycle } from '../db/schema.ts';
import type { CycleSummary } from '../db/queries.ts';

export interface HistoryProps {
  db: ShippieLocalDb;
  refreshKey: number;
}

export function History({ db, refreshKey }: HistoryProps) {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [summaries, setSummaries] = useState<CycleSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await listCycles(db);
      if (cancelled) return;
      setCycles(all);
      const sums: CycleSummary[] = [];
      for (const c of all) {
        const s = await summariseCycle(db, c.id);
        if (s) sums.push(s);
      }
      if (!cancelled) setSummaries(sums);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, refreshKey]);

  return (
    <section className="page history">
      <header className="page-head">
        <p className="eyebrow">History</p>
        <h1>Past cycles</h1>
      </header>

      <CycleBars cycles={cycles} />

      {summaries.length === 0 ? (
        <p className="empty">No cycles logged yet.</p>
      ) : (
        <ol className="cycle-list">
          {summaries.map((s) => {
            const top = topSymptoms(s.symptomFrequency);
            return (
              <li key={s.cycle.id} className="cycle-row">
                <div>
                  <strong>{s.cycle.started_on}</strong>
                  <small>
                    {s.cycle.length_days ? `${s.cycle.length_days}d` : 'open'} - {s.dayCount} logged{' '}
                    {s.dayCount === 1 ? 'day' : 'days'}
                  </small>
                </div>
                {top.length > 0 ? (
                  <ul className="cycle-symptoms" aria-label="Most-recorded symptoms">
                    {top.map(([key, count]) => (
                      <li key={key}>
                        <span>{prettySymptom(key)}</span>
                        <em>{count}x</em>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No symptoms logged.</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function topSymptoms(freq: Record<string, number>): Array<[string, number]> {
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
}

function prettySymptom(key: string): string {
  return key === 'breast-tenderness' ? 'breast tenderness' : key;
}
