import { QrShareSheet } from '@shippie/showcase-kit-v2';
import { useCallback, useEffect, useRef, useState } from 'react';
import packageInfo from '../package.json';
import { AboutSheet } from './components/AboutSheet';
import { ImportPreviewSheet, type ImportPreview } from './components/ImportPreviewSheet';
import { Onboarding } from './components/Onboarding';
import { ReadinessChip, type Readiness } from './components/ReadinessChip';
import { ToastHost } from './components/ToastHost';
import { BanterScreen } from './screens/BanterScreen';
import { GroupScreen } from './screens/GroupScreen';
import { MapScreen } from './screens/MapScreen';
import { SafetyScreen } from './screens/SafetyScreen';
import {
  cleanDisplayName,
  formatSupporterHandle,
  getDisplayName,
  getSupporterTag,
  setDisplayName as saveDisplayName,
} from './lib/display-name';
import { decodePlan, type GroupPlan } from './lib/group-plan';
import type { GpsFix } from './lib/gps';
import {
  buildGroupSignalUrl,
  decodeGroupLivePayload,
  encodeGroupLivePayload,
  groupLiveMembersForMap,
  makeGroupLivePacket,
  mergeGroupLiveMembers,
  pruneGroupLiveMembers,
  type GroupLiveMember,
  type GroupLiveStatus,
} from './lib/group-live';
import {
  listBusMarkers,
  listFanEvents,
  loadGroupPlan,
  saveFanEvent,
  saveFanEvents,
  saveGroupPlan,
} from './lib/shippie-db';
import { DEFAULT_PACK_ID, loadRoutePack, packFreshnessLabel, resolvePackId, syncRoutePack } from './lib/route-pack';
import type { BusMarker } from './lib/bus';
import { decodeFanEventsSync, dedupeFanEvents, getFanSourceId, isActive, sortEvents, type FanEvent } from './lib/fan-events';
import {
  isPublishableFanEvent,
  publishFanPulse,
  pullFanPulse,
  selectFanPulseEvents,
  type LiveSyncStatus,
} from './lib/live-sync';
import { installParadeAnalyticsFlush, trackParadeAction } from './lib/analytics';
import { isOnboarded, markOnboarded } from './lib/onboarding';
import { saveParadeOffline } from './lib/offline-save';
import { isPackStale, isParadeDay, isParadeEve, isStartPromptWindow, startPromptKey } from './lib/parade-time';
import { addSideTing } from './lib/side-tings';
import { buildShareRunUrl } from './lib/share-url';
import { nextSyncDelayMs, resolveSyncMode, resumeSyncDelayMs, shouldResumeSync, stableSyncJitterMs } from './lib/sync-cadence';
import { showToast } from './lib/toast';

type Screen = 'map' | 'group' | 'banter' | 'safety';

const BATTERY_SAVER_KEY = 'parade-companion:battery-saver:v1';
const TAP_SYNC_COOLDOWN_MS = 12_000;
const TIMER_SYNC_JITTER_MS = 5_000;
const INITIAL_SYNC_JITTER_MS = {
  normal: { floor: 2_000, spread: 14_000 },
  slow: { floor: 5_000, spread: 30_000 },
} as const;

const nav: Array<{ id: Screen; label: string }> = [
  { id: 'map', label: 'Map' },
  { id: 'group', label: 'Group' },
  { id: 'banter', label: 'Banter' },
  { id: 'safety', label: 'Safety' },
];

