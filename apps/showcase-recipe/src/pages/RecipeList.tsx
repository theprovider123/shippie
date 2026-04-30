import { useEffect, useState } from 'react';
import type { LocalDbRecord } from '@shippie/local-runtime-contract';
import type { Ingredient, Recipe, RecipeWithIngredients } from '../db/schema.ts';
import { deleteRecipe, listRecipes, searchRecipes } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import { RecipeCard } from '../components/RecipeCard.tsx';
import { INGREDIENTS_TABLE } from '../db/schema.ts';
import { getRecipe } from '../db/queries.ts';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { ShareSheet } from '../share/ShareSheet.tsx';

const shippie = createShippieIframeSdk({ appId: 'app_recipe_saver' });

/**
 * P3 — send a recipe to any app that declared
 * `acceptsTransfer.kinds: ['recipe']` (Meal Planner ships with this
 * declaration). The container handles target picking; Recipe Saver
 * just announces the kind, then commits to the first acceptor.
 */
async function sendRecipeToPlanner(recipeId: string): Promise<string | null> {
  const db = resolveLocalDb();
  const full = await getRecipe(db, recipeId);
  if (!full) return null;
  const payload = {
    recipeName: full.title,
    title: full.title,
    ingredients: full.ingredients.map((i) => i.name),
  };
  const start = await shippie.transfer.start('recipe', { title: full.title });
  const target = start.acceptors[0];
  if (!target) return 'No app accepts recipes yet.';
  const result = await shippie.transfer.commit({
    kind: 'recipe',
    targetSlug: target.slug,
    payload,
  });
  if (result.delivered) return `Sent to ${result.target?.name ?? target.name}`;
  if (result.reason === 'permission_not_yet_granted') {
    return 'Pending — accept the prompt to send.';
  }
  return result.reason ?? 'Could not send.';
}

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
  const [sharing, setSharing] = useState<RecipeWithIngredients | null>(null);

  async function openShareSheet(id: string) {
    const full = await getRecipe(resolveLocalDb(), id);
    if (full) setSharing(full);
  }

  useEffect(() => {
    let cancelled = false;
    const db = resolveLocalDb();
    (async () => {
      setLoading(true);
      const rows = query.trim() ? await searchRecipes(db, query) : await listRecipes(db);
      const ings = (await db.query<LocalDbRecord>(INGREDIENTS_TABLE)) as unknown as Ingredient[];
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
              onShare={() => void openShareSheet(r.id)}
              onDelete={() => void handleDelete(r.id)}
            />
          ))}
        </ul>
      )}
      {sharing ? (
        <ShareSheet recipe={sharing} onClose={() => setSharing(null)} />
      ) : null}
    </div>
  );
}

interface RowProps {
  recipe: Recipe;
  count: number;
  onOpen: () => void;
  onCookingMode: () => void;
  onShare: () => void;
  onDelete: () => void;
}

function RecipeCardWithCookButton({ recipe, count, onOpen, onCookingMode, onShare, onDelete }: RowProps) {
  const [sendStatus, setSendStatus] = useState<string | null>(null);

  async function handleSend(e: React.MouseEvent) {
    e.stopPropagation();
    setSendStatus('Sending…');
    const status = await sendRecipeToPlanner(recipe.id);
    setSendStatus(status);
    window.setTimeout(() => setSendStatus(null), 4000);
  }

  return (
    <div className="recipe-row">
      <RecipeCard recipe={recipe} ingredientCount={count} onOpen={onOpen} onDelete={onDelete} />
      <div className="recipe-actions">
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
        <button
          type="button"
          className="send-button"
          onClick={handleSend}
          aria-label={`Send ${recipe.title} to Meal Planner`}
        >
          → Plan
        </button>
        <button
          type="button"
          className="share-button"
          onClick={(e) => {
            e.stopPropagation();
            onShare();
          }}
          aria-label={`Share ${recipe.title}`}
        >
          ↗ Share
        </button>
      </div>
      {sendStatus && <p className="send-status">{sendStatus}</p>}
    </div>
  );
}
