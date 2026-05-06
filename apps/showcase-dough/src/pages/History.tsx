import { useMemo } from 'react';
import type { Bake } from '../db.ts';
import { completedBakes } from '../db.ts';
import { formatDayClock } from '../lib/schedule.ts';

interface Props {
  bakes: Bake[];
  onCancel: () => void;
}

export function History({ bakes, onCancel }: Props) {
  const list = useMemo(() => completedBakes(bakes), [bakes]);

  return (
    <main className="app">
      <header className="page-header">
        <button type="button" className="back" onClick={onCancel}>
          ← Back
        </button>
        <h1>History</h1>
        <p className="subtitle">{list.length} logged {list.length === 1 ? 'bake' : 'bakes'}</p>
      </header>

      {list.length === 0 ? (
        <p className="muted empty">
          No completed bakes yet. Log an outcome on a finished bake and it shows
          up here, ready to compare against the next one.
        </p>
      ) : (
        <ul className="history-list">
          {list.map((b) => {
            const o = b.outcome;
            return (
              <li key={b.id} className="history-item">
                <div className="history-head">
                  <strong>{b.recipe_name}</strong>
                  <span className="muted small">
                    {formatDayClock(new Date(b.finished_at ?? b.started_at))}
                  </span>
                </div>
                <p className="muted small history-meta">
                  {b.total_g}g · {b.recipe_snapshot.hydration}% hydration ·{' '}
                  {b.recipe_snapshot.flours
                    .map((f) => `${f.pct}% ${f.kind}`)
                    .join(' / ')}
                </p>
                {o ? (
                  <>
                    <div className="history-ratings">
                      <span>Crumb {'★'.repeat(o.crumb_rating)}</span>
                      <span>Crust {'★'.repeat(o.crust_rating)}</span>
                    </div>
                    {o.notes ? <p className="history-notes">{o.notes}</p> : null}
                    {o.photo_url ? (
                      <img
                        className="history-photo"
                        src={o.photo_url}
                        alt={`${b.recipe_name} crumb`}
                        loading="lazy"
                      />
                    ) : null}
                  </>
                ) : (
                  <p className="muted small">No outcome logged.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
