/**
 * Search page — full-text scan over titles + bodies + tags +
 * highlights. Local-only.
 */
import { useMemo, useState } from 'react';
import type { ReadLaterState } from '../lib/types.ts';
import { search, searchHighlights } from '../lib/search.ts';

interface SearchProps {
  state: ReadLaterState;
  onOpen: (id: string) => void;
}

export function Search({ state, onOpen }: SearchProps) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'articles' | 'highlights'>('articles');

  const articleResults = useMemo(
    () => search(query, state.articles, state.highlights),
    [query, state.articles, state.highlights],
  );
  const highlightResults = useMemo(
    () => searchHighlights(query, state.highlights, state.articles),
    [query, state.highlights, state.articles],
  );

  return (
    <main className="search-page">
      <header>
        <h1>Search</h1>
        <p className="muted">Local search across saved articles, tags, and your highlights. Never goes to network.</p>
      </header>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
        aria-label="Search query"
        autoFocus
      />
      <div className="search-mode">
        <button
          type="button"
          className={mode === 'articles' ? 'chip active' : 'chip'}
          onClick={() => setMode('articles')}
        >
          Articles ({articleResults.length})
        </button>
        <button
          type="button"
          className={mode === 'highlights' ? 'chip active' : 'chip'}
          onClick={() => setMode('highlights')}
        >
          Highlights ({highlightResults.length})
        </button>
      </div>
      {query.trim() === '' ? (
        <p className="empty">Type to search.</p>
      ) : mode === 'articles' ? (
        articleResults.length === 0 ? (
          <p className="empty">No matches.</p>
        ) : (
          <ul className="search-results">
            {articleResults.map(({ article, snippet, matchedIn }) => (
              <li key={article.id}>
                <button type="button" onClick={() => onOpen(article.id)}>
                  <strong>{article.title}</strong>
                  <small className="match-where">match in {matchedIn}</small>
                  {snippet ? <p className="snippet">{snippet}</p> : null}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : highlightResults.length === 0 ? (
        <p className="empty">No matching highlights.</p>
      ) : (
        <ul className="search-results">
          {highlightResults.map(({ highlight, article }) => (
            <li key={highlight.id}>
              <button
                type="button"
                onClick={() => article && onOpen(article.id)}
                disabled={!article}
              >
                <p className="snippet">"{highlight.text}"</p>
                {highlight.note ? <p className="muted">— {highlight.note}</p> : null}
                <small className="match-where">{article?.title ?? 'Unknown article'}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
