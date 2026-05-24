import { useEffect, useMemo, useRef, useState } from 'react';
import { ImportPreviewSheet, type ImportPreview } from './components/ImportPreviewSheet';
import { Onboarding } from './components/Onboarding';
import { ReadinessChip, type Readiness } from './components/ReadinessChip';
import { ToastHost } from './components/ToastHost';
import { BanterScreen } from './screens/BanterScreen';
import { GroupScreen } from './screens/GroupScreen';
import { MapScreen } from './screens/MapScreen';
import { SafetyScreen } from './screens/SafetyScreen';
import { cleanDisplayName, getDisplayName, setDisplayName as saveDisplayName } from './lib/display-name';
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
import { isOnboarded, markOnboarded } from './lib/onboarding';
import { markOfflineCelebrated, shouldCelebrateOffline } from './lib/offline-celebration';
import { addSideTing } from './lib/side-tings';
import { showToast } from './lib/toast';

type Screen = 'map' | 'group' | 'banter' | 'safety';

const nav: Array<{ id: Screen; label: string }> = [
  { id: 'map', label: 'Map' },
  { id: 'group', label: 'Group' },
  { id: 'banter', label: 'Banter' },
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
  const [displayName, setDisplayNameState] = useState(() => getDisplayName());
  const [onboardingOpen, setOnboardingOpen] = useState(() => !isOnboarded());
  const [menuOpen, setMenuOpen] = useState(false);
  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [sideTingSheetOpen, setSideTingSheetOpen] = useState(false);
  const [sideTingDraft, setSideTingDraft] = useState('');
  const [offlineReadiness, setOfflineReadiness] = useState<Readiness>('checking');
  const menuRef = useRef<HTMLDivElement | null>(null);
  const screenHostRef = useRef<HTMLDivElement | null>(null);
  const online = useOnlineStatus();
  const offlinePill = offlinePillState(offlineReadiness, online);

  useEffect(() => {
    const stopAnalytics = installParadeAnalyticsFlush();
    trackParadeAction('parade_app_opened');
    return stopAnalytics;
  }, []);

  useEffect(() => {
    trackParadeAction('parade_tab_viewed', { tab: active });
    screenHostRef.current?.scrollTo({ top: 0 });
    setMenuOpen(false);
  }, [active]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!nameEditorOpen && !sideTingSheetOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setNameEditorOpen(false);
      setSideTingSheetOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [nameEditorOpen, sideTingSheetOpen]);

  // First time the offline pack flips to ready, fire a one-shot celebration
  // toast. Gated by a localStorage flag so subsequent loads are silent.
  useEffect(() => {
    if (offlineReadiness !== 'ready') return;
    if (!shouldCelebrateOffline()) return;
    markOfflineCelebrated();
    showToast('Saved to this phone. Try it offline now.', 'success');
    trackParadeAction('parade_offline_first_ready');
  }, [offlineReadiness]);

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
    if (!incoming?.room) {
      // Plans from before round-5's ensurePlanRoom carry no roomKey — there's
      // nothing for the watcher to subscribe to. Surface that instead of a
      // silent no-op so the user can fall back to Join.
      showToast('This invite has no live room. Tap Join to copy the plan instead.', 'warn');
      return;
    }
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

  const onPasteSideTing = async () => {
    const fragment = extractShareFragment(sideTingDraft);
    const decoded = await decodePlan(fragment);
    if (!decoded) {
      showToast('Paste a Parade Companion invite link or QR code text.', 'warn');
      return;
    }
    if (!decoded.room) {
      showToast('This invite can be joined, but it cannot be watched live.', 'warn');
      return;
    }
    const result = addSideTing({
      roomId: decoded.room.roomId,
      roomKey: decoded.room.roomKey,
      name: decoded.name,
      memberCount: decoded.members.length,
      primary: decoded.primary,
      fallback: decoded.fallback,
    });
    if (result.ok) {
      showToast(`Watching ${decoded.name}`, 'success');
      trackParadeAction('parade_side_ting_paste_imported', { members_count: decoded.members.length });
      setSideTingDraft('');
      setSideTingSheetOpen(false);
      setSideTingsRefresh((current) => current + 1);
      setActive('group');
      return;
    }
    if (result.reason === 'duplicate') {
      showToast(`Already watching ${decoded.name}`);
      setSideTingSheetOpen(false);
      return;
    }
    showToast('Side tings full. Remove one first.', 'warn');
  };

  const openSideTingSheet = () => {
    setSideTingSheetOpen(true);
    trackParadeAction('parade_side_ting_paste_opened');
  };

  const onBusMarker = (marker: BusMarker) => {
    setBusMarkers((current) => [marker, ...current]);
  };

  const onFanEvent = async (event: FanEvent) => {
    await saveFanEvent(event);
    setFanEvents((current) => sortEvents(dedupeFanEvents([event, ...current])));
  };

  const showOfflineStatus = () => {
    const packLabel = packFreshnessLabel(pack);
    trackParadeAction('parade_offline_status_checked', { readiness: offlineReadiness, online });
    if (offlineReadiness === 'ready') {
      showToast(`Saved offline. Map and fonts are on this phone · pack ${packLabel}`, 'success');
      return;
    }
    if (offlineReadiness === 'needs-online') {
      showToast(`Not fully saved yet. Open on Wi-Fi before you travel · pack ${packLabel}`, 'warn');
      return;
    }
    if (offlineReadiness === 'checking') {
      showToast('Still checking the offline pack. Keep this page open on Wi-Fi.', 'default');
      return;
    }
    showToast('Offline check is limited. Keep this page open before you travel.', 'warn');
  };

  const finishOnboarding = (name: string) => {
    const saved = saveDisplayName(name);
    setDisplayNameState(saved);
    setNameDraft(saved);
    markOnboarded();
    setOnboardingOpen(false);
    trackParadeAction('parade_onboarding_completed', { display_name_set: saved !== 'Me' });
  };

  const skipOnboarding = () => {
    markOnboarded();
    setOnboardingOpen(false);
    trackParadeAction('parade_onboarding_skipped');
  };

  const saveName = () => {
    const saved = saveDisplayName(cleanDisplayName(nameDraft));
    setDisplayNameState(saved);
    setNameDraft(saved);
    setNameEditorOpen(false);
    showToast(`Name saved: ${saved}`, 'success');
    trackParadeAction('parade_display_name_saved', { display_name_set: saved !== 'Me' });
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="masthead-title">
          <strong>Parade Companion</strong>
          <span>Islington · unofficial local tool</span>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className={`offline-pill ${offlinePill.className}`}
            onClick={showOfflineStatus}
            aria-label={offlinePill.ariaLabel}
          >
            {offlinePill.label}
          </button>
          <div className="topbar-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="more-button"
              aria-label="App options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((current) => !current)}
            >
              ...
            </button>
            {menuOpen ? (
              <div className="topbar-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setNameEditorOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  Edit name
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActive('safety');
                    setMenuOpen(false);
                  }}
                >
                  Help
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    showToast('Unofficial local-first parade companion. Save it before you travel.');
                    setMenuOpen(false);
                  }}
                >
                  About
                </button>
              </div>
            ) : null}
          </div>
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

      <ReadinessChip pack={pack} onShowStatus={showOfflineStatus} onReadinessChange={setOfflineReadiness} />
      <ImportPreviewSheet
        preview={importPreview?.preview ?? null}
        onJoin={() => void onJoinImport()}
        onWatch={onWatchImport}
        onDismiss={() => setImportPreview(null)}
      />
      <ToastHost />
      <Onboarding
        open={onboardingOpen}
        initialName={displayName}
        onFinish={finishOnboarding}
        onSkip={skipOnboarding}
      />
      {nameEditorOpen ? (
        <div
          className="name-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="name-sheet-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNameEditorOpen(false);
          }}
        >
          <div className="name-sheet__surface">
            <p className="eyebrow">Display name</p>
            <h2 id="name-sheet-title">What should friends see?</h2>
            <label className="name-field">
              Name
              <input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.currentTarget.value)}
                maxLength={24}
                autoFocus
              />
            </label>
            <div className="name-sheet__actions">
              <button type="button" className="secondary-action" onClick={() => setNameEditorOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary-action" onClick={saveName}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {sideTingSheetOpen ? (
        <div
          className="side-ting-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="side-ting-sheet-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSideTingSheetOpen(false);
          }}
        >
          <div className="side-ting-sheet__surface">
            <p className="eyebrow">Watch a crew</p>
            <h2 id="side-ting-sheet-title">Paste a friend's invite</h2>
            <p className="side-ting-sheet__copy">
              Use the link text from their QR. This only watches their group dot; it does not publish you to them.
            </p>
            <label className="name-field">
              Invite link or code
              <textarea
                value={sideTingDraft}
                onChange={(event) => setSideTingDraft(event.currentTarget.value)}
                placeholder="https://shippie.app/run/parade-companion/#..."
                rows={4}
                autoFocus
              />
            </label>
            <div className="side-ting-sheet__actions">
              <button type="button" className="secondary-action" onClick={() => setSideTingSheetOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary-action" onClick={() => void onPasteSideTing()}>
                Watch on map
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="screen-host" ref={screenHostRef}>
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
          <GroupScreen
            pack={pack}
            plan={plan}
            displayName={displayName}
            onSave={onSavePlan}
            onTrack={trackParadeAction}
            sideTingsRefresh={sideTingsRefresh}
            onSideTingsRefresh={() => setSideTingsRefresh((current) => current + 1)}
            onAddSideTing={openSideTingSheet}
          />
        ) : null}
        {active === 'banter' ? <BanterScreen pack={pack} onTrack={trackParadeAction} /> : null}
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

function offlinePillState(readiness: Readiness, online: boolean): { label: string; className: string; ariaLabel: string } {
  if (readiness === 'ready') {
    return {
      label: 'Saved',
      className: 'saved',
      ariaLabel: 'Offline pack saved on this phone',
    };
  }
  if (online) {
    return {
      label: 'Online',
      className: 'online',
      ariaLabel: 'Online connection detected',
    };
  }
  return {
    label: 'Offline',
    className: 'offline',
    ariaLabel: 'Offline mode status',
  };
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

function extractShareFragment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const hashIndex = trimmed.indexOf('#');
  if (hashIndex >= 0) return cleanFragment(trimmed.slice(hashIndex + 1));
  try {
    const url = new URL(trimmed);
    return url.hash.startsWith('#') ? cleanFragment(url.hash.slice(1)) : '';
  } catch {
    return cleanFragment(trimmed.replace(/^#/, ''));
  }
}

function cleanFragment(fragment: string): string {
  return fragment.trim().replace(/\s+/g, '');
}
