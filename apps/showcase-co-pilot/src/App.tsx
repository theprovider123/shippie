/**
 * Co-Pilot — root.
 *
 * Gates on pairing. If the device isn't paired, render the pairing
 * screen. Once paired, bind the shared Y.Doc, mount the tab UI, and
 * render whichever page is active.
 *
 * The shared room id derives from the pair code via a one-way hash, so
 * two phones with the same code converge on the same room without ever
 * sending the human-readable code to the relay.
 */
import { useEffect, useMemo, useState } from 'react';
import { ROUTES, type Route } from './router.ts';
import {
  bindCoParentDoc,
  readUnreadHandoverFor,
  type BoundCoParentDoc,
} from './sync/coparent-doc.ts';
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
import { SchedulePage } from './pages/Schedule.tsx';
import { MedsPage } from './pages/Meds.tsx';
import { HandoverPage } from './pages/Handover.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { PairingScreen } from './pages/Pairing.tsx';
import { useYjs } from './sync/useYjs.ts';
import { createLocalNavigation } from '@shippie/sdk/wrapper';

export function App() {
  const [pairing, setPairing] = useState<Pairing | null>(() => loadPairing());

  if (!pairing) return <PairingScreen onPaired={setPairing} />;

  return <PairedApp pairing={pairing} onLeaveRoom={() => { clearPairing(); setPairing(null); }} />;
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
  const bound = useMemo<BoundCoParentDoc>(
    () => bindCoParentDoc(roomIdFor(pairing.pairCode), pairing.pairCode),
    [pairing.pairCode],
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
    <div className="co-app">
      <header className="co-header">
        <p className="co-eyebrow">Co-Pilot</p>
        <SyncBar state={relayState} onResync={() => bound.relay?.resync()} />
      </header>
      <main className="co-main">
        {route === 'home' && (
          <HomePage doc={bound.doc} viewer={pairing.role} onNavigate={handleNavigate} />
        )}
        {route === 'schedule' && (
          <SchedulePage doc={bound.doc} viewer={pairing.role} />
        )}
        {route === 'meds' && (
          <MedsPage doc={bound.doc} viewer={pairing.role} />
        )}
        {route === 'handover' && (
          <HandoverPage doc={bound.doc} viewer={pairing.role} />
        )}
        {route === 'settings' && (
          <SettingsPage pairing={pairing} onLeaveRoom={onLeaveRoom} />
        )}
      </main>
      <TabNav current={route} unread={unread.length} onChange={handleNavigate} />
    </div>
  );
}
