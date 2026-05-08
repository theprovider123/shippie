/**
 * Today — the headline page. Three blocks, in this order:
 *   1. Use these in the next 3 days (sorted soonest first, red on top)
 *   2. Probably out (low-stock prediction from consumption history)
 *   3. Make this with what you've got (recipe suggestions)
 *
 * The page is the killer-app surface: open the showcase, see the three
 * questions a kitchen-counter actually asks.
 */
import { useMemo } from 'react';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';
import type { PantryStore } from '../lib/store.ts';
import { urgentItems, phraseDays, daysUntil } from '../lib/expiry.ts';
import {
  predictLowStock,
  type LowStockPrediction,
} from '../lib/low-stock-predict.ts';
import { suggestRecipes } from '../lib/suggest-recipes.ts';
import { ExpiryRow } from '../components/ExpiryRow.tsx';
import { LowStockPredictor } from '../components/LowStockPredictor.tsx';
import { RecipeSuggestionCard } from '../components/RecipeSuggestion.tsx';

interface TodayProps {
  shippie: ShippieIframeSdk;
  store: PantryStore;
  onNavigateScan: () => void;
}

export function Today({ shippie, store, onNavigateScan }: TodayProps) {
  const { items, consumption } = store;

  const urgent = useMemo(() => urgentItems(items), [items]);
  const predictions = useMemo(
    () => predictLowStock(consumption, { inStock: items }),
    [consumption, items],
  );
  const suggestions = useMemo(() => suggestRecipes(items), [items]);

  function addPredictionToList(p: LowStockPrediction) {
    shippie.intent.broadcast('pantry-low', [
      {
        name: p.name,
        lastSeenAt: new Date().toISOString(),
        confidence: 'predicted',
      },
    ]);
    shippie.feel.texture('confirm');
  }

  // Empty state — first-run users see what this app is for.
  if (items.length === 0 && consumption.length === 0) {
    return (
      <main className="page page-today">
        <header>
          <h1>Pantry</h1>
          <p>Empty. Scan or add an item to get going.</p>
        </header>
        <section className="empty-card">
          <h2>What this does</h2>
          <ul className="empty-list">
            <li>Tracks what you've got, when it expires, and where it is.</li>
            <li>Notices when you usually have eggs and you're out.</li>
            <li>Suggests recipes from what's currently on the shelf.</li>
          </ul>
          <button
            type="button"
            className="row-btn row-btn-primary"
            onClick={onNavigateScan}
          >
            Add your first item
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page page-today">
      <header>
        <h1>Today</h1>
        <p>
          {items.length} on hand
          {urgent.length > 0 && ` · ${urgent.length} need attention`}
        </p>
      </header>

      {urgent.length > 0 ? (
        <section className="urgent">
          <h2>Use soon</h2>
          <ul className="rows">
            {urgent.slice(0, 6).map((it) => (
              <ExpiryRow
                key={it.id}
                item={it}
                onRemove={(id) => store.removeItem(id, 'expired-out')}
                onConsume={(id) => store.decrementItem(id, 'manual')}
              />
            ))}
          </ul>
          {urgent.length > 6 && (
            <p className="hint">
              +{urgent.length - 6} more — see Pantry tab.
            </p>
          )}
        </section>
      ) : items.length > 0 ? (
        <section className="urgent">
          <h2>Nothing urgent</h2>
          <p className="hint">
            {soonestPhrase(items)}
          </p>
        </section>
      ) : null}

      <LowStockPredictor
        predictions={predictions}
        onAdd={addPredictionToList}
      />

      {suggestions.length > 0 && (
        <section className="recipes">
          <h2>Make this</h2>
          <div className="recipes-grid">
            {suggestions.map((s) => (
              <RecipeSuggestionCard key={s.recipe.id} suggestion={s} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function soonestPhrase(items: readonly { expiresOn?: string }[]): string {
  let soonestDays: number | null = null;
  for (const it of items) {
    if (!it.expiresOn) continue;
    const d = daysUntil(it.expiresOn);
    if (!Number.isFinite(d)) continue;
    if (soonestDays === null || d < soonestDays) soonestDays = d;
  }
  if (soonestDays === null) return 'No expiry dates set on anything yet.';
  return `Soonest expiry: ${phraseDays(soonestDays)}.`;
}
