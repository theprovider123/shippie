import { useEffect, useState } from 'react';
import {
  addIngredient,
  createRecipe,
  deleteIngredient,
  distinctIngredientNames,
  getRecipe,
  updateRecipe,
} from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import type { RecipeWithIngredients } from '../db/schema.ts';
import { AutocompleteInput } from '../components/AutocompleteInput.tsx';
import { isAvailable as isScanAvailable, scanBarcode } from '../api/scan-barcode.ts';
import { lookupBarcode } from '../api/open-food-facts.ts';
import { haptic } from '@shippie/sdk/wrapper';

interface RecipeEditProps {
  recipeId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

interface DraftIngredient {
  id: string;
  name: string;
  amount: string;
  unit: string;
  brand?: string;
  barcode?: string;
}

const tempId = () =>
  `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function RecipeEdit({ recipeId, onClose, onSaved }: RecipeEditProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [servings, setServings] = useState<number | ''>('');
  const [cookMinutes, setCookMinutes] = useState<number | ''>('');
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([
    { id: tempId(), name: '', amount: '', unit: '' },
  ]);
  const [persistedIds, setPersistedIds] = useState<Set<string>>(new Set());
  const [candidates, setCandidates] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const scanAvailable = isScanAvailable();

  useEffect(() => {
    let cancelled = false;
    const db = resolveLocalDb();
    (async () => {
      const names = await distinctIngredientNames(db);
      if (!cancelled) setCandidates(names);
      if (recipeId) {
        const existing = await getRecipe(db, recipeId);
        if (existing && !cancelled) hydrate(existing);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  const hydrate = (existing: RecipeWithIngredients) => {
    setTitle(existing.title);
    setNotes(existing.notes ?? '');
    setServings(existing.servings ?? '');
    setCookMinutes(existing.cook_minutes ?? '');
    const draft = existing.ingredients.map<DraftIngredient>((ing) => ({
      id: ing.id,
      name: ing.name,
      amount: ing.amount ?? '',
      unit: ing.unit ?? '',
      brand: ing.brand ?? undefined,
      barcode: ing.barcode ?? undefined,
    }));
    setIngredients(draft.length ? draft : [{ id: tempId(), name: '', amount: '', unit: '' }]);
    setPersistedIds(new Set(existing.ingredients.map((i) => i.id)));
  };

  const updateRow = (id: string, patch: Partial<DraftIngredient>) => {
    setIngredients((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setIngredients((rows) => [...rows, { id: tempId(), name: '', amount: '', unit: '' }]);
  };

  const removeRow = (id: string) => {
    setIngredients((rows) => (rows.length === 1 ? rows : rows.filter((r) => r.id !== id)));
  };

  const handleScan = async (rowId: string) => {
    setScanError(null);
    setScanning(true);
    try {
      const barcode = await scanBarcode();
      if (!barcode) {
        setScanError('No barcode read.');
        return;
      }
      const product = await lookupBarcode(barcode);
      if (!product?.name) {
        setScanError(`Barcode ${barcode} not in Open Food Facts.`);
        updateRow(rowId, { barcode });
        return;
      }
      haptic('success');
      updateRow(rowId, {
        barcode: product.barcode,
        name: product.name,
        brand: product.brand ?? undefined,
        amount: product.amount ?? '',
        unit: product.unit ?? '',
      });
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed.');
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const db = resolveLocalDb();
    try {
      let id = recipeId;
      const payload = {
        title: title.trim(),
        notes: notes.trim() || null,
        servings: servings === '' ? null : Number(servings),
        cook_minutes: cookMinutes === '' ? null : Number(cookMinutes),
      };
      if (id) {
        await updateRecipe(db, id, payload);
      } else {
        const created = await createRecipe(db, payload);
        id = created.id;
      }
      const cleaned = ingredients.filter((row) => row.name.trim());
      const persistedToKeep = new Set<string>();
      for (const row of cleaned) {
        if (persistedIds.has(row.id)) {
          persistedToKeep.add(row.id);
          await db.update('ingredients', row.id, {
            name: row.name.trim(),
            amount: row.amount || null,
            unit: row.unit || null,
            brand: row.brand ?? null,
            barcode: row.barcode ?? null,
          });
        } else {
          await addIngredient(db, {
            recipe_id: id,
            name: row.name.trim(),
            amount: row.amount || null,
            unit: row.unit || null,
            brand: row.brand ?? null,
            barcode: row.barcode ?? null,
          });
        }
      }
      for (const oldId of persistedIds) {
        if (!persistedToKeep.has(oldId)) await deleteIngredient(db, oldId);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="page" onSubmit={handleSave}>
      <header className="page-header">
        <button type="button" className="ghost" onClick={onClose}>
          Cancel
        </button>
        <h1>{recipeId ? 'Edit recipe' : 'New recipe'}</h1>
        <button type="submit" className="primary" disabled={saving || !title.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <label className="field">
        <span>Title</span>
        <input
          type="text"
          autoComplete="off"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What's it called?"
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Servings</span>
          <input
            type="number"
            min={1}
            value={servings}
            onChange={(e) => setServings(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>Cook minutes</span>
          <input
            type="number"
            min={0}
            value={cookMinutes}
            onChange={(e) => setCookMinutes(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </label>
      </div>

      <fieldset className="field">
        <legend>Ingredients</legend>
        {ingredients.map((row) => (
          <div key={row.id} className="ingredient-edit-row">
            <AutocompleteInput
              ariaLabel="Ingredient name"
              value={row.name}
              onChange={(value) => updateRow(row.id, { name: value })}
              candidates={candidates}
              placeholder="ingredient"
            />
            <input
              type="text"
              autoComplete="off"
              placeholder="amount"
              value={row.amount}
              onChange={(e) => updateRow(row.id, { amount: e.target.value })}
              aria-label="Amount"
              className="amount-input"
            />
            <input
              type="text"
              autoComplete="off"
              placeholder="unit"
              value={row.unit}
              onChange={(e) => updateRow(row.id, { unit: e.target.value })}
              aria-label="Unit"
              className="unit-input"
            />
            {scanAvailable ? (
              <button
                type="button"
                className="ghost"
                onClick={() => void handleScan(row.id)}
                disabled={scanning}
                aria-label="Scan barcode"
              >
                {scanning ? 'Scanning…' : 'Scan'}
              </button>
            ) : null}
            <button
              type="button"
              className="ghost danger"
              onClick={() => removeRow(row.id)}
              aria-label="Remove ingredient"
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="ghost" onClick={addRow}>
          + Add ingredient
        </button>
        {scanError ? <p className="error">{scanError}</p> : null}
        {!scanAvailable ? (
          <p className="muted">Barcode scan is Android-only. Use the autocomplete instead.</p>
        ) : null}
      </fieldset>

      <label className="field">
        <span>Notes</span>
        <textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Method, tips, leftovers…"
        />
      </label>
    </form>
  );
}
