/**
 * Pantry Scanner — top-level shell. Tab nav + page routing + cross-app
 * intent listeners.
 *
 * Listeners we mount:
 *   • cooked-meal       → decrement matching pantry rows by 1 each.
 *   • dined-out         → no decrement; recorded for analytics only.
 *   • needs-restocking  → "got these — log to pantry?" bulk-add prompt.
 */
import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { Today } from './pages/Today.tsx';
import { Scan } from './pages/Scan.tsx';
import { Pantry } from './pages/Pantry.tsx';
import { Recipes } from './pages/Recipes.tsx';
import { Settings } from './pages/Settings.tsx';
import { usePantryStore } from './lib/store.ts';
import type { CookedMealRow, NeedsRestockingRow } from './lib/types.ts';

const shippie = createShippieIframeSdk({ appId: 'app_pantry_scanner' });

type Tab = 'today' | 'scan' | 'pantry' | 'recipes' | 'settings';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'scan', label: 'Add' },
  { id: 'pantry', label: 'Pantry' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'settings', label: 'Settings' },
];

interface RestockOffer {
  names: string[];
  receivedAt: number;
}

export function App() {
  const [tab, setTab] = useState<Tab>('today');
  const store = usePantryStore(shippie);
  const [restockOffer, setRestockOffer] = useState<RestockOffer | null>(null);
  const [bulkAddNote, setBulkAddNote] = useState<string | null>(null);

  // Subscribe to cooked-meal: decrement matching rows by 1.
  useEffect(() => {
    shippie.requestIntent('cooked-meal');
    return shippie.intent.subscribe('cooked-meal', ({ rows }) => {
      const ingredients = collectIngredientNames(rows);
      if (ingredients.length === 0) return;
      const decremented = store.recordCookedMeal(ingredients);
      if (decremented.length > 0) {
        setBulkAddNote(`Decremented: ${decremented.join(', ')}`);
        shippie.feel.texture('toggle');
      }
    });
  }, [store]);

  // Subscribe to dined-out: no decrement, just feel.
  useEffect(() => {
    shippie.requestIntent('dined-out');
    return shippie.intent.subscribe('dined-out', () => {
      // noop; future: log to a separate "eaten elsewhere" stream.
    });
  }, []);

  // Subscribe to needs-restocking: surface a one-tap bulk-add card.
  useEffect(() => {
    shippie.requestIntent('needs-restocking');
    return shippie.intent.subscribe('needs-restocking', ({ rows }) => {
      const names = (rows as readonly NeedsRestockingRow[])
        .map((r) => r?.name)
        .filter((n): n is string => typeof n === 'string' && n.length > 0);
      if (names.length === 0) return;
      setRestockOffer({ names, receivedAt: Date.now() });
    });
  }, []);

  // Auto-clear the bulk-add note.
  useEffect(() => {
    if (!bulkAddNote) return;
    const t = setTimeout(() => setBulkAddNote(null), 5000);
    return () => clearTimeout(t);
  }, [bulkAddNote]);

  function acceptRestock() {
    if (!restockOffer) return;
    for (const name of restockOffer.names) {
      store.addItem({ name });
    }
    shippie.feel.texture('confirm');
    setBulkAddNote(`Added ${restockOffer.names.length} from shopping list`);
    setRestockOffer(null);
  }

  function dismissRestock() {
    setRestockOffer(null);
  }

  const page = useMemo(() => {
    switch (tab) {
      case 'today':
        return (
          <Today
            shippie={shippie}
            store={store}
            onNavigateScan={() => setTab('scan')}
          />
        );
      case 'scan':
        return <Scan shippie={shippie} store={store} />;
      case 'pantry':
        return <Pantry shippie={shippie} store={store} />;
      case 'recipes':
        return <Recipes shippie={shippie} store={store} />;
      case 'settings':
        return <Settings shippie={shippie} store={store} />;
    }
  }, [tab, store]);

  return (
    <div className="app">
      {restockOffer && (
        <aside className="restock-card" role="dialog" aria-label="Bulk add from shopping list">
          <strong>Got these?</strong>
          <p className="hint">
            {restockOffer.names.slice(0, 4).join(', ')}
            {restockOffer.names.length > 4
              ? ` and ${restockOffer.names.length - 4} more`
              : ''}
            {' '}— log them to pantry in one tap.
          </p>
          <div className="row">
            <button
              type="button"
              className="row-btn row-btn-primary"
              onClick={acceptRestock}
            >
              Add {restockOffer.names.length}
            </button>
            <button
              type="button"
              className="row-btn row-btn-ghost"
              onClick={dismissRestock}
            >
              Not yet
            </button>
          </div>
        </aside>
      )}

      {bulkAddNote && (
        <p className="bulk-add-note status status-ok" role="status">
          {bulkAddNote}
        </p>
      )}

      {page}

      <nav className="tab-bar" aria-label="Pantry sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => {
              setTab(t.id);
              shippie.feel.texture('navigate');
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function collectIngredientNames(rows: ReadonlyArray<unknown>): string[] {
  const out: string[] = [];
  for (const row of rows as readonly CookedMealRow[]) {
    if (!row) continue;
    if (Array.isArray(row.ingredients)) {
      for (const ing of row.ingredients) {
        if (ing && typeof ing.name === 'string') out.push(ing.name);
      }
    }
  }
  return out;
}
