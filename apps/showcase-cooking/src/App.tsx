/**
 * Cooking — top-level shell. Tab nav: Home / Active / History / Temps.
 * Method-specific guides live one level down from Home.
 *
 * State invariants:
 *   - One source of truth for cooks (localStorage via db.ts).
 *   - The "currently composed cook" (cut + method) is derived UI state,
 *     not persisted.
 *   - Active cooks are persisted records with finished_at = null.
 */

import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import { CUTS, METHOD_LABEL, type Cut, type Doneness, type Method } from './data.ts';
import { load, newId, save, isActive, type Cook } from './db.ts';
import { Home } from './pages/Home.tsx';
import { MethodPage } from './pages/Method.tsx';
import { ActiveCooks } from './pages/ActiveCooks.tsx';
import { History } from './pages/History.tsx';
import { InternalTemps } from './pages/InternalTemps.tsx';
import { CookTimer } from './components/CookTimer.tsx';
import { DoneRatingForm } from './components/DoneRatingForm.tsx';

const shippie = createShippieIframeSdk({ appId: 'app_cooking' });

type Tab = 'home' | 'method' | 'active' | 'history' | 'temps';

const TABS: ReadonlyArray<{ id: Tab; label: string; activeOnly?: boolean }> = [
  { id: 'home', label: 'Cook' },
  { id: 'active', label: 'Active' },
  { id: 'history', label: 'History' },
  { id: 'temps', label: 'Temps' },
];

