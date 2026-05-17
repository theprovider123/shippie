/**
 * Prices page — per-item per-store comparison. Lists every item that
 * has at least one logged price, sorted with most-recently-priced on
 * top.
 */
import { useMemo } from 'react';
import type { ListItem, StoreProfile } from '../lib/types.ts';
import { PriceCompare } from '../components/PriceCompare.tsx';

interface PricesPageProps {
  items: readonly ListItem[];
  profiles: readonly StoreProfile[];
  onBack: () => void;
}

export function PricesPage({ items, profiles, onBack }: PricesPageProps) {
  const priced = useMemo(() => {
    return items
      .filter((i) => i.prices && i.prices.length > 0)
      .map((i) => ({
        item: i,
        last: lastObservedAt(i),
      }))
      .sort((a, b) => (b.last || '').localeCompare(a.last || ''))
      .map((x) => x.item);
  }, [items]);

  return (
    <main>
      <header className="page-header">
        <button type="button" className="ghost" onClick={onBack} aria-label="Back to list">
          ← Back
        </button>
        <h1>Prices</h1>
      </header>

      <p className="hint">
        These are prices you logged — estimates, not real-time scrapes.
      </p>

      {priced.length === 0 ? (
        <p className="empty">Tap "+" on a list item to log a price at the store you're at.</p>
      ) : (
        <div className="prices-grid">
          {priced.map((item) => (
            <PriceCompare key={item.id} item={item} profiles={profiles} />
          ))}
        </div>
      )}
    </main>
  );
}

function lastObservedAt(item: ListItem): string {
  if (!item.prices || item.prices.length === 0) return '';
  let max = '';
  for (const o of item.prices) {
    if (o.observedAt > max) max = o.observedAt;
  }
  return max;
}
