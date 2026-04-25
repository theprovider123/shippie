import type { Ingredient } from '../db/schema.ts';

export function IngredientList({ ingredients }: { ingredients: Ingredient[] }) {
  if (ingredients.length === 0) {
    return <p className="muted">No ingredients yet.</p>;
  }
  return (
    <ul className="ingredient-list" aria-label="Ingredients">
      {ingredients.map((ing) => (
        <li key={ing.id} className="ingredient-row">
          <span className="ingredient-amount">
            {[ing.amount, ing.unit].filter(Boolean).join(' ') || '—'}
          </span>
          <span className="ingredient-name">
            {ing.name}
            {ing.brand ? <span className="muted"> · {ing.brand}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
