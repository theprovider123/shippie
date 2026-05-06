import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { deleteDrink, isoDay, listDrinks, logDrink } from '../db/queries.ts';
import { DRINK_KINDS, DRINK_LABEL, type Drink, type DrinkKind } from '../db/schema.ts';
import { APPROX_CAFFEINE_MG } from '../intents.ts';

interface HydrateProps {
  db: ShippieLocalDb;
  shippie: ShippieIframeSdk;
  refreshKey: number;
  onChanged: () => void;
  onToast: (msg: string) => void;
}

export function Hydrate({ db, shippie, refreshKey, onChanged, onToast }: HydrateProps): ReactElement {
  const [drinks, setDrinks] = useState<Drink[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listDrinks(db, 50);
      if (!cancelled) setDrinks(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, refreshKey]);

  const today = useMemo(() => {
    const dayKey = isoDay(new Date());
    return drinks.filter((d) => isoDay(new Date(d.logged_at)) === dayKey);
  }, [drinks]);

  async function tap(kind: DrinkKind) {
    const drink = await logDrink(db, kind);
    setDrinks((prev) => [drink, ...prev].slice(0, 50));
    onChanged();
    shippie.feel.texture('confirm');
    shippie.intent.broadcast('hydration', [
      { kind: drink.kind, logged_at: drink.logged_at },
    ]);
    if (kind === 'coffee' || kind === 'tea') {
      shippie.intent.broadcast('caffeine-logged', [
        {
          kind,
          mg: APPROX_CAFFEINE_MG[kind],
          logged_at: drink.logged_at,
        },
      ]);
    }
  }

  async function remove(id: string) {
    await deleteDrink(db, id);
    setDrinks((prev) => prev.filter((d) => d.id !== id));
    onChanged();
    onToast('Removed.');
  }

  return (
    <section className="page mode-page">
      <header className="page-header">
        <h2>Hydrate</h2>
        <span className="eyebrow">{today.length} today</span>
      </header>

      <div className="card">
        <div className="card-label">Log a drink</div>
        <div className="drink-grid">
          {DRINK_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className="drink-button"
              onClick={() => tap(k)}
            >
              {DRINK_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-label">Today</div>
        {today.length === 0 ? (
          <div className="empty-state">No drinks logged today.</div>
        ) : (
          <ul className="recent-list" role="list">
            {today.map((d) => (
              <li key={d.id} className="recent-row">
                <span>{DRINK_LABEL[d.kind]}</span>
                <span className="recent-meta">
                  {new Date(d.logged_at).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
                <button
                  type="button"
                  className="bean-remove"
                  onClick={() => remove(d.id)}
                  aria-label={`Remove ${DRINK_LABEL[d.kind]} log`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
