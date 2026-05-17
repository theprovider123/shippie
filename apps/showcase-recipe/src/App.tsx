import { useEffect, useMemo, useState } from 'react';
import { RecipeList } from './pages/RecipeList.tsx';
import { RecipeEdit } from './pages/RecipeEdit.tsx';
import { CookingMode } from './pages/CookingMode.tsx';
import { resolveLocalDb } from './db/runtime.ts';
import { seedIfEmpty } from './db/seed.ts';
import {
  dismissInstallNudge,
  hasRequestedPersistence,
  loadPersistenceMeta,
  requestDurableRecipeStorage,
  shouldNudgeInstall,
} from './db/data-safety.ts';
import { readImportFragment } from '@shippie/share';
import { ImportCard } from './share/ImportCard.tsx';
import { checkRecipeImport, type RecipeImportCheck } from './share/recipe-import.ts';
import { createLocalNavigation, migrateLocalDbTablesToDocument } from '@shippie/sdk/wrapper';
import { INGREDIENTS_TABLE, RECIPES_TABLE, ingredientsSchema, recipesSchema } from './db/schema.ts';
import { MealPlanTab, PantryTab, ShoppingTab } from './IntegratedTabs.tsx';

type Route =
  | { kind: 'list' }
  | { kind: 'edit'; recipeId: string | null }
  | { kind: 'cook'; recipeId: string };

type RecipeTab = 'recipes' | 'shopping' | 'meal-plan' | 'pantry';

const RECIPE_TABS: Array<{ id: RecipeTab; label: string }> = [
  { id: 'recipes', label: 'Recipes' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'meal-plan', label: 'Meal Plan' },
  { id: 'pantry', label: 'Pantry' },
];

const FOLDED_FROM: Record<string, { tab: RecipeTab; label: string }> = {
  'shopping-list': { tab: 'shopping', label: 'Shopping List' },
  'meal-planner': { tab: 'meal-plan', label: 'Meal Planner' },
  'pantry-scanner': { tab: 'pantry', label: 'Pantry Scanner' },
};

function tabFromLocation(): RecipeTab {
  if (typeof window === 'undefined') return 'recipes';
  const tab = new URL(window.location.href).searchParams.get('tab');
  return RECIPE_TABS.some((candidate) => candidate.id === tab) ? (tab as RecipeTab) : 'recipes';
}

