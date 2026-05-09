/**
 * Sip Log root.
 *
 * Surfaces three pages — Today / History / Settings — over a single
 * source of truth held in `useState` and persisted via `db.save()`.
 *
 * Intent broadcasts:
 *   - hydration-logged: every sip with ml > 0.
 *   - caffeine-logged: every sip with mg > 0.
 * Sleep Logger consumes caffeine-logged; Daily Briefing consumes
 * hydration-logged.
 */
import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import {
  load,
  newId,
  pruneOld,
  PRESETS,
  removeSip,
  save,
  updateSip,
  type Sip,
  type SipKind,
  type Targets,
} from './db.ts';
import { Today } from './pages/Today.tsx';
import { History } from './pages/History.tsx';
import { Settings } from './pages/Settings.tsx';
import { CustomSheet } from './components/CustomSheet.tsx';

const shippie = createShippieIframeSdk({ appId: 'app_sip_log' });

type Route = 'today' | 'history' | 'settings';

const TABS: Array<{ id: Route; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const initial = useMemo(() => load(), []);
  const [sips, setSips] = useState<Sip[]>(initial.sips);
  const [targets, setTargets] = useState<Targets>(initial.targets);
  const [route, setRoute] = useState<Route>('today');
  const localNavigation = useMemo(
    () => createLocalNavigation<Route>('today', setRoute),
    [],
  );
  const [customOpen, setCustomOpen] = useState<SipKind | null>(null);

  // Persist on every change.
  useEffect(() => {
    save({ sips, targets });
  }, [sips, targets]);

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  function broadcast(sip: Sip) {
    if (sip.ml > 0) {
      shippie.intent.broadcast('hydration-logged', [
        { ml: sip.ml, kind: sip.kind, logged_at: sip.logged_at },
      ]);
    }
    if (sip.mg > 0) {
      shippie.intent.broadcast('caffeine-logged', [
        { mg: sip.mg, kind: sip.kind, logged_at: sip.logged_at },
      ]);
    }
  }

  function logQuick(kind: SipKind) {
    const preset = PRESETS[kind];
    const sip: Sip = {
      id: newId(),
      kind,
      ml: preset.ml,
      mg: preset.mg,
      logged_at: new Date().toISOString(),
    };
    setSips((prev) => pruneOld([sip, ...prev]));
    shippie.feel.texture('confirm');
    broadcast(sip);
  }

  function logCustom(kind: SipKind, ml: number, mg: number, note: string) {
    const sip: Sip = {
      id: newId(),
      kind,
      ml,
      mg,
      logged_at: new Date().toISOString(),
      ...(note ? { note } : {}),
    };
    setSips((prev) => pruneOld([sip, ...prev]));
    shippie.feel.texture('confirm');
    broadcast(sip);
  }

  function update(id: string, patch: Partial<Omit<Sip, 'id'>>) {
    setSips((prev) => updateSip(prev, id, patch));
    shippie.feel.texture('confirm');
  }

  function remove(id: string) {
    setSips((prev) => removeSip(prev, id));
    shippie.feel.texture('delete');
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>Sip Log</h1>
        <p className="subtitle">water · coffee · tea</p>
      </header>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab ${route === tab.id ? 'tab-on' : ''}`}
            onClick={() => void localNavigation.navigate(tab.id, { kind: 'crossfade' })}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {route === 'today' ? (
        <Today
          sips={sips}
          targets={targets}
          onLog={logQuick}
          onCustom={(k) => setCustomOpen(k)}
          onUpdate={update}
          onRemove={remove}
        />
      ) : null}
      {route === 'history' ? (
        <History sips={sips} targets={targets} onUpdate={update} onRemove={remove} />
      ) : null}
      {route === 'settings' ? <Settings targets={targets} onChange={setTargets} /> : null}

      {customOpen ? (
        <CustomSheet
          kind={customOpen}
          onClose={() => setCustomOpen(null)}
          onSubmit={(kind, ml, mg, note) => {
            logCustom(kind, ml, mg, note);
            setCustomOpen(null);
          }}
        />
      ) : null}
    </main>
  );
}
