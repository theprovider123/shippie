/**
 * Modal herb picker. Used by the blend builder.
 *
 * Search across common name + slug + tradition; tap a row to select.
 * Selecting closes the picker and returns the herb to the parent.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Herb } from '../db/schema.ts';

interface HerbPickerProps {
  herbs: Herb[];
  excludeIds?: Set<string>;
  onPick: (herb: Herb) => void;
  onClose: () => void;
}

export function HerbPicker({ herbs, excludeIds, onPick, onClose }: HerbPickerProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return herbs
      .filter((h) => !excludeIds?.has(h.id))
      .filter((h) => {
        if (!q) return true;
        return (
          h.common_name.toLowerCase().includes(q) ||
          h.slug.includes(q) ||
          (h.latin_name?.toLowerCase().includes(q) ?? false) ||
          h.actions.some((a) => a.includes(q)) ||
          h.tastes.some((t) => t.includes(q))
        );
      });
  }, [herbs, excludeIds, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="data-panel-backdrop" role="presentation" onClick={onClose}>
      <section
        className="data-panel herb-picker"
        role="dialog"
        aria-labelledby="herb-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="data-panel-header">
          <div>
            <h2 id="herb-picker-title">Pick a herb</h2>
            <p>{filtered.length} of {herbs.length}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close herb picker">
            ×
          </button>
        </header>

        <input
          type="search"
          className="herb-picker-search"
          placeholder="Search herbs, tastes, actions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          aria-label="Search herbs"
        />

        <ul className="herb-picker-list" role="list">
          {filtered.map((herb) => (
            <li key={herb.id}>
              <button type="button" className="herb-picker-row" onClick={() => onPick(herb)}>
                <span className="herb-picker-name">{herb.common_name}</span>
                {herb.latin_name ? (
                  <span className="herb-picker-latin">{herb.latin_name}</span>
                ) : null}
                <span className="herb-picker-tags">
                  {herb.actions.slice(0, 3).join(' · ')}
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="muted herb-picker-empty">No herbs match.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
