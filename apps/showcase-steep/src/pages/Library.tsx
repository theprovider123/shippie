/**
 * Herb library. Browse + search + filter by taste/action. Tap a herb
 * for the detail modal showing tradition, brewing baseline, and an
 * "Add to a blend" hint.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ActionTag, Herb, TasteTag } from '../db/schema.ts';
import { listHerbs } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';

interface LibraryProps {
  onClose: () => void;
}

const TASTE_TAGS: TasteTag[] = ['sweet', 'bitter', 'pungent', 'sour', 'salty', 'astringent'];
const ACTION_TAGS: ActionTag[] = [
  'calming',
  'warming',
  'cooling',
  'uplifting',
  'grounding',
  'digestive',
  'aromatic',
  'demulcent',
];

export function Library({ onClose }: LibraryProps) {
  const [herbs, setHerbs] = useState<Herb[] | null>(null);
  const [query, setQuery] = useState('');
  const [taste, setTaste] = useState<TasteTag | null>(null);
  const [action, setAction] = useState<ActionTag | null>(null);
  const [selected, setSelected] = useState<Herb | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listHerbs(resolveLocalDb());
      if (!cancelled) setHerbs(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!herbs) return null;
    const q = query.trim().toLowerCase();
    return herbs.filter((h) => {
      if (taste && !h.tastes.includes(taste)) return false;
      if (action && !h.actions.includes(action)) return false;
      if (q) {
        return (
          h.common_name.toLowerCase().includes(q) ||
          h.slug.includes(q) ||
          (h.latin_name?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [herbs, query, taste, action]);

  return (
    <div className="page library-page">
      <header className="page-header">
        <div>
          <h1>Herb library</h1>
          <p className="muted">{herbs?.length ?? '…'} herbs</p>
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          Back
        </button>
      </header>

      <input
        type="search"
        className="search-input"
        placeholder="Search herbs…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search herbs"
      />

      <fieldset className="library-filters">
        <legend className="visually-hidden">Filter by taste</legend>
        <div className="intent-chip-row">
          <button
            type="button"
            className={`intent-chip intent-chip-sm${taste === null ? ' active' : ''}`}
            onClick={() => setTaste(null)}
          >
            Any taste
          </button>
          {TASTE_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              className={`intent-chip intent-chip-sm${taste === t ? ' active' : ''}`}
              onClick={() => setTaste((prev) => (prev === t ? null : t))}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="library-filters">
        <legend className="visually-hidden">Filter by action</legend>
        <div className="intent-chip-row">
          <button
            type="button"
            className={`intent-chip intent-chip-sm${action === null ? ' active' : ''}`}
            onClick={() => setAction(null)}
          >
            Any action
          </button>
          {ACTION_TAGS.map((a) => (
            <button
              key={a}
              type="button"
              className={`intent-chip intent-chip-sm${action === a ? ' active' : ''}`}
              onClick={() => setAction((prev) => (prev === a ? null : a))}
            >
              {a}
            </button>
          ))}
        </div>
      </fieldset>

      {!filtered ? (
        <p className="muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="muted">No herbs match the filters.</p>
      ) : (
        <ul className="recipe-list" aria-label="Herbs">
          {filtered.map((herb) => (
            <li key={herb.id} className="recipe-card-wrapper">
              <button
                type="button"
                className="recipe-card herb-card"
                onClick={() => setSelected(herb)}
              >
                <h3>{herb.common_name}</h3>
                {herb.latin_name ? <p className="muted">{herb.latin_name}</p> : null}
                <p className="herb-card-tags">
                  {[...herb.actions, ...herb.tastes].slice(0, 4).join(' · ')}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? <HerbSheet herb={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function HerbSheet({ herb, onClose }: { herb: Herb; onClose: () => void }) {
  return (
    <div className="data-panel-backdrop" role="presentation" onClick={onClose}>
      <section
        className="data-panel"
        role="dialog"
        aria-labelledby="herb-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="data-panel-header">
          <div>
            <h2 id="herb-sheet-title">{herb.common_name}</h2>
            {herb.latin_name ? <p className="muted">{herb.latin_name}</p> : null}
          </div>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close herb detail">
            ×
          </button>
        </header>

        <dl className="data-health-grid">
          <div>
            <dt>Tastes</dt>
            <dd>{herb.tastes.join(' · ') || '—'}</dd>
          </div>
          <div>
            <dt>Actions</dt>
            <dd>{herb.actions.join(' · ') || '—'}</dd>
          </div>
          <div>
            <dt>Energetics</dt>
            <dd>{herb.energetics ?? '—'}</dd>
          </div>
          <div>
            <dt>Brew</dt>
            <dd>
              {herb.default_brew_temp_c ? `${herb.default_brew_temp_c}°C` : '—'} ·{' '}
              {herb.default_steep_minutes ? `${herb.default_steep_minutes}m` : '—'}
            </dd>
          </div>
        </dl>

        {herb.traditional_uses ? (
          <p className="herb-tradition">
            <strong>Tradition.</strong> {herb.traditional_uses}
          </p>
        ) : null}

        <p className="muted">
          To use this herb in a blend, open “New blend” and pick it from the library when you add ingredients.
        </p>
      </section>
    </div>
  );
}
