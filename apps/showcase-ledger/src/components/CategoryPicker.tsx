import type { Category } from '../db/schema.ts';

export interface CategoryPickerProps {
  categories: ReadonlyArray<Category>;
  value: string | null;
  onChange(id: string | null): void;
}

/**
 * Tile picker for the user's categories. The user picks them. There is no
 * opinionated default chart of accounts beyond the four-item seed; if the
 * list is empty here, the user has deleted everything and that's fine —
 * the entry just has no category.
 */
export function CategoryPicker({ categories, value, onChange }: CategoryPickerProps) {
  return (
    <div className="field">
      <label>Category</label>
      <div className="category-grid" role="radiogroup" aria-label="Category">
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          className={`category-pill uncategorised${value === null ? ' selected' : ''}`}
          onClick={() => onChange(null)}
        >
          <span>Uncategorised</span>
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={value === c.id}
            className={`category-pill${value === c.id ? ' selected' : ''}`}
            onClick={() => onChange(c.id)}
          >
            <span>{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
