import { useEffect, useMemo, useState } from 'react';
import { ImportPreviewSheet, type ImportPreview } from './components/ImportPreviewSheet';
import { ReadinessChip } from './components/ReadinessChip';
import { ToastHost } from './components/ToastHost';
import { MapScreen } from './screens/MapScreen';
import { PlanScreen } from './screens/PlanScreen';
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
import { loadRoutePack, packFreshnessLabel } from './lib/route-pack';
import type { BusMarker } from './lib/bus';
import { decodeFanEventsSync, dedupeFanEvents, sortEvents, type FanEvent } from './lib/fan-events';
import { installParadeAnalyticsFlush, trackParadeAction } from './lib/analytics';
import { addSideTing } from './lib/side-tings';
import { showToast } from './lib/toast';

type Screen = 'map' | 'group' | 'safety';

const nav: Array<{ id: Screen; label: string }> = [
  { id: 'map', label: 'Map' },
  { id: 'group', label: 'Group' },
  { id: 'safety', label: 'Safety' },
];

export function App() {
  const pack = useMemo(() => loadRoutePack(), []);
  const [active, setActive] = useState<Screen>('map');
  const [plan, setPlan] = useState<GroupPlan | null>(null);
  const [importPreview, setImportPreview] = useState<{ preview: ImportPreview; plan: GroupPlan } | null>(null);
  const [busMarkers, setBusMarkers] = useState<BusMarker[]>([]);
  const [fanEvents, setFanEvents] = useState<FanEvent[]>([]);
  const [importStatus, setImportStatus] = useState('');
  const [sideTingsRefresh, setSideTingsRefresh] = useState(0);
  const online = useOnlineStatus();

  useEffect(() => {
    const stopAnalytics = installParadeAnalyticsFlush();
    trackParadeAction('parade_app_opened');
    return stopAnalytics;
  }, []);

  useEffect(() => {
    trackParadeAction('parade_tab_viewed', { tab: active });
  }, [active]);

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
    const handleHash = (incomingHash?: string) => {
      const hash = readShareHash(incomingHash);
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
          trackParadeAction('parade_signal_imported', { count: syncedEvents.length });
          setActive('map');
          clearShareHash();
          return;
        }
        const decoded = await decodePlan(hash);
        if (cancelled || !decoded) return;
        setImportPreview({
          preview: {
            name: decoded.name,
            members: decoded.members,
            primary: decoded.primary,
            fallback: decoded.fallback,
            hasLiveRoom: Boolean(decoded.room),
            roleHint: decoded.roleHint,
          },
          plan: decoded,
        });
        clearShareHash();
      })();
    };
    const handleParentHash = (event: MessageEvent) => {
      const fromParent = event.source === window.parent;
      if (!fromParent && event.origin !== window.location.origin) return;
      const data = event.data as { kind?: string; hash?: unknown } | null;
      if (!data || data.kind !== 'shippie.parent-hash' || typeof data.hash !== 'string') return;
      handleHash(data.hash);
    };
    const handleOwnHash = () => handleHash();
    handleHash();
    window.addEventListener('hashchange', handleOwnHash);
    window.addEventListener('message', handleParentHash);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', handleOwnHash);
      window.removeEventListener('message', handleParentHash);
    };
  }, []);

  const onSavePlan = async (next: GroupPlan) => {
    await saveGroupPlan(next);
    setPlan(next);
  };

  const onJoinImport = async () => {
    if (!importPreview) return;
    await saveGroupPlan(importPreview.plan);
    setPlan(importPreview.plan);
    setImportPreview(null);
    showToast('Group plan saved to this phone.', 'success');
    trackParadeAction('parade_plan_import_saved', {
      members_count: importPreview.plan.members.length,
      has_leave_plan: Boolean(importPreview.plan.leavePlan?.trim()),
    });
    setActive('group');
  };

  const onWatchImport = () => {
    const incoming = importPreview?.plan;
    if (!incoming?.room) return;
    const result = addSideTing({
      roomId: incoming.room.roomId,
      roomKey: incoming.room.roomKey,
      name: incoming.name,
      memberCount: incoming.members.length,
      primary: incoming.primary,
      fallback: incoming.fallback,
    });
    if (result.ok) {
      showToast(`Watching ${incoming.name}`, 'success');
      setSideTingsRefresh((current) => current + 1);
    } else if (result.reason === 'duplicate') {
      showToast(`Already watching ${incoming.name}`);
    } else {
      showToast('Side tings full. Remove one first.', 'warn');
    }
    setImportPreview(null);
    setActive('group');
  };

  const onBusMarker = (marker: BusMarker) => {
    setBusMarkers((current) => [marker, ...current]);
  };

  const onFanEvent = async (event: FanEvent) => {
    await saveFanEvent(event);
    setFanEvents((current) => sortEvents(dedupeFanEvents([event, ...current])));
  };

  const showOfflineStatus = () => {
    showToast(`Saved offline. Map and fonts are on this phone · pack ${packFreshnessLabel(pack)}`, 'success');
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Unofficial local tool</p>
          <strong>Parade Companion — Islington</strong>
        </div>
        <div className="topbar-actions">
          <button type="button" className="lost-button" onClick={() => setActive('safety')}>
            Help
          </button>
          <button
            type="button"
            className={`offline-pill ${online ? 'online' : 'offline'}`}
            onClick={showOfflineStatus}
            aria-label={online ? 'Online connection detected' : 'Offline mode status'}
          >
            {online ? 'Online' : 'Offline'}
          </button>
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

      <ReadinessChip pack={pack} onShowStatus={showOfflineStatus} />
      <ImportPreviewSheet
        preview={importPreview?.preview ?? null}
        onJoin={() => void onJoinImport()}
        onWatch={onWatchImport}
        onDismiss={() => setImportPreview(null)}
      />
      <ToastHost />

      <div className="screen-host">
        {active === 'map' ? (
          <MapScreen
            pack={pack}
            plan={plan}
            busMarkers={busMarkers}
            fanEvents={fanEvents}
            importStatus={importStatus}
            sideTingsRefresh={sideTingsRefresh}
            onBusMarker={onBusMarker}
            onFanEvent={onFanEvent}
            onTrack={trackParadeAction}
          />
        ) : null}
        {active === 'group' ? (
          <PlanScreen
            pack={pack}
            plan={plan}
            onSave={onSavePlan}
            onTrack={trackParadeAction}
            sideTingsRefresh={sideTingsRefresh}
            onSideTingsRefresh={() => setSideTingsRefresh((current) => current + 1)}
          />
        ) : null}
        {active === 'safety' ? <SafetyScreen pack={pack} /> : null}
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

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
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

function readShareHash(incomingHash?: string): string {
  const ownHash = incomingHash ?? window.location.hash;
  if (ownHash && ownHash.length > 1) return ownHash.startsWith('#') ? ownHash.slice(1) : ownHash;
  try {
    const parentHash = window.parent !== window ? window.parent.location.hash : '';
    if (parentHash && parentHash.length > 1) return parentHash.slice(1);
  } catch {
    // Parent access should be same-origin in Shippie, but standalone safety costs nothing.
  }
  return '';
}

function clearShareHash(): void {
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  try {
    if (window.parent !== window) {
      window.parent.history.replaceState(
        null,
        '',
        `${window.parent.location.pathname}${window.parent.location.search}`,
      );
    }
  } catch {
    // Cross-origin parents cannot be cleaned, but the import has already happened.
  }
}
