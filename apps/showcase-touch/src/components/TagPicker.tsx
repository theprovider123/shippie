import type { Tag } from '../db/schema.ts';

interface Props {
  tags: Tag[];
  selected: ReadonlyArray<string>;
  onToggle: (tagId: string) => void;
  onCreate?: (label: string) => void;
}

export function TagPicker({ tags, selected, onToggle, onCreate }: Props) {
  return (
    <div className="tag-list">
      {tags.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tag-pick ${selected.includes(t.id) ? 'active' : ''}`}
          onClick={() => onToggle(t.id)}
        >
          {t.label}
        </button>
      ))}
      {onCreate ? (
        <button
          type="button"
          className="tag-pick"
          onClick={() => {
            const label = prompt('New tag label')?.trim();
            if (label) onCreate(label);
          }}
        >
          + tag
        </button>
      ) : null}
    </div>
  );
}
