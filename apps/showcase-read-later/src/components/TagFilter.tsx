/**
 * Horizontal scroll bar of tag chips. Selected tag highlights; clicking
 * the active chip clears the filter. Keeps width fixed so the queue
 * card layout below doesn't shift when the count changes.
 */

interface TagFilterProps {
  tags: ReadonlyArray<{ tag: string; count: number }>;
  active: string | null;
  onSelect: (tag: string | null) => void;
}

export function TagFilter({ tags, active, onSelect }: TagFilterProps) {
  if (tags.length === 0) return null;
  return (
    <div className="tag-filter" role="toolbar" aria-label="Filter by tag">
      <button
        type="button"
        className={active === null ? 'chip active' : 'chip'}
        onClick={() => onSelect(null)}
      >
        All
      </button>
      {tags.map(({ tag, count }) => (
        <button
          key={tag}
          type="button"
          className={active === tag ? 'chip active' : 'chip'}
          onClick={() => onSelect(active === tag ? null : tag)}
        >
          #{tag} <span className="chip-count">{count}</span>
        </button>
      ))}
    </div>
  );
}
