import { useState } from 'react';
import {
  addCategory,
  deleteCategory,
  renameCategory,
} from '../db/queries.ts';
import type { Category } from '../db/schema.ts';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';

export interface CategoriesProps {
  db: ShippieLocalDb;
  categories: ReadonlyArray<Category>;
  onChanged(): void;
  onToast(message: string): void;
}

export function Categories({ db, categories, onChanged, onToast }: CategoriesProps) {
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await addCategory(db, trimmed);
      setNewLabel('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow-row">
            <span>Settings</span>
          </div>
          <h1>Categories</h1>
        </div>
      </header>

      <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
        Pick categories that match how you actually spend. Delete the defaults if they don't fit.
      </p>

      {categories.length === 0 ? (
        <div className="empty-state">No categories. Add one below.</div>
      ) : (
        <div className="category-list" role="list">
          {categories.map((c) => (
            <CategoryListRow
              key={c.id}
              category={c}
              db={db}
              onChanged={onChanged}
              onToast={onToast}
            />
          ))}
        </div>
      )}

      <div className="category-add">
        <div className="field">
          <label htmlFor="new-category">Add category</label>
          <input
            id="new-category"
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Rent, Coffee, Pet"
            maxLength={40}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
          />
        </div>
        <button
          type="button"
          className="primary"
          disabled={!newLabel.trim() || busy}
          onClick={handleAdd}
        >
          Add
        </button>
      </div>
    </section>
  );
}

interface CategoryListRowProps {
  category: Category;
  db: ShippieLocalDb;
  onChanged(): void;
  onToast(message: string): void;
}

function CategoryListRow({ category, db, onChanged, onToast }: CategoryListRowProps) {
  const [label, setLabel] = useState(category.label);
  const [confirming, setConfirming] = useState(false);

  async function commit() {
    const trimmed = label.trim();
    if (!trimmed || trimmed === category.label) {
      setLabel(category.label);
      return;
    }
    await renameCategory(db, category.id, trimmed);
    onChanged();
  }

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await deleteCategory(db, category.id);
    onChanged();
    onToast(`Deleted ${category.label}. Past entries kept (uncategorised).`);
  }

  return (
    <div className="category-row" role="listitem">
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label={`Rename ${category.label}`}
      />
      <button type="button" className="danger" onClick={handleDelete}>
        {confirming ? 'Confirm delete' : 'Delete'}
      </button>
      <button
        type="button"
        className="subtle"
        onClick={() => {
          if (confirming) setConfirming(false);
        }}
        style={{ visibility: confirming ? 'visible' : 'hidden' }}
      >
        Cancel
      </button>
    </div>
  );
}
