import { useCallback, useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import { RECIPES, type Recipe, modeForLeaven, type Mode } from './recipes.ts';
import {
  load,
  newId,
  save,
  type Bake,
  type BakeOutcome,
  type Prefs,
} from './db.ts';
import { Home } from './pages/Home.tsx';
import { NewRecipe } from './pages/NewRecipe.tsx';
import { Recipe as RecipePage } from './pages/Recipe.tsx';
import { TimelineView } from './pages/TimelineView.tsx';
import { ActiveBakes } from './pages/ActiveBakes.tsx';
import { History } from './pages/History.tsx';
import {
  planFromStart,
} from './lib/schedule.ts';
import {
  notifyStatus,
  requestNotifyPermission,
  scheduleAll,
  type NotifyAt,
} from './lib/notify.ts';

const shippie = createShippieIframeSdk({ appId: 'app_dough' });

type Route =
  | { kind: 'home' }
  | { kind: 'new-recipe' }
  | { kind: 'recipe'; recipeId: string }
  | { kind: 'bake'; bakeId: string }
  | { kind: 'active' }
  | { kind: 'history' };

function sameRoute(a: Route, b: Route): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'recipe' && b.kind === 'recipe') return a.recipeId === b.recipeId;
  if (a.kind === 'bake' && b.kind === 'bake') return a.bakeId === b.bakeId;
  return true;
}

