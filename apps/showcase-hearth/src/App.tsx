import { useEffect, useMemo, useState } from 'react';
import { ROUTES, type Route } from './router.ts';
import {
  bindHearthDoc,
  announceMember,
  type BoundHearthDoc,
} from './sync/hearth-doc.ts';
import {
  loadPairing,
  clearPairing,
  roomSlugFor,
  type HousePairing,
} from './sync/pairing.ts';
import type { RelayState } from './sync/relay-provider.ts';
import { TabNav } from './components/TabNav.tsx';
import { SyncBar } from './components/SyncBar.tsx';
import { TodayPage } from './pages/Today.tsx';
import { ChoresPage } from './pages/Chores.tsx';
import { FridgePage } from './pages/Fridge.tsx';
import { DinnerPage } from './pages/Dinner.tsx';
import { HousePage } from './pages/House.tsx';
import { PairingScreen } from './pages/Pairing.tsx';

export function App() {
  const [pairing, setPairing] = useState<HousePairing | null>(() => loadPairing());

  if (!pairing) return <PairingScreen onPaired={setPairing} />;

  return <PairedHearth pairing={pairing} onLeave={() => { clearPairing(); setPairing(null); }} />;
}

interface PairedProps {
  pairing: HousePairing;
  onLeave: () => void;
}

function PairedHearth({ pairing, onLeave }: PairedProps) {
  const [route, setRoute] = useState<Route>('today');
  const bound = useMemo<BoundHearthDoc>(
    () => bindHearthDoc(roomSlugFor(pairing.roomCode), pairing.phrase),
    [pairing.roomCode, pairing.phrase],
  );

  useEffect(() => {
    bound.whenSynced.then(() => {
      announceMember(bound.doc, pairing.memberId, pairing.memberName);
    });
    return () => bound.destroy();
  }, [bound, pairing.memberId, pairing.memberName]);

  const [relayState, setRelayState] = useState<RelayState | null>(() =>
    bound.relay ? { ...bound.relay } : null,
  );

  useEffect(() => {
    if (!bound.relay) return;
    const unsub = bound.relay.subscribe((s) => setRelayState({ ...s }));
    return unsub;
  }, [bound]);

  function handleNavigate(next: Route) {
    if (ROUTES.includes(next)) setRoute(next);
  }

  return (
    <div className="hearth-app">
      <header className="hearth-header">
        <p className="hearth-app-eyebrow">Hearth</p>
        <SyncBar state={relayState} onResync={() => bound.relay?.resync()} />
      </header>
      <main className="hearth-main">
        {route === 'today' && (
          <TodayPage doc={bound.doc} myMemberId={pairing.memberId} onNavigate={handleNavigate} />
        )}
        {route === 'chores' && (
          <ChoresPage doc={bound.doc} myMemberId={pairing.memberId} />
        )}
        {route === 'fridge' && (
          <FridgePage doc={bound.doc} myMemberId={pairing.memberId} />
        )}
        {route === 'dinner' && (
          <DinnerPage doc={bound.doc} myMemberId={pairing.memberId} />
        )}
        {route === 'house' && (
          <HousePage doc={bound.doc} pairing={pairing} onLeave={onLeave} />
        )}
      </main>
      <TabNav current={route} onChange={handleNavigate} />
    </div>
  );
}
