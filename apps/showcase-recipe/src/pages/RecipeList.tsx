import { useEffect, useState } from 'react';
import type { Ingredient, Recipe } from '../db/schema.ts';
import { deleteRecipe, listRecipes, searchRecipes } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import { RecipeCard } from '../components/RecipeCard.tsx';
import { INGREDIENTS_TABLE } from '../db/schema.ts';

interface RecipeListProps {
  onOpen: (id: string) => void;
  onNew: () => void;
  onCookingMode: (id: string) => void;
  refreshKey: number;
  onChanged: () => void;
}

export function RecipeList({ onOpen, onNew, onCookingMode, refreshKey, onChanged }: RecipeListProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const db = resolveLocalDb();
    (async () => {
      setLoading(true);
      const rows = query.trim() ? await searchRecipes(db, query) : await listRecipes(db);
      const ings = await db.query<Ingredient>(INGREDIENTS_TABLE);
      const map: Record<string, number> = {};
      for (const ing of ings) {
        map[ing.recipe_id] = (map[ing.recipe_id] ?? 0) + 1;
      }
      if (!cancelled) {
        setRecipes(rows);
        setCounts(map);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, refreshKey]);

  const handleDelete = async (id: string) => {
    await deleteRecipe(resolveLocalDb(), id);
    onChanged();
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Recipes</h1>
        <button type="button" className="primary" onClick={onNew}>
          New
        </button>
      </header>
      <input
        type="search"
        className="search-input"
        placeholder="Search recipes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search recipes"
      />
      {loading ? (
        <p className="muted">Loading…</p>
      ) : recipes.length === 0 ? (
        <p className="muted">
          {query ? 'No recipes match.' : "Nothing here yet — tap New to add your first."}
        </p>
      ) : (
        <ul data-shippie-list className="recipe-list" aria-label="Recipes">
          {recipes.map((r) => (
            <RecipeCardWithCookButton
              key={r.id}
              recipe={r}
              count={counts[r.id] ?? 0}
              onOpen={() => onOpen(r.id)}
              onCookingMode={() => onCookingMode(r.id)}
              onDelete={() => void handleDelete(r.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface RowProps {
  recipe: Recipe;
  count: number;
  onOpen: () => void;
  onCookingMode: () => void;
  onDelete: () => void;
}

function RecipeCardWithCookButton({ recipe, count, onOpen, onCookingMode, onDelete }: RowProps) {
  return (
    <div className="recipe-row">
      <RecipeCard recipe={recipe} ingredientCount={count} onOpen={onOpen} onDelete={onDelete} />
      <button
        type="button"
        className="cook-button"
        onClick={(e) => {
          e.stopPropagation();
          onCookingMode();
        }}
        aria-label={`Cook ${recipe.title}`}
      >
        Cook
      </button>
    </div>
  );
}
