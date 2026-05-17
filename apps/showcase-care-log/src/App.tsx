/**
 * Care Log — root.
 *
 * Gates on pairing. If the device isn't set up, render the pairing
 * screen (which also offers solo mode). Once set up, bind the shared
 * Y.Doc, mount the tab UI, and render whichever page is active.
 *
 * Solo: still uses IndexedDB persistence (so the log survives reload),
 * but does NOT bind a relay provider — there's no other phone.
 */
import { useEffect, useMemo, useState } from 'react';
import { ROUTES, type Route } from './router.ts';
import {
  bindCareDoc,
  readUnreadHandoverFor,
  type BoundCareDoc,
} from './sync/care-doc.ts';
import {
  loadPairing,
  clearPairing,
  roomIdFor,
  type Pairing,
} from './sync/pairing.ts';
import type { RelayState } from './sync/relay-provider.ts';
import { TabNav } from './components/TabNav.tsx';
import { SyncBar } from './components/SyncBar.tsx';
import { HomePage } from './pages/Home.tsx';
import { MedsPage } from './pages/Meds.tsx';
import { SymptomsPage } from './pages/Symptoms.tsx';
import { HandoverPage } from './pages/Handover.tsx';
import { ReportPage } from './pages/Report.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { PairingScreen } from './pages/Pairing.tsx';
import { useYjs } from './sync/useYjs.ts';
import { createLocalNavigation } from '@shippie/sdk/wrapper';

export function App() {
  const [pairing, setPairing] = useState<Pairing | null>(() => loadPairing());

  if (!pairing) return <PairingScreen onPaired={setPairing} />;

  return (
    <PairedApp
      pairing={pairing}
      onLeaveRoom={() => {
        clearPairing();
        setPairing(null);
      }}
    />
  );
}

interface PairedProps {
  pairing: Pairing;
  onLeaveRoom: () => void;
}

function PairedApp({ pairing, onLeaveRoom }: PairedProps) {
  const [route, setRoute] = useState<Route>('home');
  const localNavigation = useMemo(
    () => createLocalNavigation<Route>('home', setRoute),
    [],
  );
  const bound = useMemo<BoundCareDoc>(
    () =>
      bindCareDoc(
        roomIdFor(pairing.pairCode),
        // No relay in solo mode — local IndexedDB only.
        pairing.solo ? undefined : pairing.pairCode,
      ),
    [pairing.pairCode, pairing.solo],
  );

  useEffect(() => () => bound.destroy(), [bound]);
  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  const [relayState, setRelayState] = useState<RelayState | null>(() =>
    bound.relay ? { ...bound.relay } : null,
  );

  useEffect(() => {
    if (!bound.relay) return;
    const unsub = bound.relay.subscribe((s) => setRelayState({ ...s }));
    return unsub;
  }, [bound]);

  const unread = useYjs(bound.doc, (d) => readUnreadHandoverFor(d, pairing.role));

  function handleNavigate(next: Route) {
    if (ROUTES.includes(next)) {
      void localNavigation.navigate(next, { kind: 'crossfade' });
    }
  }

  return (
    <div className="cl-shell">
      <header className="cl-topbar">
        <p className="cl-eyebrow">Care Log</p>
        <SyncBar
          state={relayState}
          solo={pairing.solo}
          onResync={() => bound.relay?.resync()}
        />
      </header>
      <main className="cl-main">
        {route === 'home' && (
          <HomePage
            doc={bound.doc}
            viewer={pairing.role}
            solo={pairing.solo}
            onNavigate={handleNavigate}
          />
        )}
        {route === 'meds' && <MedsPage doc={bound.doc} viewer={pairing.role} />}
        {route === 'symptoms' && <SymptomsPage doc={bound.doc} viewer={pairing.role} />}
        {route === 'handover' && <HandoverPage doc={bound.doc} viewer={pairing.role} />}
        {route === 'report' && <ReportPage doc={bound.doc} />}
        {route === 'settings' && (
          <SettingsPage doc={bound.doc} pairing={pairing} onLeaveRoom={onLeaveRoom} />
        )}
      </main>
      <TabNav current={route} unread={pairing.solo ? 0 : unread.length} onChange={handleNavigate} />
    </div>
  );
}
