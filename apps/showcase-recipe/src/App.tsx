import { useEffect, useState } from 'react';
import { RecipeList } from './pages/RecipeList.tsx';
import { RecipeEdit } from './pages/RecipeEdit.tsx';
import { CookingMode } from './pages/CookingMode.tsx';
import { resolveLocalDb } from './db/runtime.ts';
import { seedIfEmpty } from './db/seed.ts';
import { wrapNavigation } from '@shippie/sdk/wrapper';

interface ShippieRoot {
  openYourData?: () => void;
}

type Route =
  | { kind: 'list' }
  | { kind: 'edit'; recipeId: string | null }
  | { kind: 'cook'; recipeId: string };

export function App() {
  const [route, setRoute] = useState<Route>({ kind: 'list' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [seedNote, setSeedNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const db = resolveLocalDb();
    (async () => {
      try {
        const result = await seedIfEmpty(db);
        if (!cancelled && result.seeded) {
          setSeedNote(`Seeded ${result.count} example recipes — swipe to delete any of them.`);
          window.setTimeout(() => !cancelled && setSeedNote(null), 6000);
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

  const navigate = (next: Route) => {
    void wrapNavigation(() => setRoute(next), { kind: next.kind === 'list' ? 'crossfade' : 'rise' });
  };

  const openYourData = () => {
    if (typeof window === 'undefined') return;
    const shippie = (window as unknown as { shippie?: ShippieRoot }).shippie;
    if (typeof shippie?.openYourData === 'function') {
      shippie.openYourData();
    } else {
      // Standalone fallback: open the worker route. Works even if SDK not loaded.
      window.open('/__shippie/data', '_blank', 'noopener');
    }
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
    </div>
  );
}
