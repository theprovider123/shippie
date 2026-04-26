import { useEffect, useRef, useState } from 'react';
import { shippie } from '@shippie/sdk';

// Mirror of @shippie/intelligence#RecallHit. Inlined so this app doesn't have
// to take a workspace dependency on the intelligence package directly — it
// reaches the API only via shippie.local.intelligence.recall().
interface RecallHit {
  path: string;
  viewedAt: number;
  durationMs: number;
  /** Cosine similarity in [-1, 1]. */
  relevance: number;
  excerpt: string;
}

// shippie.local in the published .d.ts hasn't yet caught up with the
// intelligence surface that ships in src/local.ts. The runtime exposes
// `intelligence.recall(...)`; we narrow access here so the showcase typechecks
// without modifying SDK internals (other agents may be in flight there).
interface IntelligenceBridge {
  recall(opts: {
    query: string;
    timeframe?: { sinceMs: number };
    limit?: number;
  }): Promise<RecallHit[]>;
}
function getIntelligence(): IntelligenceBridge {
  const local = (shippie as unknown as { local: { intelligence?: IntelligenceBridge } }).local;
  if (!local || typeof local.intelligence?.recall !== 'function') {
    throw new Error('shippie.local.intelligence is not available');
  }
  return local.intelligence;
}

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const DEBOUNCE_MS = 400;
const RESULT_LIMIT = 8;
const EXCERPT_MAX = 180;

function truncate(text: string, max: number): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function formatViewedAt(ts: number): string {
  try {
    return new Date(ts).toISOString();
  } catch {
    return String(ts);
  }
}

export function Recall() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<RecallHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const runRecall = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setHits(null);
      setError(null);
      return;
    }
    const seq = ++requestSeq.current;
    setSearching(true);
    setError(null);
    try {
      const result = await getIntelligence().recall({
        query: trimmed,
        timeframe: { sinceMs: Date.now() - TWO_WEEKS_MS },
        limit: RESULT_LIMIT,
      });
      if (seq !== requestSeq.current) return;
      setHits(result);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Recall is unavailable right now.';
      setError(`Recall couldn’t reach the on-device AI bridge. ${message}`);
      setHits(null);
    } finally {
      if (seq === requestSeq.current) setSearching(false);
    }
  };

  // Debounced auto-search as the user types.
  useEffect(() => {
    if (!query.trim()) {
      setHits(null);
      setError(null);
      return;
    }
    const handle = setTimeout(() => {
      void runRecall(query);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runRecall(query);
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Recall</h1>
      </header>
      <form className="search-form" onSubmit={handleSubmit}>
        <input
          type="search"
          className="search-input"
          placeholder="What were you reading about lately?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Recall query"
        />
        <button type="submit" className="primary" disabled={searching || !query.trim()}>
          {searching ? 'Recalling…' : 'Recall'}
        </button>
      </form>
      <p className="muted small">
        Recall searches your on-device page-view log from the last two weeks. Embeddings are computed
        locally; nothing leaves the device.
      </p>

      {error ? (
        <p className="muted small" role="status">
          {error}
        </p>
      ) : null}

      {!error && hits === null ? (
        <p className="muted">Type to search what you&rsquo;ve viewed in the past 2 weeks.</p>
      ) : null}

      {!error && hits !== null && hits.length === 0 ? (
        <p className="muted">No matching views in the past two weeks.</p>
      ) : null}

      {!error && hits !== null && hits.length > 0 ? (
        <div className="entry-grid">
          {hits.map((hit, i) => {
            const relevance = Math.max(0, Math.min(1, hit.relevance));
            return (
              <article
                key={`${hit.path}-${hit.viewedAt}-${i}`}
                className="entry-card"
                aria-label={`Recall hit for ${hit.path}`}
              >
                <header className="entry-card-header">
                  <span className="entry-card-topic">{hit.path}</span>
                  <time className="entry-card-date" dateTime={formatViewedAt(hit.viewedAt)}>
                    {formatViewedAt(hit.viewedAt)}
                  </time>
                </header>
                {hit.excerpt ? (
                  <p className="entry-card-body">{truncate(hit.excerpt, EXCERPT_MAX)}</p>
                ) : (
                  <p className="entry-card-body muted">(no excerpt indexed)</p>
                )}
                <progress
                  max={1}
                  value={relevance}
                  aria-label={`relevance ${(relevance * 100).toFixed(0)} percent`}
                />
                <p className="entry-card-highlight">relevance {(relevance * 100).toFixed(0)}%</p>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
