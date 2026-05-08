/**
 * Pantry — full inventory view with location filter and bucket grouping.
 *
 * Two views toggle:
 *   • by-expiry (default) — grouped by expiry bucket, soonest first
 *   • by-location — grouped by fridge / pantry / freezer / spice rack
 *
 * The filter chips at the top narrow further so the user can stand in
 * front of the freezer and see only what's in the freezer.
 */
import { useMemo, useState } from 'react';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';
import type { PantryStore } from '../lib/store.ts';
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  groupByBucket,
  type ExpiryBucket,
} from '../lib/expiry.ts';
import {
  LOCATIONS,
  LOCATION_LABELS,
  type Item,
  type Location,
} from '../lib/types.ts';
import { ExpiryRow } from '../components/ExpiryRow.tsx';
import { LocationFilter } from '../components/LocationFilter.tsx';

interface PantryProps {
  shippie: ShippieIframeSdk;
  store: PantryStore;
}

type ViewMode = 'by-expiry' | 'by-location';

export function Pantry({ shippie, store }: PantryProps) {
  const [filter, setFilter] = useState<Location | 'all'>('all');
  const [view, setView] = useState<ViewMode>('by-expiry');

  const filtered = useMemo(
    () =>
      filter === 'all'
        ? store.items
        : store.items.filter((it) => it.location === filter),
    [filter, store.items],
  );

  const byBucket = useMemo(() => groupByBucket(filtered), [filtered]);
  const byLocation = useMemo(() => {
    const out: Record<Location, Item[]> = {
      fridge: [],
      pantry: [],
      freezer: [],
      'spice-rack': [],
    };
    for (const it of filtered) out[it.location].push(it);
    return out;
  }, [filtered]);

  return (
    <main className="page page-pantry">
      <header>
        <h1>Pantry</h1>
        <p>
          {store.items.length} on hand · {filter === 'all' ? 'all locations' : LOCATION_LABELS[filter]}
        </p>
      </header>

      <LocationFilter
        items={store.items}
        active={filter}
        onChange={setFilter}
      />

      <div className="view-toggle" role="tablist" aria-label="Group by">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'by-expiry'}
          className={`loc-chip ${view === 'by-expiry' ? 'active' : ''}`}
          onClick={() => setView('by-expiry')}
        >
          By expiry
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'by-location'}
          className={`loc-chip ${view === 'by-location' ? 'active' : ''}`}
          onClick={() => setView('by-location')}
        >
          By location
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="empty">
          {filter === 'all'
            ? "Nothing yet — head to Add."
            : `Nothing in ${LOCATION_LABELS[filter as Location].toLowerCase()}.`}
        </p>
      ) : view === 'by-expiry' ? (
        <div className="bucket-list">
          {BUCKET_ORDER.map((bucket) => {
            const rows = byBucket[bucket];
            if (rows.length === 0) return null;
            return (
              <section key={bucket} className={`bucket bucket-${bucket}`}>
                <h2>{BUCKET_LABELS[bucket]}</h2>
                <ul className="rows">
                  {rows.map((it) => (
                    <ExpiryRow
                      key={it.id}
                      item={it}
                      onRemove={(id) => store.removeItem(id, 'manual')}
                      onConsume={(id) => store.decrementItem(id, 'manual')}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="bucket-list">
          {LOCATIONS.map((loc) => {
            const rows = byLocation[loc];
            if (rows.length === 0) return null;
            return (
              <section key={loc} className={`bucket bucket-${loc}`}>
                <h2>{LOCATION_LABELS[loc]}</h2>
                <ul className="rows">
                  {rows.map((it) => (
                    <ExpiryRow
                      key={it.id}
                      item={it}
                      onRemove={(id) => store.removeItem(id, 'manual')}
                      onConsume={(id) => store.decrementItem(id, 'manual')}
                      showLocation={false}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
