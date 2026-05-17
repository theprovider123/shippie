import { useMemo, useState } from 'react';
import { MemoCard } from '../components/MemoCard.tsx';
import { search } from '../lib/search.ts';
import type { Memo } from '../lib/store.ts';
import { tagsSummary } from '../lib/store.ts';

interface Props {
  memos: Memo[];
  onOpenMemo: (id: string) => void;
}

export function SearchPage({ memos, onOpenMemo }: Props) {
  const [query, setQuery] = useState('');
  const tags = useMemo(() => tagsSummary(memos).slice(0, 8), [memos]);
  const results = useMemo(() => search(memos, query), [memos, query]);

  return (
    <section className="page vm-search-page">
      <header className="page-header">
        <h2>Search</h2>
        <span className="muted small">
          {results.length} of {memos.length}
        </span>
      </header>

      <input
        type="search"
        className="vm-search-input"
        placeholder="search transcripts…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {tags.length > 0 && !query ? (
        <div className="vm-tag-cloud">
          {tags.map(({ tag, count }) => (
            <button key={tag} type="button" className="vm-tag-chip" onClick={() => setQuery(tag)}>
              <span>{tag}</span>
              <span className="muted small">{count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {results.length === 0 ? (
        <p className="empty">
          {query ? 'No memos match.' : 'Record your first memo to see it here.'}
        </p>
      ) : (
        <ul className="vm-memo-list">
          {results.map(({ memo }) => (
            <li key={memo.id}>
              <MemoCard memo={memo} onOpen={onOpenMemo} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
