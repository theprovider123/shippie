import { useEffect, useMemo, useState } from 'react';
import { CardScreen } from './screens/CardScreen';
import { ReadinessChip } from './components/ReadinessChip';
import { MapScreen } from './screens/MapScreen';
import { MeetScreen } from './screens/MeetScreen';
import { PlanScreen } from './screens/PlanScreen';
import { PulseScreen } from './screens/PulseScreen';
import { SafetyScreen } from './screens/SafetyScreen';
import { decodePlan, type GroupPlan } from './lib/group-plan';
import {
  listBusMarkers,
  listFanEvents,
  loadGroupPlan,
  saveFanEvent,
  saveFanEvents,
  saveGroupPlan,
} from './lib/shippie-db';
import { loadRoutePack } from './lib/route-pack';
import type { BusMarker } from './lib/bus';
import { decodeFanEventsSync, dedupeFanEvents, sortEvents, type FanEvent } from './lib/fan-events';

type Screen = 'pulse' | 'map' | 'plan' | 'meet' | 'safety' | 'card';

const nav: Array<{ id: Screen; label: string }> = [
  { id: 'pulse', label: 'Pulse' },
  { id: 'map', label: 'Map' },
  { id: 'plan', label: 'Plan' },
  { id: 'meet', label: 'Meet' },
  { id: 'safety', label: 'Safety' },
  { id: 'card', label: 'Card' },
];

export function App() {
  const pack = useMemo(() => loadRoutePack(), []);
  const [active, setActive] = useState<Screen>('map');
  const [plan, setPlan] = useState<GroupPlan | null>(null);
  const [pendingImport, setPendingImport] = useState<GroupPlan | null>(null);
  const [busMarkers, setBusMarkers] = useState<BusMarker[]>([]);
  const [fanEvents, setFanEvents] = useState<FanEvent[]>([]);
  const [importStatus, setImportStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    void loadGroupPlan().then((saved) => {
      if (!cancelled) setPlan(saved);
    });
    void listBusMarkers().then((rows) => {
      if (!cancelled) setBusMarkers(rows);
    });
    void listFanEvents().then((rows) => {
      if (!cancelled) setFanEvents(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handleHash = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      void (async () => {
        const syncedEvents = await decodeFanEventsSync(hash);
        if (cancelled) return;
        if (syncedEvents.length > 0) {
          await saveFanEvents(syncedEvents);
          const rows = await listFanEvents();
          if (cancelled) return;
          setFanEvents(rows);
          setImportStatus(`Imported ${syncedEvents.length} nearby signal${syncedEvents.length === 1 ? '' : 's'} by QR.`);
          setActive('pulse');
          history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
          return;
        }
        const decoded = await decodePlan(hash);
        if (cancelled || !decoded) return;
        setPendingImport(decoded);
        setActive('plan');
      })();
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', handleHash);
    };
  }, []);

  const onSavePlan = async (next: GroupPlan) => {
    await saveGroupPlan(next);
    setPlan(next);
  };

  const onBusMarker = (marker: BusMarker) => {
    setBusMarkers((current) => [marker, ...current]);
  };

  const onFanEvent = async (event: FanEvent) => {
    await saveFanEvent(event);
    setFanEvents((current) => sortEvents(dedupeFanEvents([event, ...current])));
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Unofficial local tool</p>
          <strong>Parade Companion — Islington</strong>
        </div>
        <div className="topbar-actions">
          <button type="button" className="lost-button" onClick={() => setActive('meet')}>
            Lost?
          </button>
          <span className="offline-pill">offline core</span>
        </div>
      </header>

      <div className="wordmark-band">
        <span className="mark">A · R · S · E · N · A · L</span>
        <span className="rule" />
        <span className="meta">unofficial</span>
      </div>

      {isParadeDay(pack.event.startTime) ? (
        <div className="day-banner">Parade day. Keep Location on; signal may not matter.</div>
      ) : null}

      <ReadinessChip pack={pack} />

      <div className="screen-host">
        {active === 'pulse' ? (
          <PulseScreen
            pack={pack}
            fanEvents={fanEvents}
            busMarkers={busMarkers}
            importStatus={importStatus}
            onFanEvent={onFanEvent}
            onBusMarker={onBusMarker}
            onOpenMap={() => setActive('map')}
          />
        ) : null}
        {active === 'map' ? (
          <MapScreen
            pack={pack}
            plan={plan}
            busMarkers={busMarkers}
            fanEvents={fanEvents}
            onBusMarker={onBusMarker}
            onFanEvent={onFanEvent}
          />
        ) : null}
        {active === 'plan' ? (
          <PlanScreen
            pack={pack}
            plan={plan}
            pendingImport={pendingImport}
            onSave={onSavePlan}
            onClearImport={() => setPendingImport(null)}
          />
        ) : null}
        {active === 'meet' ? (
          <MeetScreen pack={pack} plan={plan} onCreatePlan={() => setActive('plan')} />
        ) : null}
        {active === 'safety' ? <SafetyScreen pack={pack} /> : null}
        {active === 'card' ? (
          <CardScreen pack={pack} fanEvents={fanEvents} busMarkers={busMarkers} plan={plan} />
        ) : null}
      </div>

      <nav className="bottom-nav" aria-label="Parade companion sections">
        {nav.map((item) => (
          <button
            type="button"
            key={item.id}
            className={active === item.id ? 'active' : ''}
            onClick={() => setActive(item.id)}
            aria-current={active === item.id ? 'page' : undefined}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </main>
  );
}

function isParadeDay(startTime: string): boolean {
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return false;
  const now = Date.now();
  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return now >= dayStart.getTime() && now < dayEnd.getTime();
}
