import { useEffect, useState } from 'react';
import { RecipeList } from './pages/RecipeList.tsx';
import { RecipeEdit } from './pages/RecipeEdit.tsx';
import { CookingMode } from './pages/CookingMode.tsx';
import { resolveLocalDb } from './db/runtime.ts';
import { seedIfEmpty } from './db/seed.ts';
import { readImportFragment } from '@shippie/share';
import { ImportCard } from './share/ImportCard.tsx';
import { checkRecipeImport, type RecipeImportCheck } from './share/recipe-import.ts';
import { wrapNavigation } from '@shippie/sdk/wrapper';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';

const shippie = createShippieIframeSdk({ appId: 'app_recipe_saver' });

type Route =
  | { kind: 'list' }
  | { kind: 'edit'; recipeId: string | null }
  | { kind: 'cook'; recipeId: string };

export function App() {
  const [route, setRoute] = useState<Route>({ kind: 'list' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [seedNote, setSeedNote] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<
    Extract<RecipeImportCheck, { ok: true }> | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    const db = resolveLocalDb();
    (async () => {
      try {
        const result = await seedIfEmpty(db);
        if (cancelled) return;
        if (result.seeded) {
          setSeedNote(`Seeded ${result.count} example recipes — swipe to delete any of them.`);
          window.setTimeout(() => !cancelled && setSeedNote(null), 6000);
        }
        // Force RecipeList to re-fetch. Without this, the list mounts and
        // queries the DB before seedIfEmpty resolves, so the seeded rows
        // appear blank until the user navigates away and back. Bumping
        // refreshKey after the seed lands fixes the race for first-load
        // and is a no-op on subsequent renders (the rows are already there).
        setRefreshKey((n) => n + 1);
      } catch (err) {
        // first-load failures shouldn't block render
        console.warn('[recipe-saver] seed failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Detect a #shippie-import=… fragment and surface the import card.
  // Pure client-side — the fragment never reaches a server. The card
  // verifies the signature, previews the recipe, then either imports
  // it (creating a fresh recipe row + ingredients with a provenance
  // footer in notes) or discards. Either path clears the fragment so
  // a reload doesn't re-prompt.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === 'undefined') return;
      const blob = await readImportFragment(window.location.href);
      if (!blob || cancelled) return;
      const check = await checkRecipeImport(blob);
      if (!check.ok) {
        // Wrong type or version — silently ignore. The fragment may have
        // been intended for a sibling app; don't pop a recipe modal.
        return;
      }
      if (!cancelled) setPendingImport(check);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const navigate = (next: Route) => {
    void wrapNavigation(() => setRoute(next), { kind: next.kind === 'list' ? 'crossfade' : 'rise' });
  };

  const openYourData = () => {
    shippie.openYourData({ appSlug: 'recipe-saver' });
  };

  return (
    <div className="app">
      {seedNote ? <div className="banner" role="status">{seedNote}</div> : null}
      {route.kind === 'list' ? (
        <RecipeList
          onOpen={(id) => navigate({ kind: 'edit', recipeId: id })}
          onNew={() => navigate({ kind: 'edit', recipeId: null })}
          onCookingMode={(id) => navigate({ kind: 'cook', recipeId: id })}
          refreshKey={refreshKey}
          onChanged={() => setRefreshKey((n) => n + 1)}
        />
      ) : null}
      {route.kind === 'edit' ? (
        <RecipeEdit
          recipeId={route.recipeId}
          onClose={() => navigate({ kind: 'list' })}
          onSaved={() => {
            setRefreshKey((n) => n + 1);
            navigate({ kind: 'list' });
          }}
        />
      ) : null}
      {route.kind === 'cook' ? (
        <CookingMode recipeId={route.recipeId} onClose={() => navigate({ kind: 'list' })} />
      ) : null}

      {route.kind === 'list' ? (
        <button
          type="button"
          className="your-data-button"
          onClick={openYourData}
          aria-label="Open Your Data panel"
        >
          Your Data
        </button>
      ) : null}

      {pendingImport ? (
        <ImportCard
          check={pendingImport}
          onImported={(id) => {
            setPendingImport(null);
            setRefreshKey((n) => n + 1);
            navigate({ kind: 'edit', recipeId: id });
          }}
          onDiscard={() => setPendingImport(null)}
        />
      ) : null}
    </div>
  );
}
