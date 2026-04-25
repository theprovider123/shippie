import { useEffect, useState } from 'react';
import { listEntries } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import { embed } from '../ai/embed.ts';
import { rankByCosine, toFloat32 } from '../ai/cluster.ts';
import type { JournalEntry } from '../db/schema.ts';
import { EntryCard } from '../components/EntryCard.tsx';

interface RankedEntry {
  entry: JournalEntry;
  score: number;
}

export function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RankedEntry[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Pre-decode any blob embeddings so cosine math is hot when the user types.
  const [allEntries, setAllEntries] = useState<Array<JournalEntry & { embedding: Float32Array | null }>>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await listEntries(resolveLocalDb());
      const decoded = rows.map((r) => ({ ...r, embedding: toFloat32(r.embedding) }));
      if (!cancelled) setAllEntries(decoded);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const vector = await embed(query);
      const ranked = rankByCosine(vector, allEntries, 12);
      setResults(ranked);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Search</h1>
      </header>
      <form className="search-form" onSubmit={handleSearch}>
        <input
          type="search"
          className="search-input"
          placeholder='Try "when was I last anxious about work"'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Semantic search query"
        />
        <button type="submit" className="primary" disabled={searching || !query.trim()}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>
      <p className="muted small">
        Semantic search runs entirely on-device using local embeddings. Your query never leaves the device.
      </p>
      {results === null ? null : results.length === 0 ? (
        <p className="muted">No entries with embeddings yet — write a few entries first.</p>
      ) : (
        <div className="entry-grid">
          {results.map(({ entry, score }) => (
            <EntryCard key={entry.id} entry={entry} highlight={`relevance ${(score * 100).toFixed(0)}%`} />
          ))}
        </div>
      )}
    </div>
  );
}
