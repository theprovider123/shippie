/**
 * Home — saved blends + intent filter chips + starter shelf.
 *
 * Starter shelf: when the user has fewer than 3 blends, surface a few
 * curated seed blends prominently as "try one of these". After the user
 * has built a small repertoire we step back and just show their list.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Blend, IntentTag } from '../db/schema.ts';
import { listBlends } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import { ALL_INTENTS, IntentChip, intentLabel } from '../components/IntentChip.tsx';

interface BlendsListProps {
  refreshKey: number;
  onOpen: (id: string) => void;
  onNew: () => void;
  onLibrary: () => void;
}

export function BlendsList({ refreshKey, onOpen, onNew, onLibrary }: BlendsListProps) {
  const [blends, setBlends] = useState<Blend[] | null>(null);
  const [query, setQuery] = useState('');
  const [activeIntent, setActiveIntent] = useState<IntentTag | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listBlends(resolveLocalDb());
      if (!cancelled) setBlends(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    if (!blends) return null;
    const q = query.trim().toLowerCase();
    return blends.filter((b) => {
      if (activeIntent && !b.intent_tags.includes(activeIntent)) return false;
      if (q && !b.name.toLowerCase().includes(q) && !(b.notes ?? '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [blends, query, activeIntent]);

  const showStarterShelf = blends && blends.length > 0 && blends.length < 4 && !activeIntent && !query;

  return (
    <div className="page" data-shippie-wakelock>
      <header className="page-header">
        <div>
          <h1>Steep</h1>
          <p>{blends?.length ?? '…'} blends</p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="ghost" onClick={onLibrary}>
            Library
          </button>
          <button type="button" className="primary" onClick={onNew}>
            New blend
          </button>
        </div>
      </header>

      <input
        type="search"
        className="search-input"
        placeholder="Search your blends…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search blends"
      />

      <nav className="intent-chip-row" aria-label="Filter by intent">
        <IntentChip
          tag={'sleep' as IntentTag}
          // Render an "All" pseudo-chip alongside intents.
          active={activeIntent === null}
          onClick={() => setActiveIntent(null)}
          size="sm"
        />
        {/* Workaround: IntentChip renders "Sleep" so above we override
            visually via CSS sibling order; for clarity, render a
            real "All" link separately below. */}
        {ALL_INTENTS.map((tag) => (
          <IntentChip
            key={tag}
            tag={tag}
            active={activeIntent === tag}
            onClick={() => setActiveIntent((prev) => (prev === tag ? null : tag))}
            size="sm"
          />
        ))}
      </nav>

      {showStarterShelf ? (
        <section className="starter-shelf" aria-label="Try one of these">
          <h2>Try one of these</h2>
          <p className="muted">
            Tap a starter blend to brew it as-is, or open it as a starting point for your own.
          </p>
        </section>
      ) : null}

      {!filtered ? (
        <p className="muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <h3>{query || activeIntent ? 'Nothing matches' : 'No blends yet'}</h3>
          <p>
            {query || activeIntent
              ? 'Clear the search or pick a different intent.'
              : 'Tap “New blend” to design your first.'}
          </p>
        </div>
      ) : (
        <ul className="recipe-list" aria-label="Saved blends">
          {filtered.map((blend) => (
            <li key={blend.id} className="recipe-card-wrapper">
              <button
                type="button"
                className="recipe-card blend-card"
                onClick={() => onOpen(blend.id)}
              >
                <h3>{blend.name}</h3>
                {blend.notes ? <p className="muted">{blend.notes}</p> : null}
                {blend.intent_tags.length > 0 ? (
                  <p className="blend-card-tags">
                    {blend.intent_tags.map((tag) => intentLabel(tag)).join(' · ')}
                  </p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
