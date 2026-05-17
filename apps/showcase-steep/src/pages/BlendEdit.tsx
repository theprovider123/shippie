/**
 * Blend builder. Create a new blend or edit an existing one.
 *
 * Fields: name, notes, intent tags (multi-select chips), ingredients
 * (list of herb + parts editor), brew baseline (temp / steep / resteeps
 * / batch). Save persists everything in one shot and bubbles up via
 * `onSaved`.
 */
import { useEffect, useMemo, useState } from 'react';
import type {
  BatchSize,
  BlendIngredient,
  BlendWithIngredients,
  Herb,
  IntentTag,
} from '../db/schema.ts';
import {
  addBlendIngredient,
  createBlend,
  deleteBlendIngredient,
  getBlend,
  listHerbs,
  newId,
  updateBlend,
} from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import { ALL_INTENTS, IntentChip } from '../components/IntentChip.tsx';
import { HerbPicker } from '../components/HerbPicker.tsx';

interface BlendEditProps {
  blendId: string | null;
  onSaved: (id: string) => void;
  onCancel: () => void;
}

interface DraftIngredient {
  id: string;
  herb_id: string;
  parts: number;
  herb: Herb;
}

const BATCH_OPTIONS: BatchSize[] = ['cup', 'pot', 'tin'];

export function BlendEdit({ blendId, onSaved, onCancel }: BlendEditProps) {
  const [allHerbs, setAllHerbs] = useState<Herb[]>([]);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [intents, setIntents] = useState<IntentTag[]>([]);
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [tempC, setTempC] = useState<number | ''>(95);
  const [steepMin, setSteepMin] = useState<number | ''>(5);
  const [resteeps, setResteeps] = useState<number | ''>(1);
  const [batch, setBatch] = useState<BatchSize>('cup');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = resolveLocalDb();
      const herbs = await listHerbs(db);
      let existing: BlendWithIngredients | null = null;
      if (blendId) existing = await getBlend(db, blendId);
      if (cancelled) return;

      setAllHerbs(herbs);
      if (existing) {
        setName(existing.name);
        setNotes(existing.notes ?? '');
        setIntents(existing.intent_tags);
        setTempC(existing.default_temp_c ?? '');
        setSteepMin(existing.default_steep_minutes ?? '');
        setResteeps(existing.max_resteeps ?? '');
        setBatch(existing.default_batch ?? 'cup');
        setIngredients(
          existing.ingredients
            .filter((ing) => ing.herb)
            .map((ing) => ({
              id: ing.id,
              herb_id: ing.herb_id,
              parts: ing.parts,
              herb: ing.herb!,
            })),
        );
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [blendId]);

  const usedHerbIds = useMemo(
    () => new Set(ingredients.map((ing) => ing.herb_id)),
    [ingredients],
  );

  const totalParts = ingredients.reduce((sum, ing) => sum + ing.parts, 0);

  const toggleIntent = (tag: IntentTag) => {
    setIntents((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const addIngredient = (herb: Herb) => {
    setIngredients((prev) => [
      ...prev,
      { id: newId(), herb_id: herb.id, parts: 1, herb },
    ]);
    setPickerOpen(false);
  };

  const updateParts = (id: string, parts: number) => {
    setIngredients((prev) =>
      prev.map((ing) => (ing.id === id ? { ...ing, parts: Math.max(0, parts) } : ing)),
    );
  };

  const removeIngredient = (id: string) => {
    setIngredients((prev) => prev.filter((ing) => ing.id !== id));
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const db = resolveLocalDb();
      const payload = {
        name: name.trim(),
        notes: notes.trim() || null,
        intent_tags: intents,
        default_temp_c: tempC === '' ? null : Number(tempC),
        default_steep_minutes: steepMin === '' ? null : Number(steepMin),
        max_resteeps: resteeps === '' ? null : Number(resteeps),
        default_batch: batch,
      };

      let id = blendId;
      if (id) {
        await updateBlend(db, id, payload);
        // Wipe + re-add ingredients. Small N; simple beats clever here.
        const existing = await getBlend(db, id);
        for (const ing of existing?.ingredients ?? []) {
          await deleteBlendIngredient(db, ing.id);
        }
      } else {
        const blend = await createBlend(db, payload);
        id = blend.id;
      }

      for (const ing of ingredients) {
        if (ing.parts <= 0) continue;
        await addBlendIngredient(db, {
          blend_id: id,
          herb_id: ing.herb_id,
          parts: ing.parts,
        });
      }
      onSaved(id);
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>{blendId ? 'Edit blend' : 'New blend'}</h1>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </header>

      <label className="field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Evening calm"
          autoFocus
        />
      </label>

      <label className="field">
        <span>Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="When you'd reach for this. Optional."
        />
      </label>

      <fieldset className="field">
        <legend>Intent</legend>
        <div className="intent-chip-row">
          {ALL_INTENTS.map((tag) => (
            <IntentChip
              key={tag}
              tag={tag}
              active={intents.includes(tag)}
              onClick={() => toggleIntent(tag)}
              size="sm"
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Ingredients</legend>
        {ingredients.length === 0 ? (
          <p className="muted">No herbs yet. Tap Add to pick from the library.</p>
        ) : (
          <ul className="parts-list parts-list-editable">
            {ingredients.map((ing) => (
              <li key={ing.id} className="parts-row parts-row-editable">
                <span className="parts-name">{ing.herb.common_name}</span>
                <div className="parts-controls">
                  <button
                    type="button"
                    className="parts-stepper"
                    aria-label="Decrease parts"
                    onClick={() => updateParts(ing.id, ing.parts - 1)}
                  >
                    −
                  </button>
                  <span className="parts-amount" aria-live="polite">
                    {ing.parts}
                  </span>
                  <button
                    type="button"
                    className="parts-stepper"
                    aria-label="Increase parts"
                    onClick={() => updateParts(ing.id, ing.parts + 1)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="parts-remove"
                    aria-label="Remove herb"
                    onClick={() => removeIngredient(ing.id)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="ghost" onClick={() => setPickerOpen(true)}>
          + Add herb
        </button>
        {totalParts > 0 ? (
          <p className="muted parts-total">{totalParts} parts total</p>
        ) : null}
      </fieldset>

      <fieldset className="field brew-config">
        <legend>Brew baseline</legend>
        <div className="brew-config-grid">
          <label>
            <span>Water (°C)</span>
            <input
              type="number"
              min={60}
              max={100}
              value={tempC}
              onChange={(e) => setTempC(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label>
            <span>Steep (min)</span>
            <input
              type="number"
              min={1}
              max={60}
              value={steepMin}
              onChange={(e) => setSteepMin(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label>
            <span>Resteeps</span>
            <input
              type="number"
              min={0}
              max={5}
              value={resteeps}
              onChange={(e) => setResteeps(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label>
            <span>Default batch</span>
            <select value={batch} onChange={(e) => setBatch(e.target.value as BatchSize)}>
              {BATCH_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <div className="data-panel-actions">
        <button
          type="button"
          className="primary"
          onClick={save}
          disabled={busy || !name.trim()}
        >
          Save blend
        </button>
      </div>

      {pickerOpen ? (
        <HerbPicker
          herbs={allHerbs}
          excludeIds={usedHerbIds}
          onPick={addIngredient}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}
