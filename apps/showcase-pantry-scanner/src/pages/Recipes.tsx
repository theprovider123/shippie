/**
 * Recipes — full list of suggestions, sorted by score. Tapping a card
 * opens the Recipe app via cross-app navigation when present, falling
 * back to a no-op when running standalone.
 */
import { useMemo } from 'react';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';
import type { PantryStore } from '../lib/store.ts';
import {
  suggestRecipes,
  type RecipeSuggestion,
} from '../lib/suggest-recipes.ts';
import { RecipeSuggestionCard } from '../components/RecipeSuggestion.tsx';

interface RecipesProps {
  shippie: ShippieIframeSdk;
  store: PantryStore;
}

export function Recipes({ shippie, store }: RecipesProps) {
  const suggestions = useMemo(
    () =>
      suggestRecipes(store.items, undefined, {
        matchFloor: 0.5,
        limit: 12,
      }),
    [store.items],
  );

  function openRecipe(s: RecipeSuggestion) {
    // Broadcast a request-to-open intent — the container forwards to
    // Recipe Saver if installed; otherwise it's a no-op.
    shippie.intent.broadcast('recipe-open-request', [
      { title: s.recipe.title, ingredients: s.recipe.ingredients.map((i) => i.name) },
    ]);
    shippie.feel.texture('navigate');
  }

  if (store.items.length === 0) {
    return (
      <main className="page page-recipes">
        <header>
          <h1>Recipes</h1>
          <p>Add a few items first — suggestions need something to work with.</p>
        </header>
      </main>
    );
  }

  if (suggestions.length === 0) {
    return (
      <main className="page page-recipes">
        <header>
          <h1>Recipes</h1>
          <p>No matches yet. Try adding pasta, eggs, or olive oil.</p>
        </header>
      </main>
    );
  }

  return (
    <main className="page page-recipes">
      <header>
        <h1>Recipes</h1>
        <p>
          {suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'} from
          your shelf.
        </p>
      </header>
      <section className="recipes-grid">
        {suggestions.map((s) => (
          <RecipeSuggestionCard
            key={s.recipe.id}
            suggestion={s}
            onOpen={openRecipe}
          />
        ))}
      </section>
    </main>
  );
}