export function App() {
  const [route, setRoute] = useState<Route>({ kind: 'list' });
  const [activeTab, setActiveTab] = useState<RecipeTab>(() => tabFromLocation());
  const [foldedFrom] = useState(() => {
    if (typeof window === 'undefined') return null;
    return new URL(window.location.href).searchParams.get('from');
  });
  const localNavigation = useMemo(
    () =>
      createLocalNavigation<Route>(
        { kind: 'list' },
        setRoute,
        {
          isEqual: (a, b) =>
            a.kind === b.kind &&
            ('recipeId' in a ? a.recipeId : null) === ('recipeId' in b ? b.recipeId : null),
        },
      ),
    [],
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [seedNote, setSeedNote] = useState<string | null>(null);
  const [installNudge, setInstallNudge] = useState(false);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<
    Extract<RecipeImportCheck, { ok: true }> | null
  >(null);

  useEffect(() => {
    return () => localNavigation.destroy();
  }, [localNavigation]);

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
        await migrateLocalDbTablesToDocument(db, {
          appSlug: 'recipe',
          tables: [
            { name: RECIPES_TABLE, schema: recipesSchema },
            { name: INGREDIENTS_TABLE, schema: ingredientsSchema },
          ],
        });
        // Force RecipeList to re-fetch. Without this, the list mounts and
        // queries the DB before seedIfEmpty resolves, so the seeded rows
        // appear blank until the user navigates away and back. Bumping
        // refreshKey after the seed lands fixes the race for first-load
        // and is a no-op on subsequent renders (the rows are already there).
        setRefreshKey((n) => n + 1);
        // Silent retry of persistence-grant on subsequent launches.
        // Browsers grant more readily once the site has engagement, so
        // a previously-declined request can succeed later. Skip the
        // very first launch — `requestDurableRecipeStorage` is the
        // first-meaningful-save trigger and we want that user-engaged
        // signal in the request.
        const meta = loadPersistenceMeta();
        if (meta && meta.granted === false && !cancelled) {
          void requestDurableRecipeStorage(db);
        }
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
    setActiveTab('recipes');
    setRoute(next);
    void localNavigation.navigate(next, { kind: next.kind === 'list' ? 'crossfade' : 'rise' });
  };

  const closeToList = () => {
    setRoute({ kind: 'list' });
    void localNavigation.backOrReplace({ kind: 'list' }, { kind: 'crossfade' });
  };

  const selectTab = (tab: RecipeTab) => {
    setActiveTab(tab);
    setRoute({ kind: 'list' });
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (tab === 'recipes') url.searchParams.delete('tab');
      else url.searchParams.set('tab', tab);
      window.history.replaceState(window.history.state, '', url);
    }
  };

  const handleSaved = () => {
    const db = resolveLocalDb();
    // Only ask for persistence the first time. Browsers grant more
    // readily for sites with engagement, so the first meaningful save
    // is the right hook. Subsequent declines retry silently from the
    // boot effect above.
    if (!hasRequestedPersistence()) void requestDurableRecipeStorage(db);
    // On iOS Safari the install nudge is the right durability prompt:
    // installed apps are less likely to lose local browser data.
    if (shouldNudgeInstall()) {
      setInstallNudge(true);
    }
    setRefreshKey((n) => n + 1);
    closeToList();
  };
  const foldedNotice = foldedFrom ? FOLDED_FROM[foldedFrom] : undefined;
  // Single alert slot — priority high→low: foldedNotice > installNudge > seedNote
  const showFoldedAlert = route.kind === 'list' && foldedNotice?.tab === activeTab;

  return (
    <div className="app">
      {showFoldedAlert ? (
        <div className="banner folded-banner" role="status">
          {foldedNotice!.label} now lives inside Recipe.
        </div>
      ) : installNudge ? (
        <div className="banner install-nudge-banner" role="status">
          <span>Install on your Home Screen so iPhone doesn’t clear your recipes.</span>
          <button type="button" onClick={() => setInstallHelpOpen(true)}>
            How to install
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              dismissInstallNudge();
              setInstallNudge(false);
            }}
            aria-label="Dismiss install nudge"
          >
            ×
          </button>
        </div>
      ) : seedNote ? (
        <div className="banner" role="status">{seedNote}</div>
      ) : null}
      {installHelpOpen ? (
        <div className="install-help-backdrop" role="presentation" onClick={() => setInstallHelpOpen(false)}>
          <section
            className="install-help"
            role="dialog"
            aria-labelledby="install-help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2 id="install-help-title">Install Recipe</h2>
              <button
                type="button"
                className="ghost"
                onClick={() => setInstallHelpOpen(false)}
                aria-label="Close install help"
              >
                ×
              </button>
            </header>
            <ol>
              <li>Tap the Share button in Safari.</li>
              <li>Scroll down and tap "Add to Home Screen".</li>
              <li>Tap "Add" in the top right.</li>
            </ol>
            <p className="install-help-note">
              Installed apps stay even when iPhone clears website data after inactivity.
            </p>
          </section>
        </div>
      ) : null}
      {route.kind === 'list' && activeTab === 'recipes' ? (
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
          onClose={closeToList}
          onSaved={handleSaved}
        />
      ) : null}
      {route.kind === 'cook' ? (
        <CookingMode recipeId={route.recipeId} onClose={closeToList} />
      ) : null}
      {route.kind === 'list' && activeTab === 'shopping' ? <ShoppingTab /> : null}
      {route.kind === 'list' && activeTab === 'meal-plan' ? <MealPlanTab /> : null}
      {route.kind === 'list' && activeTab === 'pantry' ? <PantryTab /> : null}
      {route.kind === 'list' ? (
        <nav className="recipe-tabs" aria-label="Recipe tools">
          {RECIPE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => selectTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      ) : null}

      {pendingImport ? (
        <ImportCard
          check={pendingImport}
          onImported={(id) => {
            setPendingImport(null);
            if (!hasRequestedPersistence()) void requestDurableRecipeStorage(resolveLocalDb());
            if (shouldNudgeInstall()) {
              setInstallNudge(true);
            }
            setRefreshKey((n) => n + 1);
            navigate({ kind: 'edit', recipeId: id });
          }}
          onDiscard={() => setPendingImport(null)}
        />
      ) : null}
    </div>
  );
}
