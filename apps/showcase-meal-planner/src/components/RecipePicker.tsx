import { useState } from 'react';
import type { CookedMealRow, Day, NutritionPerServing, PlanCell, Slot } from '../lib/types.ts';

interface RecipePickerProps {
  day: Day;
  slot: Slot;
  initial?: PlanCell;
  recentSuggestions?: readonly CookedMealRow[];
  onSave: (cell: PlanCell) => void;
  onClear: () => void;
  onCancel: () => void;
}

const EMPTY_NUTRITION: NutritionPerServing = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fibre: 0,
};

/**
 * Slot editor. Tap a recent recipe to prefill, or type a one-off. The
 * "Show nutrition" toggle reveals the per-serving inputs so users who
 * care can enter them; everyone else can ignore the panel entirely.
 */
export function RecipePicker({
  day,
  slot,
  initial,
  recentSuggestions = [],
  onSave,
  onClear,
  onCancel,
}: RecipePickerProps) {
  const [recipeName, setRecipeName] = useState(initial?.recipeName ?? '');
  const [ingredientsText, setIngredientsText] = useState(
    initial?.ingredients
      .map((i) => (i.quantity != null ? `${i.quantity}${i.unit ?? ''} ${i.name}` : i.name))
      .join(', ') ?? '',
  );
  const [baseServings, setBaseServings] = useState(initial?.baseServings ?? 2);
  const [costPerServing, setCostPerServing] = useState<number | ''>(
    initial?.costPerServing ?? '',
  );
  const [showNutrition, setShowNutrition] = useState(!!initial?.nutrition);
  const [nutrition, setNutrition] = useState<NutritionPerServing>(
    initial?.nutrition ?? EMPTY_NUTRITION,
  );

  function commit() {
    const ingredients = ingredientsText
      .split(',')
      .map((raw) => parseIngredient(raw))
      .filter((ing): ing is NonNullable<typeof ing> => ing !== null);
    onSave({
      recipeName: recipeName.trim() || '—',
      ingredients,
      servings: initial?.servings ?? baseServings,
      baseServings,
      ...(costPerServing !== '' ? { costPerServing: Number(costPerServing) } : {}),
      ...(showNutrition && nutrition.calories > 0 ? { nutrition } : {}),
      ...(initial?.cooked ? { cooked: initial.cooked } : {}),
    });
  }

  function applySuggestion(row: CookedMealRow) {
    setRecipeName(row.title);
    if (row.ingredients?.length) {
      setIngredientsText(row.ingredients.join(', '));
    }
  }

  return (
    <section className="editor" aria-label={`Edit ${day} ${slot}`}>
      <h2>
        {day} <span className="dot" aria-hidden="true">·</span> {slot}
      </h2>

      {recentSuggestions.length > 0 ? (
        <div className="suggest-row" aria-label="Recent recipes">
          {recentSuggestions.slice(0, 4).map((row) => (
            <button
              key={(row.recipeId ?? row.title) + row.cookedAt}
              type="button"
              className="chip"
              onClick={() => applySuggestion(row)}
            >
              + {row.title}
            </button>
          ))}
        </div>
      ) : null}

      <label className="field">
        <span className="field-label">Recipe</span>
        <input
          type="text"
          value={recipeName}
          onChange={(e) => setRecipeName(e.target.value)}
          placeholder="Tonight's dinner"
        />
      </label>

      <label className="field">
        <span className="field-label">Ingredients (comma-separated)</span>
        <textarea
          value={ingredientsText}
          onChange={(e) => setIngredientsText(e.target.value)}
          placeholder="200g pasta, 4 tomato, basil"
          rows={3}
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field-label">Recipe yields (servings)</span>
          <input
            type="number"
            min={1}
            step={1}
            value={baseServings}
            onChange={(e) => setBaseServings(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label className="field">
          <span className="field-label">Cost per serving (estimate)</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={costPerServing}
            onChange={(e) =>
              setCostPerServing(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))
            }
            placeholder="—"
          />
        </label>
      </div>

      <button
        type="button"
        className="ghost link"
        onClick={() => setShowNutrition((v) => !v)}
        aria-expanded={showNutrition}
      >
        {showNutrition ? 'Hide nutrition' : 'Add nutrition (per serving)'}
      </button>

      {showNutrition ? (
        <div className="nutri-grid">
          <NutritionInput
            label="kcal"
            value={nutrition.calories}
            onChange={(v) => setNutrition((n) => ({ ...n, calories: v }))}
          />
          <NutritionInput
            label="Protein g"
            value={nutrition.protein}
            onChange={(v) => setNutrition((n) => ({ ...n, protein: v }))}
          />
          <NutritionInput
            label="Carbs g"
            value={nutrition.carbs}
            onChange={(v) => setNutrition((n) => ({ ...n, carbs: v }))}
          />
          <NutritionInput
            label="Fat g"
            value={nutrition.fat}
            onChange={(v) => setNutrition((n) => ({ ...n, fat: v }))}
          />
          <NutritionInput
            label="Fibre g"
            value={nutrition.fibre}
            onChange={(v) => setNutrition((n) => ({ ...n, fibre: v }))}
          />
        </div>
      ) : null}

      <div className="row">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        {initial ? (
          <button type="button" className="ghost danger" onClick={onClear}>
            Clear slot
          </button>
        ) : null}
        <button type="button" onClick={commit}>
          Save
        </button>
      </div>
    </section>
  );
}

function NutritionInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="nutri-cell">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
    </label>
  );
}

/**
 * Parses "200g pasta" or "4 tomato" or "basil" → an ingredient with
 * an optional numeric quantity + unit. Anything we can't parse falls
 * back to a plain name. No regex magic — the user types kitchen-style.
 */
function parseIngredient(
  raw: string,
): { name: string; quantity?: number; unit?: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = /^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)\s+(.*)$/.exec(trimmed);
  if (!match) return { name: trimmed };
  const [, rawQty = '', rawUnit = '', rawName = ''] = match;
  const qty = Number(rawQty);
  const unit = rawUnit || undefined;
  const name = rawName.trim();
  if (!name) return { name: trimmed };
  return { name, quantity: qty, ...(unit ? { unit } : {}) };
}
