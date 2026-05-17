import type { Category, Entry } from '../db/schema.ts';
import { formatCents } from '../db/queries.ts';

export interface EntryRowProps {
  entry: Entry;
  categories: ReadonlyArray<Category>;
  onDelete?(id: string): void;
}

export function EntryRow({ entry, categories, onDelete }: EntryRowProps) {
  const category = entry.category_id
    ? categories.find((c) => c.id === entry.category_id) ?? null
    : null;
  const note = entry.note?.trim() || (category?.label ?? 'Uncategorised');
  const meta =
    [
      category?.label ?? 'Uncategorised',
      entry.kind === 'spend' ? 'spend' : 'income',
    ].join(' · ');
  const sign = entry.kind === 'spend' ? '−' : '+';
  return (
    <div className="entry-row">
      <div className="entry-main">
        <span className="entry-note">{note}</span>
        <span className="entry-meta">{meta}</span>
      </div>
      <span className={`entry-amount ${entry.kind}`}>
        {sign}
        {formatCents(entry.amount_cents, entry.currency)}
      </span>
      {onDelete ? (
        <button
          type="button"
          className="entry-delete"
          aria-label="Delete entry"
          onClick={() => onDelete(entry.id)}
        >
          ×
        </button>
      ) : (
        <span aria-hidden />
      )}
    </div>
  );
}
