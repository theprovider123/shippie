/**
 * History — finished cooks, grouped by method. "Last 5 briskets" surface.
 * Each entry shows rating + note, the things you actually want to read
 * back before the next attempt.
 */

import { useMemo, useState } from 'react';
import { METHOD_LABEL, type Method } from '../data.ts';
import type { Cook } from '../db.ts';

type MethodFilter = Method | 'all';

interface HistoryProps {
  cooks: ReadonlyArray<Cook>;
}

export function History({ cooks }: HistoryProps) {
  const [filter, setFilter] = useState<MethodFilter>('all');

  const finished = useMemo(
    () => cooks.filter((c) => c.finished_at !== null),
    [cooks],
  );

  const visible = useMemo(
    () => (filter === 'all' ? finished : finished.filter((c) => c.method === filter)),
    [finished, filter],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: finished.length };
    for (const c of finished) map[c.method] = (map[c.method] ?? 0) + 1;
    return map;
  }, [finished]);

  const methods: ReadonlyArray<MethodFilter> = ['all', 'sous-vide', 'smoke', 'roast', 'grill', 'pan'];

  if (finished.length === 0) {
    return (
      <section className="empty">
        <p className="eyebrow">history</p>
        <p className="muted">Nothing cooked yet. Mark one done — rating + note get saved here.</p>
      </section>
    );
  }

  return (
    <section className="history">
      <header>
        <p className="eyebrow">history · {finished.length} cooks</p>
      </header>

      <div className="history-filter">
        {methods.map((m) => (
          <button
            key={m}
            type="button"
            className={`method-chip ${m === filter ? 'active' : ''}`}
            onClick={() => setFilter(m)}
            disabled={(counts[m] ?? 0) === 0 && m !== 'all'}
          >
            {m === 'all' ? 'All' : METHOD_LABEL[m]}
            <span className="muted small">{counts[m] ?? 0}</span>
          </button>
        ))}
      </div>

      <ul className="history-list">
        {visible.map((c) => (
          <li key={c.id}>
            <div className="history-head">
              <strong>{c.cut_name}</strong>
              <span className="muted small">
                {METHOD_LABEL[c.method]}
                {c.doneness ? ` · ${c.doneness}` : ''}
                {c.weight_kg ? ` · ${c.weight_kg} kg` : ''}
              </span>
            </div>
            <div className="history-meta muted small">
              {c.finished_at
                ? `finished ${new Date(c.finished_at).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : ''}
              {' · '}target {c.target_temp_c}°C
            </div>
            {c.rating ? (
              <div className="history-rating" aria-label={`${c.rating} stars`}>
                {'★'.repeat(c.rating)}
                <span className="history-rating-empty">{'★'.repeat(5 - c.rating)}</span>
              </div>
            ) : null}
            {c.note ? <p className="history-note">{c.note}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
