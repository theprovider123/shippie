import { useEffect, useMemo, useState } from 'react';
import type { JournalEntry, Topic } from '../db/schema.ts';
import { TOPIC_LABELS } from '../db/schema.ts';
import { listEntries } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import { EntryCard } from '../components/EntryCard.tsx';
import { groupByTopic } from '../ai/cluster.ts';

interface BrowseProps {
  refreshKey: number;
}

const FILTERS: Array<{ id: Topic | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  ...TOPIC_LABELS.map((t) => ({ id: t as Topic, label: t.charAt(0).toUpperCase() + t.slice(1) })),
];

export function Browse({ refreshKey }: BrowseProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [filter, setFilter] = useState<Topic | 'all'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const rows = await listEntries(resolveLocalDb());
      if (!cancelled) {
        setEntries(rows);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const grouped = useMemo(() => groupByTopic(entries), [entries]);
  const filtered = filter === 'all' ? entries : grouped.get(filter) ?? [];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Entries</h1>
        <span className="muted">{entries.length} total</span>
      </header>
      <div className="filter-row" role="tablist" aria-label="Filter by topic">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            type="button"
            className={`pill ${filter === f.id ? 'pill-active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {f.id !== 'all' ? (
              <span className="pill-count">{grouped.get(f.id)?.length ?? 0}</span>
            ) : null}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="muted">No entries{filter === 'all' ? ' yet' : ` in ${filter}`}.</p>
      ) : (
        <div className="entry-grid">
          {filtered.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}
