import type { Ingredient } from '../db/schema.ts';

interface IngredientListProps {
  ingredients: Ingredient[];
  /**
   * Map of lowercase ingredient name → in-stock flag, sourced from
   * Pantry Scanner's `pantry-inventory` broadcast. Empty when the
   * intent isn't granted or no provider has fired yet.
   */
  pantryStock?: Record<string, boolean>;
}

export function IngredientList({ ingredients, pantryStock }: IngredientListProps) {
  if (ingredients.length === 0) {
    return <p className="muted">No ingredients yet.</p>;
  }
  return (
    <ul className="ingredient-list" aria-label="Ingredients">
      {ingredients.map((ing) => {
        const key = ing.name.trim().toLowerCase();
        const stock = pantryStock?.[key];
        const stateClass =
          stock === true ? 'ingredient-in-stock' : stock === false ? 'ingredient-out-of-stock' : '';
        return (
          <li key={ing.id} className={`ingredient-row ${stateClass}`.trim()}>
            <span className="ingredient-amount">
              {[ing.amount, ing.unit].filter(Boolean).join(' ') || '—'}
            </span>
            <span className="ingredient-name">
              {ing.name}
              {ing.brand ? <span className="muted"> · {ing.brand}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