export function App() {
  const initial = load();
  const [cooks, setCooks] = useState<Cook[]>(initial.cooks);
  const [tab, setTab] = useState<Tab>('home');
  const localNavigation = useMemo(
    () => createLocalNavigation<Tab>('home', setTab),
    [],
  );

  // The "currently composed cook" — drives Home + Method page.
  const [cutId, setCutId] = useState<string>(CUTS[0]!.id);
  const [method, setMethod] = useState<Method>(CUTS[0]!.methods[0]!);

  // The cook the timer is tracking. When the user lands on /method from
  // Active, the timer for that cook surfaces above the guide.
  const [trackedCookId, setTrackedCookId] = useState<string | null>(null);
  // Pending rating form after marking cooked.
  const [pendingRatingFor, setPendingRatingFor] = useState<Cook | null>(null);

  useEffect(() => {
    save({ cooks });
  }, [cooks]);

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  const cut = useMemo<Cut>(
    () => CUTS.find((c) => c.id === cutId) ?? CUTS[0]!,
    [cutId],
  );
  const effectiveMethod: Method = cut.methods.includes(method)
    ? method
    : cut.methods[0]!;

  const activeCooks = useMemo(() => cooks.filter(isActive), [cooks]);
  const trackedCook = trackedCookId
    ? cooks.find((c) => c.id === trackedCookId) ?? null
    : null;

  function pickCut(c: Cut) {
    setCutId(c.id);
    if (!c.methods.includes(method)) setMethod(c.methods[0]!);
  }

  function pickMethod(m: Method) {
    setMethod(m);
  }

  function startCook(args: { target_c: number; minutes: number; weight_kg: number | null; doneness: Doneness | null }) {
    const cook: Cook = {
      id: newId(),
      cut_id: cut.id,
      cut_name: cut.name,
      method: effectiveMethod,
      doneness: args.doneness,
      weight_kg: args.weight_kg,
      target_temp_c: args.target_c,
      cook_minutes: args.minutes,
      rest_minutes: cut.timing[effectiveMethod]?.rest_minutes ?? 0,
      started_at: new Date().toISOString(),
      finished_at: null,
      rating: null,
      note: null,
    };
    setCooks((prev) => [cook, ...prev].slice(0, 200));
    setTrackedCookId(cook.id);
    shippie.feel.texture('confirm');
    shippie.intent.broadcast('cooking-now', [
      {
        method: cook.method,
        cut: cook.cut_name,
        target_temp_c: cook.target_temp_c,
        weight_kg: cook.weight_kg,
        started_at: cook.started_at,
        est_finish_at: new Date(
          Date.now() + (cook.cook_minutes + cook.rest_minutes) * 60_000,
        ).toISOString(),
      },
    ]);
  }

  function markCooked(cookId: string) {
    const cook = cooks.find((c) => c.id === cookId);
    if (!cook) return;
    const finishedAt = new Date().toISOString();
    setCooks((prev) =>
      prev.map((c) => (c.id === cookId ? { ...c, finished_at: finishedAt } : c)),
    );
    if (trackedCookId === cookId) setTrackedCookId(null);
    shippie.feel.texture('milestone');
    setPendingRatingFor({ ...cook, finished_at: finishedAt });
  }

  function saveRating(rating: number, note: string) {
    if (!pendingRatingFor) return;
    const id = pendingRatingFor.id;
    const finishedAt = pendingRatingFor.finished_at ?? new Date().toISOString();
    const intentPayload: Cook['intent_payload'] = {
      cut: pendingRatingFor.cut_name,
      method: pendingRatingFor.method,
      cookedAt: finishedAt,
      rating: rating || null,
    };
    setCooks((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              rating: rating || null,
              note: note || null,
              intent_payload: intentPayload,
            }
          : c,
      ),
    );
    shippie.intent.broadcast('cooked-meal', [intentPayload]);
    setPendingRatingFor(null);
  }

  function skipRating() {
    if (!pendingRatingFor) return;
    const intentPayload: Cook['intent_payload'] = {
      cut: pendingRatingFor.cut_name,
      method: pendingRatingFor.method,
      cookedAt: pendingRatingFor.finished_at ?? new Date().toISOString(),
      rating: null,
    };
    setCooks((prev) =>
      prev.map((c) =>
        c.id === pendingRatingFor.id ? { ...c, intent_payload: intentPayload } : c,
      ),
    );
    shippie.intent.broadcast('cooked-meal', [intentPayload]);
    setPendingRatingFor(null);
  }

  function cancelCook(cookId: string) {
    setCooks((prev) => prev.filter((c) => c.id !== cookId));
    if (trackedCookId === cookId) setTrackedCookId(null);
  }

  function selectActive(c: Cook) {
    setCutId(c.cut_id);
    setMethod(c.method);
    setTrackedCookId(c.id);
    void localNavigation.navigate('method', { kind: 'rise' });
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>Cooking</h1>
        <p className="subtitle">method · cut · target temp</p>
      </header>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'tab--active' : ''}`}
            onClick={() => void localNavigation.navigate(t.id, { kind: 'crossfade' })}
          >
            {t.label}
            {t.id === 'active' && activeCooks.length > 0 ? (
              <span className="tab-pill" aria-live="polite" aria-label={`${activeCooks.length} active cooks`}>
                {activeCooks.length}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {/* Pending rating overlay — shown on top of any tab. */}
      {pendingRatingFor ? (
        <div className="done-overlay" role="dialog" aria-modal="true" aria-label="Rate cook">
          <DoneRatingForm
            cutName={pendingRatingFor.cut_name}
            onSubmit={saveRating}
            onSkip={skipRating}
          />
        </div>
      ) : null}

      {tab === 'home' ? (
        <Home
          cut={cut}
          method={effectiveMethod}
          onPickCut={pickCut}
          onPickMethod={pickMethod}
          onOpenGuide={() => void localNavigation.navigate('method', { kind: 'rise' })}
        />
      ) : null}

      {tab === 'method' ? (
        <div className="page page--method">
          <button
            type="button"
            className="back-link"
            onClick={() => void localNavigation.backOrReplace('home', { kind: 'crossfade' })}
          >
            ← back
          </button>
          <p className="method-breadcrumb muted small">
            {cut.name} · {METHOD_LABEL[effectiveMethod]}
          </p>
          {trackedCook ? (
            <CookTimer
              cook={trackedCook}
              onMarkCooked={() => markCooked(trackedCook.id)}
              onCancel={() => cancelCook(trackedCook.id)}
            />
          ) : null}
          {!trackedCook ? (
            <MethodPage cut={cut} method={effectiveMethod} onStart={startCook} />
          ) : null}
        </div>
      ) : null}

      {tab === 'active' ? (
        <ActiveCooks cooks={activeCooks} onSelect={selectActive} />
      ) : null}

      {tab === 'history' ? <History cooks={cooks} /> : null}

      {tab === 'temps' ? <InternalTemps /> : null}

    </main>
  );
}
