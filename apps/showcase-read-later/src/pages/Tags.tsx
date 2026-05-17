/**
 * Tags overview — every tag in use, count, and a click-through to the
 * Queue filtered by it.
 */
import { useMemo } from 'react';
import type { ReadLaterState } from '../lib/types.ts';
import { aggregateTags } from '../lib/tags.ts';

interface TagsProps {
  state: ReadLaterState;
  onSelectTag: (tag: string) => void;
}

export function Tags({ state, onSelectTag }: TagsProps) {
  const rollup = useMemo(() => aggregateTags(state.articles), [state.articles]);
  return (
    <main className="tags-page">
      <header>
        <h1>Tags</h1>
        <p className="muted">Click a tag to see the queue filtered by it.</p>
      </header>
      {rollup.length === 0 ? (
        <p className="empty">No tags yet. Open an article to add some.</p>
      ) : (
        <ul className="tag-list">
          {rollup.map(({ tag, count }) => (
            <li key={tag}>
              <button type="button" onClick={() => onSelectTag(tag)}>
                <strong>#{tag}</strong>
                <small>{count} article{count === 1 ? '' : 's'}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
