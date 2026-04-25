import { useEffect, useMemo, useState } from 'react';
import { listEntries } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import type { JournalEntry } from '../db/schema.ts';
import { selectTopByMagnitude } from '../ai/cluster.ts';
import { EntryCard } from '../components/EntryCard.tsx';

interface YearInReviewProps {
  refreshKey: number;
}

export function YearInReview({ refreshKey }: YearInReviewProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
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

  const year = new Date().getFullYear();
  const inYear = useMemo(
    () => entries.filter((e) => (e.created_at ?? '').startsWith(String(year))),
    [entries, year],
  );
  const top = useMemo(() => selectTopByMagnitude(inYear, 7), [inYear]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>{year} in review</h1>
        <span className="muted">{inYear.length} entries this year</span>
      </header>
      <p className="muted small">
        Extractive only — your highest-magnitude entries, peaks and valleys. No generative summary, no cloud calls.
      </p>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : top.length === 0 ? (
        <p className="muted">Not enough scored entries for {year} yet.</p>
      ) : (
        <div className="entry-grid">
          {top.map(({ entry, magnitude }) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              highlight={`magnitude ${magnitude.toFixed(2)} · ${entry.sentiment_label ?? 'unscored'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
