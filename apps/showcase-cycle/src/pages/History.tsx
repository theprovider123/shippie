/**
 * History — list of past cycles with their summaries + length bars.
 *
 * Voice doc: plain. No "your beautiful cycles". Just data.
 */
import { useEffect, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { CycleBars } from '../components/CycleBars.tsx';
import { correctCycleStart, deleteCycle, listCycles, summariseCycle } from '../db/queries.ts';
import type { Cycle } from '../db/schema.ts';
import type { CycleSummary } from '../db/queries.ts';

export interface HistoryProps {
  db: ShippieLocalDb;
  refreshKey: number;
  onChange: () => void;
}

export function History({ db, refreshKey, onChange }: HistoryProps) {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [summaries, setSummaries] = useState<CycleSummary[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  async function saveStart(id: string): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate)) return;
    await correctCycleStart(db, id, editDate);
    setEditId(null);
    onChange();
  }

  async function removeCycle(id: string): Promise<void> {
    await deleteCycle(db, id);
    setConfirmDeleteId(null);
    onChange();
  }

  return (
    <section className="page history">
      <header className="page-head">
        <p className="eyebrow">History</p>
        <h1>Past cycles</h1>
        <p className="muted">Logged a start on the wrong day? Correct or remove any cycle — predictions recompute from your corrections.</p>
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
                <div className="cycle-row-head">
                  {editId === s.cycle.id ? (
                    <div className="pair-input-row">
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        aria-label="Corrected cycle start date"
                      />
                      <button type="button" onClick={() => void saveStart(s.cycle.id)}>Save</button>
                      <button type="button" className="secondary" onClick={() => setEditId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <strong>{s.cycle.started_on}</strong>
                      <small>
                        {s.cycle.length_days ? `${s.cycle.length_days}d` : 'open'} · {s.dayCount} logged{' '}
                        {s.dayCount === 1 ? 'day' : 'days'}
                      </small>
                      <div className="cycle-row-actions">
                        <button type="button" className="link-btn" onClick={() => { setEditId(s.cycle.id); setEditDate(s.cycle.started_on); }}>Correct date</button>
                        {confirmDeleteId === s.cycle.id ? (
                          <>
                            <button type="button" className="link-btn danger" onClick={() => void removeCycle(s.cycle.id)}>Confirm delete</button>
                            <button type="button" className="link-btn" onClick={() => setConfirmDeleteId(null)}>Keep</button>
                          </>
                        ) : (
                          <button type="button" className="link-btn" onClick={() => setConfirmDeleteId(s.cycle.id)}>Delete</button>
                        )}
                      </div>
                    </>
                  )}
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
