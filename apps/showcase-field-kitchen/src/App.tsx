import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { ModeTabs, type ModeId } from './components/ModeTabs.tsx';
import { TodayTotals } from './components/TodayTotals.tsx';
import { resolveLocalDb } from './db/runtime.ts';
import {
  ensureSchema,
  todayTotals,
  type TodayTotals as Totals,
} from './db/queries.ts';
import { Brew } from './modes/Brew.tsx';
import { Bake } from './modes/Bake.tsx';
import { Cook } from './modes/Cook.tsx';
import { Hydrate } from './modes/Hydrate.tsx';

const shippie = createShippieIframeSdk({ appId: 'app_field_kitchen' });

const INITIAL_TOTALS: Totals = { brews: 0, bakes_started: 0, meals_cooked: 0, drinks: 0 };

export function App(): ReactElement {
  const db = useMemo(() => resolveLocalDb(), []);
  const [mode, setMode] = useState<ModeId>('brew');
  const [refreshKey, setRefreshKey] = useState(0);
  const [totals, setTotals] = useState<Totals>(INITIAL_TOTALS);
  const [toast, setToast] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  // Boot: ensure schema, then keep totals fresh on every change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureSchema(db);
        const t = await todayTotals(db);
        if (!cancelled) setTotals(t);
      } catch (err) {
        console.warn('[field-kitchen] boot failed', err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const t = await todayTotals(db);
      if (!cancelled) setTotals(t);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, refreshKey, ready]);

  if (!ready) {
    return (
      <div className="app">
        <main className="app-main">
          <section className="page">
            <div className="eyebrow">Field Kitchen</div>
            <p style={{ color: 'var(--muted)' }}>Loading…</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Field Kitchen</h1>
        <ModeTabs current={mode} onChange={setMode} />
      </header>

      <main className="app-main">
        {mode === 'brew' ? (
          <Brew
            db={db}
            shippie={shippie}
            refreshKey={refreshKey}
            onChanged={refresh}
            onToast={showToast}
          />
        ) : null}
        {mode === 'bake' ? (
          <Bake
            db={db}
            shippie={shippie}
            refreshKey={refreshKey}
            onChanged={refresh}
            onToast={showToast}
          />
        ) : null}
        {mode === 'cook' ? (
          <Cook
            db={db}
            shippie={shippie}
            refreshKey={refreshKey}
            onChanged={refresh}
            onToast={showToast}
          />
        ) : null}
        {mode === 'hydrate' ? (
          <Hydrate
            db={db}
            shippie={shippie}
            refreshKey={refreshKey}
            onChanged={refresh}
            onToast={showToast}
          />
        ) : null}
      </main>

      <footer className="app-footer">
        <TodayTotals totals={totals} />
      </footer>

      <button
        type="button"
        className="your-data-button"
        onClick={() => shippie.openYourData({ appSlug: 'field-kitchen' })}
        aria-label="Your data"
      >
        Your Data
      </button>

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
