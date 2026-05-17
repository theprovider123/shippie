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
  const [sendStatus, setSendStatus] = useState<Record<string, string>>({});

  async function openShareSheet(id: string) {
    const full = await getRecipe(resolveLocalDb(), id);
    if (full) setSharing(full);
  }

  async function handlePlan(id: string, event: React.MouseEvent) {
    event.stopPropagation();
    setSendStatus((prev) => ({ ...prev, [id]: 'Sending…' }));
    const status = await sendRecipeToPlanner(id);
    if (!status) return;
    setSendStatus((prev) => ({ ...prev, [id]: status }));
    window.setTimeout(() => {
      setSendStatus((prev) => {
        const { [id]: _drop, ...rest } = prev;
        return rest;
      });
    }, 4000);
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

  const totalCount = recipes.length;
  const countLabel = query.trim()
    ? `${totalCount} match${totalCount === 1 ? '' : 'es'}`
    : `${totalCount} recipe${totalCount === 1 ? '' : 's'}`;

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-titles">
          <h1>Recipes</h1>
          <p className="page-header-count">{loading ? 'Loading…' : countLabel}</p>
        </div>
        <button type="button" className="primary" onClick={onNew}>
          + New
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
        <div className="recipe-empty" role="status">
          {query ? (
            <>
              <h2>No matches</h2>
              <p>Try a different word, or clear the search.</p>
            </>
          ) : (
            <>
              <h2>Nothing here yet</h2>
              <p>Tap “+ New” to add your first recipe. Everything stays on this device.</p>
            </>
          )}
        </div>
      ) : (
        <ul data-shippie-list className="recipe-list" aria-label="Recipes">
          {recipes.map((r) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              ingredientCount={counts[r.id] ?? 0}
              sendStatus={sendStatus[r.id] ?? null}
              onOpen={() => onOpen(r.id)}
              onCook={() => onCookingMode(r.id)}
              onPlan={(event) => void handlePlan(r.id, event)}
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
