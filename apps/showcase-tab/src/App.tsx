import { useEffect, useMemo, useState } from 'react';
import { ROUTES, type Route } from './router.ts';
import {
  bindTabDoc,
  announceMember,
  ensureMeta,
  type BoundTabDoc,
} from './sync/tab-doc.ts';
import {
  loadPairing,
  clearPairing,
  roomSlugFor,
  type TabPairing,
} from './sync/pairing.ts';
import type { RelayState } from './sync/relay-provider.ts';
import { TabNav } from './components/TabNav.tsx';
import { SyncBar } from './components/SyncBar.tsx';
import { TabPage } from './pages/Tab.tsx';
import { SettlementPage } from './pages/Settlement.tsx';
import { MembersPage } from './pages/Members.tsx';
import { PairingScreen } from './pages/Pairing.tsx';

export function App() {
  const [pairing, setPairing] = useState<TabPairing | null>(() => loadPairing());

  if (!pairing) return <PairingScreen onPaired={setPairing} />;

  return (
    <PairedTab
      pairing={pairing}
      onLeave={() => {
        clearPairing();
        setPairing(null);
      }}
    />
  );
}

interface PairedProps {
  pairing: TabPairing;
  onLeave: () => void;
}

function PairedTab({ pairing, onLeave }: PairedProps) {
  const [route, setRoute] = useState<Route>('tab');
  const bound = useMemo<BoundTabDoc>(
    () => bindTabDoc(roomSlugFor(pairing.roomCode), pairing.phrase),
    [pairing.roomCode, pairing.phrase],
  );

  useEffect(() => {
    bound.whenSynced.then(() => {
      ensureMeta(bound.doc, { currency: 'GBP', label: '' });
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
    <div className="tab-app">
      <header className="tab-header">
        <p className="tab-app-eyebrow">Tab</p>
        <SyncBar state={relayState} onResync={() => bound.relay?.resync()} />
      </header>
      <main className="tab-main">
        {route === 'tab' && <TabPage doc={bound.doc} myMemberId={pairing.memberId} />}
        {route === 'settle' && (
          <SettlementPage doc={bound.doc} myMemberId={pairing.memberId} />
        )}
        {route === 'members' && (
          <MembersPage doc={bound.doc} pairing={pairing} onLeave={onLeave} />
        )}
      </main>
      <TabNav current={route} onChange={handleNavigate} />
    </div>
  );
}
