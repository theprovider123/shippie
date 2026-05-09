import { useEffect, useMemo, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import { type Route } from './router.ts';
import { resolveLocalDb } from './db/runtime.ts';
import { ensureSchema } from './db/queries.ts';
import { bindTripDoc, type BoundTripDoc } from './sync/bind-trip.ts';
import { roomIdFor } from './sync/room-code.ts';
import type { RelayState } from './sync/relay-provider.ts';
import { TabNav } from './components/TabNav.tsx';
import { SyncBar } from './components/SyncBar.tsx';
import { TripsPage } from './pages/Trips.tsx';
import { TripPage } from './pages/Trip.tsx';
import { PinDropPage } from './pages/PinDrop.tsx';
import { CompanionsPage, loadCompanion } from './pages/Companions.tsx';

interface Companion {
  roomCode: string;
  passphrase: string;
}

export function App() {
  const [db, setDb] = useState<ShippieLocalDb | null>(null);
  const [route, setRoute] = useState<Route>('trips');
  const localNavigation = useMemo(
    () => createLocalNavigation<Route>('trips', setRoute),
    [],
  );
  const [activeTrip, setActiveTrip] = useState<string | null>(null);
  const [companion, setCompanion] = useState<Companion | null>(() => loadCompanion());

  useEffect(() => {
    void (async () => {
      const resolved = await resolveLocalDb();
      await ensureSchema(resolved);
      setDb(resolved);
    })();
  }, []);

  const bound = useMemo<BoundTripDoc | null>(() => {
    if (!companion) return null;
    return bindTripDoc({
      roomId: roomIdFor(companion.roomCode),
      passphrase: companion.passphrase,
    });
  }, [companion]);

  useEffect(() => () => bound?.destroy(), [bound]);
  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  const [relayState, setRelayState] = useState<RelayState | null>(() =>
    bound?.relay ? { ...bound.relay } : null,
  );

  useEffect(() => {
    if (!bound?.relay) {
      setRelayState(null);
      return;
    }
    const unsub = bound.relay.subscribe((s) => setRelayState({ ...s }));
    setRelayState({ ...bound.relay });
    return unsub;
  }, [bound]);

  function go(next: Route) {
    void localNavigation.navigate(next, { kind: 'crossfade' });
  }

  function openTrip(id: string) {
    setActiveTrip(id);
    void localNavigation.navigate('trip', { kind: 'rise' });
  }

  function backToTrips() {
    setActiveTrip(null);
    void localNavigation.backOrReplace('trips', { kind: 'crossfade' });
  }

  if (!db) {
    return (
      <div className="atlas-app">
        <p className="atlas-empty">Loading…</p>
      </div>
    );
  }

  return (
    <div className="atlas-app">
      <header className="atlas-header">
        <p className="atlas-app-eyebrow">Atlas</p>
        <SyncBar state={relayState} onResync={() => bound?.relay?.resync()} />
      </header>
      <main className="atlas-main">
        {route === 'trips' && <TripsPage db={db} onOpen={openTrip} />}
        {route === 'trip' && activeTrip && (
          <TripPage db={db} tripId={activeTrip} onBack={backToTrips} onAddStop={() => go('pin')} />
        )}
        {route === 'pin' && (
          <PinDropPage
            db={db}
            onPinned={(tripId) => {
              setActiveTrip(tripId);
              void localNavigation.backOrReplace('trip', { kind: 'crossfade' });
            }}
          />
        )}
        {route === 'companions' && (
          <CompanionsPage current={companion} onChange={setCompanion} />
        )}
      </main>
      <TabNav current={route} onChange={go} />
    </div>
  );
}