export function App() {
  const initial = load();
  const [bakes, setBakes] = useState<Bake[]>(initial.bakes);
  const [customRecipes, setCustomRecipes] = useState<Recipe[]>(initial.recipes);
  const [prefs, setPrefs] = useState<Prefs>(initial.prefs);
  const [route, setRoute] = useState<Route>({ kind: 'home' });
  const localNavigation = useMemo(
    () =>
      createLocalNavigation<Route>(
        { kind: 'home' },
        setRoute,
        { isEqual: sameRoute },
      ),
    [],
  );
  const [notifyPerm, setNotifyPerm] = useState(notifyStatus());

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  function navigate(next: Route, kind: 'crossfade' | 'rise' = 'crossfade'): void {
    setRoute(next);
    void localNavigation.navigate(next, { kind });
  }

  function closeHome(): void {
    setRoute({ kind: 'home' });
    void localNavigation.backOrReplace({ kind: 'home' }, { kind: 'crossfade' });
  }

  // Persist on every state change. Cheap; localStorage is small.
  useEffect(() => {
    save({ bakes, recipes: customRecipes, prefs });
  }, [bakes, customRecipes, prefs]);

  // Active-bake notification scheduler. For each in-flight bake, wire
  // setTimeouts for each sub-prompt fireAt, plus a final "ready" at
  // ready_at. The cancel handle clears them on unmount or when bakes
  // change. This is page-open-only — production wires a SW push.
  useEffect(() => {
    if (notifyPerm !== 'granted') return;
    const cancels: Array<() => void> = [];
    for (const b of bakes) {
      if (b.finished_at) continue;
      const plan = planFromStart(
        b.recipe_snapshot.stages,
        new Date(b.started_at),
      );
      const events: NotifyAt[] = [];
      for (const sp of plan.subPrompts) {
        if (sp.fireAt.getTime() <= Date.now()) continue;
        events.push({
          fireAt: sp.fireAt,
          title: `${b.recipe_name} · ${sp.label}`,
          body: sp.body,
        });
      }
      const ready = new Date(b.ready_at);
      if (ready.getTime() > Date.now()) {
        events.push({
          fireAt: ready,
          title: `${b.recipe_name} · ready`,
          body: 'Bake should be done. Pull, log the outcome.',
        });
      }
      cancels.push(scheduleAll(events));
    }
    return () => cancels.forEach((c) => c());
  }, [bakes, notifyPerm]);

  // Persisted recipe lookup — checks customRecipes first, then presets.
  const findRecipe = useCallback(
    (id: string): Recipe | undefined =>
      customRecipes.find((r) => r.id === id) ?? RECIPES.find((r) => r.id === id),
    [customRecipes],
  );

  const findBake = useCallback(
    (id: string): Bake | undefined => bakes.find((b) => b.id === id),
    [bakes],
  );

  const lastMode: Mode = useMemo(() => prefs.lastMode ?? 'sourdough', [prefs.lastMode]);

  function startBake(recipe: Recipe, totalG: number, readyAt: Date) {
    const bake: Bake = {
      id: newId('b'),
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      recipe_snapshot: recipe,
      total_g: totalG,
      started_at: new Date().toISOString(),
      ready_at: readyAt.toISOString(),
      finished_at: null,
      outcome: null,
    };
    setBakes((prev) => [bake, ...prev]);
    setPrefs((prev) => ({ ...prev, lastMode: modeForLeaven(recipe.leaven) }));
    shippie.feel.texture('confirm');
    shippie.intent.broadcast('dough-ferment-started', [
      {
        recipe: recipe.id,
        recipe_name: recipe.name,
        hydration: recipe.hydration,
        flour_g: totalG, // approximate; downstream apps don't need exact
        started_at: bake.started_at,
        ready_at: bake.ready_at,
      },
    ]);
    // Best-effort dough-ready broadcast while page is open.
    const ms = readyAt.getTime() - Date.now();
    if (ms > 0 && ms < 24 * 60 * 60 * 1000) {
      window.setTimeout(() => {
        shippie.intent.broadcast('dough-ready', [
          {
            recipe: recipe.id,
            recipe_name: recipe.name,
            ready_at: bake.ready_at,
          },
        ]);
        shippie.feel.texture('milestone');
      }, ms);
    }
    navigate({ kind: 'bake', bakeId: bake.id }, 'rise');
  }

  function logOutcome(bakeId: string, outcome: BakeOutcome) {
    setBakes((prev) =>
      prev.map((b) =>
        b.id === bakeId
          ? { ...b, outcome, finished_at: new Date().toISOString() }
          : b,
      ),
    );
    shippie.feel.texture('milestone');
    closeHome();
  }

  function abandonBake(bakeId: string) {
    if (!confirm('Drop this bake from the active list? It will not be logged in history.')) {
      return;
    }
    setBakes((prev) => prev.filter((b) => b.id !== bakeId));
    closeHome();
  }

  function deleteCustomRecipe(id: string) {
    if (!confirm('Delete this recipe from your library?')) return;
    setCustomRecipes((prev) => prev.filter((r) => r.id !== id));
    setRoute({ kind: 'home' });
    void localNavigation.replace({ kind: 'home' }, { kind: 'crossfade' });
  }

  async function ensureNotifyPerm() {
    const next = await requestNotifyPermission();
    setNotifyPerm(next);
    setPrefs((prev) => ({ ...prev, notifyOptIn: next === 'granted' }));
  }

  return (
    <>
      {route.kind === 'home' ? (
        <Home
          bakes={bakes}
          customRecipes={customRecipes}
          onPickRecipe={(r) => navigate({ kind: 'recipe', recipeId: r.id }, 'rise')}
          onQuickStart={startBake}
          onNewRecipe={() => navigate({ kind: 'new-recipe' }, 'rise')}
          onOpenBake={(id) => navigate({ kind: 'bake', bakeId: id }, 'rise')}
          onOpenActive={() => navigate({ kind: 'active' })}
          onOpenHistory={() => navigate({ kind: 'history' })}
        />
      ) : null}

      {route.kind === 'new-recipe' ? (
        <NewRecipe
          defaultMode={lastMode}
          onSave={(recipe) => {
            setCustomRecipes((prev) => [recipe, ...prev]);
            setPrefs((prev) => ({ ...prev, lastMode: modeForLeaven(recipe.leaven) }));
            shippie.feel.texture('confirm');
            const next: Route = { kind: 'recipe', recipeId: recipe.id };
            setRoute(next);
            void localNavigation.replace(next, { kind: 'crossfade' });
          }}
          onCancel={closeHome}
        />
      ) : null}

      {route.kind === 'recipe' ? (() => {
        const recipe = findRecipe(route.recipeId);
        if (!recipe) {
          return (
            <main className="app">
              <p className="muted empty">Recipe not found.</p>
              <button type="button" className="primary" onClick={closeHome}>
                Back home
              </button>
            </main>
          );
        }
        return (
          <RecipePage
            recipe={recipe}
            onCancel={closeHome}
            onStart={(totalG, readyAt) => startBake(recipe, totalG, readyAt)}
            onDelete={recipe.preset ? undefined : () => deleteCustomRecipe(recipe.id)}
          />
        );
      })() : null}

      {route.kind === 'bake' ? (() => {
        const bake = findBake(route.bakeId);
        if (!bake) {
          return (
            <main className="app">
              <p className="muted empty">Bake not found.</p>
              <button type="button" className="primary" onClick={closeHome}>
                Back home
              </button>
            </main>
          );
        }
        return (
          <TimelineView
            bake={bake}
            onCancel={closeHome}
            onLogOutcome={(o) => logOutcome(bake.id, o)}
            onAbandon={() => abandonBake(bake.id)}
          />
        );
      })() : null}

      {route.kind === 'active' ? (
        <ActiveBakes
          bakes={bakes}
          onCancel={closeHome}
          onOpenBake={(id) => navigate({ kind: 'bake', bakeId: id }, 'rise')}
        />
      ) : null}

      {route.kind === 'history' ? (
        <History bakes={bakes} onCancel={closeHome} />
      ) : null}

      {route.kind === 'home' && notifyPerm === 'default' ? (
        <button
          type="button"
          className="notify-prompt"
          onClick={ensureNotifyPerm}
        >
          Enable bake reminders
        </button>
      ) : null}

      {/* Bottom nav visible only on the hub routes — full-flow pages
          (recipe / bake / new-recipe) keep their own back affordance. */}
      {route.kind === 'home' || route.kind === 'active' || route.kind === 'history' ? (
        <nav className="bottom-tabs" role="tablist" aria-label="Sections">
          <button
            type="button"
            role="tab"
            aria-selected={route.kind === 'home'}
            className={`tab ${route.kind === 'home' ? 'tab-active' : ''}`}
            onClick={() => navigate({ kind: 'home' })}
          >
            Home
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={route.kind === 'active'}
            className={`tab ${route.kind === 'active' ? 'tab-active' : ''}`}
            onClick={() => navigate({ kind: 'active' })}
          >
            Active
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={route.kind === 'history'}
            className={`tab ${route.kind === 'history' ? 'tab-active' : ''}`}
            onClick={() => navigate({ kind: 'history' })}
          >
            History
          </button>
        </nav>
      ) : null}
    </>
  );
}
