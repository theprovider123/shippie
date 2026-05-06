import { useCallback, useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
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

export function App() {
  const initial = load();
  const [bakes, setBakes] = useState<Bake[]>(initial.bakes);
  const [customRecipes, setCustomRecipes] = useState<Recipe[]>(initial.recipes);
  const [prefs, setPrefs] = useState<Prefs>(initial.prefs);
  const [route, setRoute] = useState<Route>({ kind: 'home' });
  const [notifyPerm, setNotifyPerm] = useState(notifyStatus());

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
    setRoute({ kind: 'bake', bakeId: bake.id });
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
    setRoute({ kind: 'home' });
  }

  function abandonBake(bakeId: string) {
    if (!confirm('Drop this bake from the active list? It will not be logged in history.')) {
      return;
    }
    setBakes((prev) => prev.filter((b) => b.id !== bakeId));
    setRoute({ kind: 'home' });
  }

  function deleteCustomRecipe(id: string) {
    if (!confirm('Delete this recipe from your library?')) return;
    setCustomRecipes((prev) => prev.filter((r) => r.id !== id));
    setRoute({ kind: 'home' });
  }

  async function ensureNotifyPerm() {
    const next = await requestNotifyPermission();
    setNotifyPerm(next);
    setPrefs((prev) => ({ ...prev, notifyOptIn: next === 'granted' }));
  }

  function openYourData() {
    shippie.openYourData({ appSlug: 'dough' });
  }

  return (
    <>
      {route.kind === 'home' ? (
        <Home
          bakes={bakes}
          customRecipes={customRecipes}
          onPickRecipe={(r) => setRoute({ kind: 'recipe', recipeId: r.id })}
          onNewRecipe={() => setRoute({ kind: 'new-recipe' })}
          onOpenBake={(id) => setRoute({ kind: 'bake', bakeId: id })}
          onOpenActive={() => setRoute({ kind: 'active' })}
          onOpenHistory={() => setRoute({ kind: 'history' })}
        />
      ) : null}

      {route.kind === 'new-recipe' ? (
        <NewRecipe
          defaultMode={lastMode}
          onSave={(recipe) => {
            setCustomRecipes((prev) => [recipe, ...prev]);
            setPrefs((prev) => ({ ...prev, lastMode: modeForLeaven(recipe.leaven) }));
            shippie.feel.texture('confirm');
            setRoute({ kind: 'recipe', recipeId: recipe.id });
          }}
          onCancel={() => setRoute({ kind: 'home' })}
        />
      ) : null}

      {route.kind === 'recipe' ? (() => {
        const recipe = findRecipe(route.recipeId);
        if (!recipe) {
          return (
            <main className="app">
              <p className="muted empty">Recipe not found.</p>
              <button type="button" className="primary" onClick={() => setRoute({ kind: 'home' })}>
                Back home
              </button>
            </main>
          );
        }
        return (
          <RecipePage
            recipe={recipe}
            onCancel={() => setRoute({ kind: 'home' })}
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
              <button type="button" className="primary" onClick={() => setRoute({ kind: 'home' })}>
                Back home
              </button>
            </main>
          );
        }
        return (
          <TimelineView
            bake={bake}
            onCancel={() => setRoute({ kind: 'home' })}
            onLogOutcome={(o) => logOutcome(bake.id, o)}
            onAbandon={() => abandonBake(bake.id)}
          />
        );
      })() : null}

      {route.kind === 'active' ? (
        <ActiveBakes
          bakes={bakes}
          onCancel={() => setRoute({ kind: 'home' })}
          onOpenBake={(id) => setRoute({ kind: 'bake', bakeId: id })}
        />
      ) : null}

      {route.kind === 'history' ? (
        <History bakes={bakes} onCancel={() => setRoute({ kind: 'home' })} />
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

      <button type="button" className="your-data" onClick={openYourData}>
        Your Data
      </button>
    </>
  );
}