export function App() {
  const [pack, setPack] = useState(() => loadRoutePack());
  const [active, setActive] = useState<Screen>('map');
  const [plan, setPlan] = useState<GroupPlan | null>(null);
  const [importPreview, setImportPreview] = useState<{ preview: ImportPreview; plan: GroupPlan } | null>(null);
  const [busMarkers, setBusMarkers] = useState<BusMarker[]>([]);
  const [fanEvents, setFanEvents] = useState<FanEvent[]>([]);
  const [importStatus, setImportStatus] = useState('');
  const [sideTingsRefresh, setSideTingsRefresh] = useState(0);
  const [displayName, setDisplayNameState] = useState(() => getDisplayName());
  const [supporterTag] = useState(() => getSupporterTag());
  const [onboardingOpen, setOnboardingOpen] = useState(() => !isOnboarded());
  const [menuOpen, setMenuOpen] = useState(false);
  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [sideTingSheetOpen, setSideTingSheetOpen] = useState(false);
  const [sideTingDraft, setSideTingDraft] = useState('');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [appShareOpen, setAppShareOpen] = useState(false);
  const [appShareUrl, setAppShareUrl] = useState('');
  const [groupLiveMembers, setGroupLiveMembers] = useState<GroupLiveMember[]>([]);
  const [groupLiveStatus, setGroupLiveStatus] = useState<GroupLiveStatus>('idle');
  const [offlineReadiness, setOfflineReadiness] = useState<Readiness>('checking');
  const [liveSyncStatus, setLiveSyncStatus] = useState<LiveSyncStatus>({
    state: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'idle',
    lastSyncAt: null,
    received: 0,
    published: 0,
  });
  // Lifted from MapScreen so sync cadence can read the same source of truth.
  // Persists across reloads — fans on day one will keep saver ON once chosen.
  const [batterySaver, setBatterySaver] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    try {
      const raw = localStorage.getItem(BATTERY_SAVER_KEY);
      return raw === null ? true : raw === '1';
    } catch {
      return true;
    }
  });
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  // Flips true once all async stores (plan / bus markers / fan events) have
  // responded — used by MapScreen to show a tiny loading chip during the
  // first ~1s instead of empty panels.
  const [storesHydrated, setStoresHydrated] = useState(false);
  const packRef = useRef(pack);
  const planRef = useRef<GroupPlan | null>(plan);
  const displayNameRef = useRef(displayName);
  const supporterTagRef = useRef(supporterTag);
  const latestGpsFixRef = useRef<GpsFix | null>(null);
  const fanEventsRef = useRef(fanEvents);
  const groupWsRef = useRef<WebSocket | null>(null);
  const groupReconnectTimer = useRef<number | null>(null);
  const groupPeerId = useRef(getFanSourceId());
  const liveSyncInFlight = useRef(false);
  const liveSyncFailures = useRef(0);
  const liveSyncSeed = useRef<string | null>(null);
  const lastTapSyncAt = useRef(0);
  const pendingResumeSync = useRef(false);
  const resumeSyncTimer = useRef<number | null>(null);
  const lastSignalToastAt = useRef(0);
  const publishedFanEventIds = useRef(new Set<string>());
  const menuRef = useRef<HTMLDivElement | null>(null);
  const screenHostRef = useRef<HTMLDivElement | null>(null);
  const online = useOnlineStatus();
  const offlinePill = offlinePillState(offlineReadiness, online);

  const pendingFanPulseCount = useCallback(() => (
    selectFanPulseEvents(
      fanEventsRef.current.filter((event) => !publishedFanEventIds.current.has(event.id) && isPublishableFanEvent(event)),
    ).length
  ), []);

  const onToggleBatterySaver = useCallback(() => {
    setBatterySaver((current) => {
      const next = !current;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(BATTERY_SAVER_KEY, next ? '1' : '0');
        }
      } catch {
        // Preference only — refusing to persist must never break the toggle.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    packRef.current = pack;
  }, [pack]);

  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

  useEffect(() => {
    displayNameRef.current = displayName;
  }, [displayName]);

  useEffect(() => {
    supporterTagRef.current = supporterTag;
  }, [supporterTag]);

  useEffect(() => {
    fanEventsRef.current = fanEvents;
  }, [fanEvents]);

  useEffect(() => {
    const stopAnalytics = installParadeAnalyticsFlush();
    trackParadeAction('parade_app_opened');
    return stopAnalytics;
  }, []);

  const runCrowdSync = useCallback(
    async (reason: 'timer' | 'online' | 'tap', immediateEvent?: FanEvent) => {
      if (!online) {
        setLiveSyncStatus((current) => ({ ...current, state: 'offline' }));
        return;
      }
      if (liveSyncInFlight.current) return;
      liveSyncInFlight.current = true;
      setLiveSyncStatus((current) => ({ ...current, state: 'syncing' }));
      try {
        const route = packRef.current.route.coordinates;
        const candidates = immediateEvent
          ? [immediateEvent]
          : fanEventsRef.current.filter((event) => isActive(event) && !publishedFanEventIds.current.has(event.id));
        const publishable = selectFanPulseEvents(candidates.filter(isPublishableFanEvent));
        const published = await publishFanPulse(publishable, route);
        if (published === publishable.length) {
          for (const event of publishable) publishedFanEventIds.current.add(event.id);
        }

        const incoming = await pullFanPulse(route);
        const existingIds = new Set(fanEventsRef.current.map((event) => event.id));
        const freshIncoming = incoming.filter((event) => !existingIds.has(event.id));
        if (freshIncoming.length > 0) {
          await saveFanEvents(freshIncoming);
          const merged = sortEvents(dedupeFanEvents([...freshIncoming, ...fanEventsRef.current]));
          fanEventsRef.current = merged;
          setFanEvents(merged);
        }
        const syncedAt = new Date().toISOString();
        setLiveSyncStatus({
          state: 'synced',
          lastSyncAt: syncedAt,
          received: freshIncoming.length,
          published,
        });
        if (published > 0 || freshIncoming.length > 0) {
          trackParadeAction('parade_crowd_sync_completed', {
            reason,
            published,
            received: freshIncoming.length,
          });
        }
        liveSyncFailures.current = 0;
      } catch {
        liveSyncFailures.current += 1;
        setLiveSyncStatus((current) => ({
          ...current,
          state: 'failed',
          lastSyncAt: current.lastSyncAt ?? new Date().toISOString(),
        }));
      } finally {
        liveSyncInFlight.current = false;
      }
    },
    [online],
  );

  const onManualCrowdSync = useCallback(() => {
    trackParadeAction('parade_manual_sync_tapped', { online });
    if (!online) {
      setLiveSyncStatus((current) => ({ ...current, state: 'offline' }));
      showToast('Offline. Crowd pulses stay on this phone until signal appears.', 'warn');
      return;
    }
    showToast('Checking crowd sync now.', 'default');
    void runCrowdSync('tap');
  }, [online, runCrowdSync]);

  const mergeIncomingGroupPacket = useCallback((packet: ReturnType<typeof makeGroupLivePacket>) => {
    setGroupLiveMembers((current) => mergeGroupLiveMembers(current, packet));
    const currentPlan = planRef.current;
    if (!currentPlan?.room) return;
    const memberName = packet.member_name.trim();
    if (!memberName) return;
    if (currentPlan.members.some((member) => member.toLowerCase() === memberName.toLowerCase())) return;
    const next = {
      ...currentPlan,
      members: [...currentPlan.members, memberName].slice(0, 12),
      updatedAt: new Date().toISOString(),
    };
    planRef.current = next;
    setPlan(next);
    void saveGroupPlan(next);
  }, []);

  const sendGroupLivePacket = useCallback(async (packet: ReturnType<typeof makeGroupLivePacket>) => {
    const room = planRef.current?.room;
    const ws = groupWsRef.current;
    if (!room || !ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      const payload = await encodeGroupLivePayload(room.roomKey, packet);
      ws.send(JSON.stringify({ t: 'relay', payload }));
      setGroupLiveMembers((current) => mergeGroupLiveMembers(current, packet));
      return true;
    } catch {
      return false;
    }
  }, []);

  const publishGroupLive = useCallback(
    async (kind: 'join' | 'presence', point?: { lng: number; lat: number; accuracyM?: number | null } | null) => {
      const currentPlan = planRef.current;
      if (!currentPlan?.room) return false;
      const memberName = formatSupporterHandle(displayNameRef.current || 'Me', supporterTagRef.current);
      const packet = makeGroupLivePacket({
        kind,
        sourceId: groupPeerId.current,
        displayName: displayNameRef.current || 'Me',
        supporterTag: supporterTagRef.current,
        memberName,
        point,
      });
      return sendGroupLivePacket(packet);
    },
    [sendGroupLivePacket],
  );

  const onMapGpsFix = useCallback((fix: GpsFix | null) => {
    latestGpsFixRef.current = fix;
  }, []);

  // Track document visibility so we can pause polling when the tab is hidden
  // (background tabs shouldn't burn battery checking the relay).
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  // Battery-aware sync loop. A recursive setTimeout (not setInterval) lets
  // every tick re-read the current policy: 20s normal · 60s battery-saver ·
  // paused when hidden/offline · 30/60/120s exponential backoff on failure.
  // Stable per-phone jitter prevents a million clients syncing on the same
  // second after a deploy, phone unlock, or pocket of signal returning.
  useEffect(() => {
    if (!online) {
      setLiveSyncStatus((current) => ({ ...current, state: 'offline' }));
      return undefined;
    }
    let cancelled = false;
    let timerId: number | null = null;

    const seed = liveSyncSeed.current ?? getFanSourceId();
    liveSyncSeed.current = seed;

    const cadenceDelay = () => {
      const mode = resolveSyncMode({ online, hidden, batterySaver });
      const base = nextSyncDelayMs(mode, liveSyncFailures.current);
      if (base === null) return null;
      return base + stableSyncJitterMs(`${seed}:timer:${pack.packVersion}:${base}`, TIMER_SYNC_JITTER_MS);
    };

    const firstSyncDelay = () => {
      if (storesHydrated && pendingFanPulseCount() > 0) {
        return resumeSyncDelayMs(seed, pack.packVersion);
      }
      const profile = batterySaver ? INITIAL_SYNC_JITTER_MS.slow : INITIAL_SYNC_JITTER_MS.normal;
      return stableSyncJitterMs(`${seed}:first:${pack.packVersion}:${batterySaver ? 'slow' : 'normal'}`, profile.spread, profile.floor);
    };

    const schedule = (delayMs: number | null) => {
      if (cancelled || delayMs === null) return;
      timerId = window.setTimeout(async () => {
        if (cancelled) return;
        await runCrowdSync('timer');
        schedule(cadenceDelay());
      }, delayMs);
    };

    // Do not sync instantly on activation. The core is offline-first, so a
    // short deterministic wait is safer than a thundering-herd relay spike.
    schedule(firstSyncDelay());

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [online, hidden, batterySaver, runCrowdSync, pack.packVersion, pendingFanPulseCount, storesHydrated]);

  // Fast resume path for patchy signal. The timer loop is deliberately
  // jittered for a million phones, but after a real offline spell we still
  // want to use tiny signal windows to flush saved taps quickly.
  useEffect(() => {
    if (!online) {
      pendingResumeSync.current = true;
      if (resumeSyncTimer.current !== null) {
        window.clearTimeout(resumeSyncTimer.current);
        resumeSyncTimer.current = null;
      }
      setLiveSyncStatus((current) => ({ ...current, state: 'offline' }));
      return undefined;
    }

    if (!shouldResumeSync({ online, hidden, hadOffline: pendingResumeSync.current })) {
      return undefined;
    }

    const seed = liveSyncSeed.current ?? getFanSourceId();
    liveSyncSeed.current = seed;
    const pendingCount = pendingFanPulseCount();
    const delay = resumeSyncDelayMs(seed, pack.packVersion);

    setLiveSyncStatus((current) => ({ ...current, state: 'syncing' }));
    trackParadeAction('parade_crowd_sync_resume_scheduled', {
      delay_ms: delay,
      pending_count: pendingCount,
    });

    const now = Date.now();
    if (now - lastSignalToastAt.current > 15_000) {
      lastSignalToastAt.current = now;
      showToast(
        pendingCount > 0
          ? `Signal back. Sending ${pendingCount} saved tap${pendingCount === 1 ? '' : 's'}.`
          : 'Signal back. Checking the crowd pulse.',
        'success',
      );
    }

    resumeSyncTimer.current = window.setTimeout(() => {
      resumeSyncTimer.current = null;
      pendingResumeSync.current = false;
      void runCrowdSync('online');
    }, delay);

    return () => {
      if (resumeSyncTimer.current !== null) {
        window.clearTimeout(resumeSyncTimer.current);
        resumeSyncTimer.current = null;
      }
    };
  }, [online, hidden, pack.packVersion, pendingFanPulseCount, runCrowdSync]);

  // Live group room. The invite QR carries a SignalRoom roomId + roomKey; once
  // both phones have the plan, they fan out tiny encrypted join/presence
  // packets. Offline-first still holds: the saved plan works without this, but
  // any small pocket of internet turns the group into live dots.
  useEffect(() => {
    const room = plan?.room;
    if (!room) {
      setGroupLiveStatus('idle');
      setGroupLiveMembers([]);
      return undefined;
    }
    if (!online) {
      setGroupLiveStatus('closed');
      return undefined;
    }
    if (typeof WebSocket === 'undefined') {
      setGroupLiveStatus('unsupported');
      return undefined;
    }

    let cancelled = false;
    let attempt = 0;
    const url = buildGroupSignalUrl(room.roomId);

    const closeCurrent = () => {
      if (groupReconnectTimer.current !== null) {
        window.clearTimeout(groupReconnectTimer.current);
        groupReconnectTimer.current = null;
      }
      if (groupWsRef.current) {
        try {
          groupWsRef.current.close();
        } catch {
          // Closing best-effort only.
        }
        groupWsRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      const delay = Math.min(30_000, 1500 * 2 ** Math.min(5, attempt));
      attempt += 1;
      groupReconnectTimer.current = window.setTimeout(connect, delay);
    };

    const connect = () => {
      if (cancelled) return;
      setGroupLiveStatus('connecting');
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        setGroupLiveStatus('failed');
        scheduleReconnect();
        return;
      }
      groupWsRef.current = ws;
      ws.addEventListener('open', () => {
        attempt = 0;
        setGroupLiveStatus('open');
        trackParadeAction('parade_group_live_connected');
        ws.send(JSON.stringify({ t: 'hello', peerId: groupPeerId.current }));
        void publishGroupLive('join');
        const fix = latestGpsFixRef.current;
        if (fix) void publishGroupLive('presence', fix);
      });
      ws.addEventListener('message', (event) => {
        void (async () => {
          let msg: { t?: string; payload?: unknown } | null = null;
          try {
            msg = typeof event.data === 'string' ? JSON.parse(event.data) : null;
          } catch {
            return;
          }
          if (!msg) return;
          if (msg.t === 'peer-joined') {
            void publishGroupLive('join');
            const fix = latestGpsFixRef.current;
            if (fix) void publishGroupLive('presence', fix);
            return;
          }
          if (msg.t !== 'relay' || typeof msg.payload !== 'string') return;
          const packet = await decodeGroupLivePayload(room.roomKey, msg.payload);
          if (!packet || packet.source_id === groupPeerId.current) return;
          mergeIncomingGroupPacket(packet);
          trackParadeAction('parade_group_live_member_seen', { kind: packet.kind });
        })();
      });
      ws.addEventListener('close', () => {
        if (groupWsRef.current === ws) groupWsRef.current = null;
        if (!cancelled) {
          setGroupLiveStatus('closed');
          scheduleReconnect();
        }
      });
      ws.addEventListener('error', () => {
        if (!cancelled) setGroupLiveStatus('failed');
      });
    };

    connect();

    return () => {
      cancelled = true;
      closeCurrent();
    };
  }, [mergeIncomingGroupPacket, online, plan?.room, publishGroupLive]);

  // Publish the group's live dot on a gentle cadence while there is signal.
  // Joining works with no GPS; location appears as soon as the map has a fix,
  // and expires automatically eight hours later.
  useEffect(() => {
    if (!plan?.room || !online) return undefined;
    const publish = () => {
      const fix = latestGpsFixRef.current;
      if (fix) void publishGroupLive('presence', fix);
    };
    publish();
    const id = window.setInterval(publish, batterySaver ? 60_000 : 20_000);
    return () => window.clearInterval(id);
  }, [batterySaver, online, plan?.room, publishGroupLive]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setGroupLiveMembers((current) => pruneGroupLiveMembers(current));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshRoutePack = async () => {
      const result = await syncRoutePack('/__shippie/parade/route-pack', packRef.current);
      if (cancelled) return;
      if (result.status !== 'updated') return;
      setPack(result.pack);
      const packLabel = packFreshnessLabel(result.pack);
      showToast(`Route info updated · pack ${packLabel}`, 'success');
      trackParadeAction('parade_route_pack_updated', { pack_version: result.pack.packVersion });
    };

    if (typeof navigator === 'undefined' || navigator.onLine) {
      void refreshRoutePack();
    }

    window.addEventListener('online', refreshRoutePack);
    return () => {
      cancelled = true;
      window.removeEventListener('online', refreshRoutePack);
    };
  }, []);

  useEffect(() => {
    trackParadeAction('parade_tab_viewed', { tab: active });
    screenHostRef.current?.scrollTo({ top: 0 });
    setMenuOpen(false);
  }, [active]);

  useEffect(() => {
    let cancelled = false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return undefined;
    void saveParadeOffline().then((result) => {
      if (cancelled) return;
      if (result.state === 'saved') {
        setOfflineReadiness('ready');
        trackParadeAction('parade_offline_auto_saved', {
          state: result.state,
          done: result.done,
          total: result.total,
        });
      } else if (result.state === 'partial') {
        trackParadeAction('parade_offline_auto_saved', {
          state: result.state,
          done: result.done,
          total: result.total,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!nameEditorOpen && !sideTingSheetOpen && !aboutOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setNameEditorOpen(false);
      setSideTingSheetOpen(false);
      setAboutOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [aboutOpen, nameEditorOpen, sideTingSheetOpen]);

  useEffect(() => {
    let shownThisSession = false;
    const check = () => {
      if (shownThisSession) return;
      if (!isStartPromptWindow(pack.event.startTime)) return;
      try {
        const key = startPromptKey(pack.event.startTime);
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, '1');
      } catch {
        // The prompt is a nudge, not state the app depends on.
      }
      shownThisSession = true;
      showToast('Parade starts soon. Check your group plan before signal drops.', 'warn');
      trackParadeAction('parade_start_prompt_shown');
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [pack.event.startTime]);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      loadGroupPlan().then((saved) => {
        if (!cancelled) setPlan(saved);
      }),
      listBusMarkers().then((rows) => {
        if (!cancelled) setBusMarkers(rows);
      }),
      listFanEvents().then((rows) => {
        if (!cancelled) setFanEvents(rows);
      }),
    ]).then(() => {
      if (!cancelled) setStoresHydrated(true);
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
    const localMemberName = formatSupporterHandle(displayName || 'Me', supporterTag);
    const joinedPlan = {
      ...importPreview.plan,
      members: ensureLocalMember(importPreview.plan.members, localMemberName),
    };
    await saveGroupPlan(joinedPlan);
    setPlan(joinedPlan);
    setImportPreview(null);
    showToast('Joined group. Keep Location on so friends can see your live dot.', 'success');
    trackParadeAction('parade_plan_import_saved', {
      members_count: joinedPlan.members.length,
      has_leave_plan: Boolean(joinedPlan.leavePlan?.trim()),
    });
    setActive('map');
    window.setTimeout(() => {
      void publishGroupLive('join');
      const fix = latestGpsFixRef.current;
      if (fix) void publishGroupLive('presence', fix);
    }, 0);
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
    setFanEvents((current) => {
      const next = sortEvents(dedupeFanEvents([event, ...current]));
      fanEventsRef.current = next;
      return next;
    });
    if (online) {
      const now = Date.now();
      if (now - lastTapSyncAt.current >= TAP_SYNC_COOLDOWN_MS) {
        lastTapSyncAt.current = now;
        void runCrowdSync('tap', event);
      }
      if (event.type === 'presence' && planRef.current?.room) {
        void publishGroupLive('presence', {
          lng: event.lng,
          lat: event.lat,
          accuracyM: event.accuracy_m,
        });
      }
    }
  };

  const showOfflineStatus = () => {
    const packLabel = packFreshnessLabel(pack);
    trackParadeAction('parade_offline_status_checked', { readiness: offlineReadiness, online });
    if (offlineReadiness === 'ready') {
      showToast(`Saved offline. Map packs, route info, fonts and app shell are on this phone · pack ${packLabel}`, 'success');
      return;
    }
    if (offlineReadiness === 'needs-online') {
      showToast(`Not fully saved yet. Open on Wi-Fi to save map packs, route info, fonts and app shell · pack ${packLabel}`, 'warn');
      return;
    }
    if (offlineReadiness === 'checking') {
      showToast('Still saving the offline pack. Keep this page open on Wi-Fi.', 'default');
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
    showToast(`Name saved: ${formatSupporterHandle(saved, supporterTag)}`, 'success');
    trackParadeAction('parade_display_name_saved', { display_name_set: saved !== 'Me' });
  };

  const switchPack = useCallback(() => {
    const ids = ['arsenal-islington', 'watford-vicarage'];
    const current = resolvePackId();
    const nextId = ids[(ids.indexOf(current) + 1) % ids.length] ?? DEFAULT_PACK_ID;
    setMenuOpen(false);
    try {
      if (window.parent !== window) {
        window.parent.postMessage({ kind: 'shippie.run-query', pack: nextId }, window.location.origin);
      }
    } catch {
      // Parent URL sync is a nicety; the iframe navigation below is the source of truth.
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('pack', nextId);
      window.location.assign(url.toString());
    } catch {
      // Fall back to a plain reload; localStorage already has the pack id.
      window.location.reload();
    }
  }, []);

  const openMapSyncQr = () => {
    setActive('map');
    setMenuOpen(false);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('parade-companion:open-sync-qr'));
    }, 0);
  };

  const openShareApp = () => {
    setAppShareUrl(buildShareRunUrl());
    setAppShareOpen(true);
    setMenuOpen(false);
    trackParadeAction('parade_plan_share_opened', {
      members_count: 0,
      has_leave_plan: false,
      share_kind: 'app_menu',
    });
    showToast('App share QR ready. This does not add anyone to your group.', 'success');
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="masthead-title">
          <strong>Parade Companion</strong>
          <span>{topbarSubtitle(pack)}</span>
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
                  aria-pressed={batterySaver}
                  onClick={() => {
                    onToggleBatterySaver();
                    setMenuOpen(false);
                  }}
                >
                  {batterySaver ? 'Battery saver · ON' : 'Battery saver · off'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={openMapSyncQr}
                >
                  Sync QR
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={openShareApp}
                >
                  Share app
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={switchPack}
                >
                  Switch pack
                </button>
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
                    setAboutOpen(true);
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
        <div className="day-banner">Parade day. Keep Location on. Signal will be patchy.</div>
      ) : isParadeEve(pack.event.startTime) ? (
        <div className="day-banner">Parade is tomorrow. Open this page on Wi-Fi today so it works without signal.</div>
      ) : null}

      {isPackStale(pack.packVersion) ? (
        <div className="day-banner day-banner--warn">
          Saved pack is more than 2 weeks old. Open on Wi-Fi for the latest route.
        </div>
      ) : null}

      <ReadinessChip
        pack={pack}
        onShowStatus={showOfflineStatus}
        onReadinessChange={setOfflineReadiness}
        visible={false}
      />
      <ImportPreviewSheet
        preview={importPreview?.preview ?? null}
        onJoin={() => void onJoinImport()}
        onWatch={onWatchImport}
        onDismiss={() => setImportPreview(null)}
      />
      <QrShareSheet
        open={appShareOpen}
        url={appShareUrl}
        title="Share the app"
        body="This opens Parade Companion only. It does not add anyone to your group."
        size={260}
        onClose={() => setAppShareOpen(false)}
      />
      <ToastHost />
      <Onboarding
        open={onboardingOpen}
        initialName={displayName}
        supporterTag={supporterTag}
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
            <p className="supporter-tag">
              Friends see <strong>{formatSupporterHandle(nameDraft, supporterTag)}</strong>. The tag stays on this phone.
            </p>
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
      {aboutOpen ? (
        <AboutSheet
          appVersion={packageInfo.version}
          pack={pack}
          readiness={offlineReadiness}
          onClose={() => setAboutOpen(false)}
          onOpenSafety={() => setActive('safety')}
        />
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
            groupLiveMembers={groupLiveMembersForMap(groupLiveMembers, groupPeerId.current)}
            liveSyncStatus={liveSyncStatus}
            online={online}
            batterySaver={batterySaver}
            storesHydrated={storesHydrated}
            onManualSync={onManualCrowdSync}
            onBusMarker={onBusMarker}
            onFanEvent={onFanEvent}
            onGpsFixChange={onMapGpsFix}
            onTrack={trackParadeAction}
          />
        ) : null}
        {active === 'group' ? (
          <GroupScreen
            pack={pack}
            plan={plan}
            displayName={displayName}
            supporterTag={supporterTag}
            groupLiveMembers={groupLiveMembers}
            groupLiveStatus={groupLiveStatus}
            onSave={onSavePlan}
            onTrack={trackParadeAction}
            sideTingsRefresh={sideTingsRefresh}
            onSideTingsRefresh={() => setSideTingsRefresh((current) => current + 1)}
            onAddSideTing={openSideTingSheet}
            onEditName={() => {
              setNameDraft(displayName);
              setNameEditorOpen(true);
            }}
          />
        ) : null}
        {active === 'banter' ? (
          <BanterScreen
            pack={pack}
            displayName={displayName}
            supporterTag={supporterTag}
            onTrack={trackParadeAction}
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
            onClick={() => {
              if (item.id === active) {
                // Common iOS pattern: re-tapping the active tab scrolls the
                // current screen to the top.
                screenHostRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                return;
              }
              setActive(item.id);
            }}
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

/**
 * Topbar subtitle — Arsenal pack gets the unofficial-tool tagline; remix
 * packs surface their own event title so users know which corridor they're
 * looking at during Watford field tests.
 */
function topbarSubtitle(pack: { event: { title: string } }): string {
  const title = pack.event.title.replace(/^Parade Companion\s*—\s*/i, '').trim();
  if (!title || /islington/i.test(title)) return 'Islington · unofficial local tool';
  return `${title} · test pack`;
}

function offlinePillState(readiness: Readiness, online: boolean): { label: string; className: string; ariaLabel: string } {
  if (readiness === 'ready') {
    return {
      label: 'Saved',
      className: 'saved',
      ariaLabel: 'Offline pack saved on this phone',
    };
  }
  if (readiness === 'checking' && online) {
    return {
      label: 'Saving',
      className: 'checking',
      ariaLabel: 'Saving offline pack on this phone',
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

function ensureLocalMember(members: string[], localMemberName: string): string[] {
  const clean = members.map((member) => member.trim()).filter(Boolean).slice(0, 12);
  const key = localMemberName.toLowerCase();
  if (!clean.some((member) => member.toLowerCase() === key)) clean.push(localMemberName);
  return clean.slice(0, 12);
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
