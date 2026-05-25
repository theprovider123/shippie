import { QrShareSheet } from '@shippie/showcase-kit-v2';
import { useEffect, useMemo, useState } from 'react';
import { CorridorMap } from '../components/CorridorMap';
import { CrowdCompass } from '../components/CrowdCompass';
import { GoalPointer } from '../components/GoalPointer';
import { LayerToggleRow, type MapLayerId } from '../components/LayerToggleRow';
import { ParadersChip } from '../components/ParadersChip';
import { PoiSheet } from '../components/PoiSheet';
import { QuickFindChips, kindsForCategory, type QuickFindCategory } from '../components/QuickFindChips';
import { StatusStrip } from '../components/StatusStrip';
import type { RoutePack, RoutePoi } from '../data/parade-2026';
import { recordSighting, formatMarkerTime, type BusMarker } from '../lib/bus';
import {
  createFanEvent,
  encodeFanEventsForSync,
  eventAgeLabel,
  FAN_EVENT_BADGES,
  FAN_EVENT_HINTS,
  FAN_EVENT_LABELS,
  REPORT_EVENT_TYPES,
  isActive,
  clusterFanEvents,
  reportConfidenceText,
  type FanEvent,
  type FanEventCluster,
  type FanEventType,
} from '../lib/fan-events';
import { haversineMeters, nearestRouteSegment } from '../lib/geo';
import { formatAccuracy, formatGpsAge, isFreshGpsFix, isReportableGpsFix, watchGps, type GpsFix } from '../lib/gps';
import type { GroupPlan, PlanPoint } from '../lib/group-plan';
import { describeParadeLocation } from '../lib/location-labels';
import type { ParadeAnalyticsEvent } from '../lib/analytics';
import { hapticConfirm, hapticWarn, hapticWow } from '../lib/haptic';
import type { LiveSyncStatus } from '../lib/live-sync';
import { busTimingPresentation } from '../lib/parade-time';
import { countActiveParaders } from '../lib/paraders';
import { listSideTings, type SideTing } from '../lib/side-tings';
import { showToast, type ToastVariant } from '../lib/toast';

interface MapScreenProps {
  pack: RoutePack;
  plan: GroupPlan | null;
  busMarkers: BusMarker[];
  fanEvents: FanEvent[];
  importStatus: string;
  sideTingsRefresh: number;
  liveSyncStatus: LiveSyncStatus;
  online: boolean;
  /** Lifted to App so the sync cadence policy can read the same value. */
  batterySaver: boolean;
  /** False during the ~1 s window between mount and async stores settling. */
  storesHydrated: boolean;
  onManualSync: () => void;
  onBusMarker: (marker: BusMarker) => void;
  onFanEvent: (event: FanEvent) => Promise<void>;
  onTrack: (event: ParadeAnalyticsEvent, props?: Record<string, string | number | boolean | null>) => void;
}

const SECONDARY_REPORT_TYPES = REPORT_EVENT_TYPES.filter((type) => type !== 'toilet_queue');

export function MapScreen({
  pack,
  plan,
  busMarkers,
  fanEvents,
  importStatus,
  sideTingsRefresh,
  liveSyncStatus,
  online,
  batterySaver,
  storesHydrated,
  onManualSync,
  onBusMarker,
  onFanEvent,
  onTrack,
}: MapScreenProps) {
  const [gpsFix, setGpsFix] = useState<GpsFix | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(true);
  const [sideTings, setSideTings] = useState<SideTing[]>(() => listSideTings());
  // Persistent "Turn on Location" hint above the tap panel — only after we've
  // waited a few seconds without a fix, so first-launch flicker doesn't shout
  // at someone who's about to grant permission.
  const [showGpsHint, setShowGpsHint] = useState(false);
  const [selectedPoi, setSelectedPoi] = useState<RoutePoi | null>(null);
  const [walkTarget, setWalkTarget] = useState<PlanPoint | null>(null);
  const [findCategory, setFindCategory] = useState<QuickFindCategory | null>(null);
  const [mapToolsOpen, setMapToolsOpen] = useState(false);
  const [timingExpanded, setTimingExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [layers, setLayers] = useState<Record<MapLayerId, boolean>>({
    bus: true,
    friends: true,
    'side-tings': listSideTings().length > 0,
    reports: true,
    'my-taps': true,
    // Place layers default OFF — the map stays calm until the user asks
    // for a category. Quick-find chips below the map also flip these on.
    toilets: false,
    water: false,
    atm: false,
  });
  const publicInsightClusters = useMemo(
    () => clusterFanEvents(fanEvents, now).filter((cluster) => cluster.type !== 'presence' && cluster.type !== 'need_help'),
    [fanEvents, now],
  );
  const busInsight = publicInsightClusters.find((cluster) => cluster.type === 'bus_seen') ?? null;
  const reportInsights = publicInsightClusters.filter((cluster) => cluster.type !== 'bus_seen').slice(0, 3);

  // Cull bus markers older than 4 hours so the canvas doesn't accumulate
  // invisible-but-present markers over a long event. `now` ticks each minute.
  const liveBusMarkers = useMemo(() => {
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
    return busMarkers.filter((marker) => {
      const ageMs = now - Date.parse(marker.created_at);
      return Number.isFinite(ageMs) && ageMs < FOUR_HOURS_MS;
    });
  }, [busMarkers, now]);

  // Crowd mirror — unique active `presence` source_ids from local + relay.
  // Recomputed when fan events or the user's GPS shifts; the chip hides
  // entirely below 3 (see ParadersChip).
  const paraders = useMemo(
    () => countActiveParaders(fanEvents, gpsFix, now),
    [fanEvents, gpsFix, now],
  );

  // Nearest 3 POIs of the active quick-find category. Computed from GPS when
  // available, otherwise from the route's first coordinate as a stable
  // fallback so the chip still does something useful before a fix lands.
  const findExtras = useMemo<RoutePoi[]>(() => {
    if (!findCategory) return [];
    const kinds = new Set(kindsForCategory(findCategory));
    const anchor = gpsFix ?? { lat: pack.route.coordinates[0]?.[1] ?? 0, lng: pack.route.coordinates[0]?.[0] ?? 0 };
    return pack.pois
      .filter((poi) => kinds.has(poi.kind))
      .map((poi) => ({ poi, distance: haversineMeters(anchor, poi) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map(({ poi }) => poi);
  }, [findCategory, gpsFix, pack.pois, pack.route.coordinates]);

  useEffect(() => {
    if (!findCategory) return;
    const nearest = nearestPoiForCategory(findCategory, pack, gpsFix);
    if (!nearest) return;
    setWalkTarget((current) => {
      if (current?.label === nearest.name && current.lng === nearest.lng && current.lat === nearest.lat) return current;
      return { lng: nearest.lng, lat: nearest.lat, label: nearest.name };
    });
  }, [findCategory, gpsFix, pack]);

  useEffect(() => {
    const stop = watchGps({
      batterySaver,
      onFix: setGpsFix,
      onError: setGpsError,
    });
    return stop;
  }, [batterySaver]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (gpsFix) {
      setShowGpsHint(false);
      return;
    }
    const id = window.setTimeout(() => setShowGpsHint(true), 5000);
    return () => window.clearTimeout(id);
  }, [gpsFix]);

  useEffect(() => {
    if (importStatus) showToast(importStatus, 'success');
  }, [importStatus]);

  useEffect(() => {
    if (gpsError) showToast(gpsError, 'warn');
  }, [gpsError]);

  useEffect(() => {
    const rows = listSideTings();
    setSideTings(rows);
    // Auto-flip the layer ON when the user adds a side-ting, and back OFF
    // when the last one is removed so a dead "side-tings" pill doesn't sit
    // active with nothing to render.
    setLayers((current) => ({ ...current, 'side-tings': rows.length > 0 }));
  }, [sideTingsRefresh]);

  const nearestPoi = useMemo(() => {
    if (!gpsFix) return null;
    return pack.pois
      .map((poi) => ({ poi, distance: haversineMeters(gpsFix, poi) }))
      .sort((a, b) => a.distance - b.distance)[0] ?? null;
  }, [gpsFix, pack.pois]);

  const routeDistance = useMemo(() => {
    if (!gpsFix) return null;
    return nearestRouteSegment(gpsFix, pack.route.coordinates);
  }, [gpsFix, pack.route.coordinates]);
  const timing = useMemo(
    () => busTimingPresentation(pack.event.startTime, pack.scheduleEstimate.length, now),
    [now, pack.event.startTime, pack.scheduleEstimate.length],
  );

  const feedback = (message: string, variant: ToastVariant = 'default') => showToast(message, variant);

  const saveEvent = async (type: FanEventType) => {
    if (!gpsFix) {
      feedback('Turn on Location and wait for the dot before tapping.', 'warn');
      hapticWarn();
      return;
    }
    if (!isFreshGpsFix(gpsFix)) {
      feedback(`Your last GPS snapshot is ${formatGpsAge(gpsFix)}. Wait for a live fix before tapping.`, 'warn');
      hapticWarn();
      return;
    }
    if (type !== 'presence' && !isReportableGpsFix(gpsFix)) {
      feedback(`GPS is ${formatAccuracy(gpsFix)}. Wait for a tighter fix before placing a bus or safety report.`, 'warn');
      hapticWarn();
      return;
    }
    const event = createFanEvent(type, gpsFix, pack.route.coordinates);
    await onFanEvent(event);
    if (type === 'bus_seen') {
      const marker = await recordSighting('here', gpsFix, pack.route.coordinates);
      onBusMarker(marker);
      feedback(`Bus signal added · ${placeLabelForEvent(event, pack)} · ${formatMarkerTime(marker)}.`, 'success');
    } else if (type === 'toilet_queue') {
      feedback(`Toilet signal added · ${placeLabelForEvent(event, pack)}.`, 'success');
    } else if (type === 'need_help') {
      feedback('Move to a steward or call 999 now. Help taps stay on this phone.', 'warn');
    } else {
      feedback(`${FAN_EVENT_LABELS[type]} signal added · ${placeLabelForEvent(event, pack)}.`, 'success');
    }
    onTrack(analyticsEventForSignal(type), {
      snapped: Boolean(event.segment_id),
      reportable_gps: isReportableGpsFix(gpsFix),
    });
    if (type === 'bus_seen') hapticWow();
    else hapticConfirm();
    if (reportsOpen) setReportsOpen(false);
  };

  const openSync = async () => {
    const activeEvents = fanEvents.filter((event) => isActive(event));
    if (activeEvents.length === 0) {
      feedback(
        fanEvents.length > 0
          ? 'Your carried signals expired. Tap "I am here" again before sharing QR.'
          : 'Tap "I am here" first, then show the QR to nearby fans.',
        'warn',
      );
      return;
    }
    try {
      const fragment = await encodeFanEventsForSync(activeEvents);
      setShareUrl(`${window.location.origin}/run/parade-companion/#${fragment}`);
      setSheetOpen(true);
      feedback('Show this QR to another fan. Their phone imports the carried pulse.', 'success');
      onTrack('parade_sync_qr_opened', { carried_count: Math.min(activeEvents.length, 36) });
    } catch (error) {
      feedback(error instanceof Error ? error.message : 'Could not make a sync QR.', 'warn');
    }
  };

  useEffect(() => {
    const openFromMenu = () => void openSync();
    window.addEventListener('parade-companion:open-sync-qr', openFromMenu);
    return () => window.removeEventListener('parade-companion:open-sync-qr', openFromMenu);
  }, [fanEvents]);

  const tapPanel = (
    <div className="tap-panel" aria-label="Fast parade taps">
      <div className="tap-panel__head">
        <span>Quick tap</span>
        <small>saved on this phone first</small>
      </div>
      <div className="pulse-actions">
        <button type="button" className="fan-tap fan-tap--presence" onClick={() => void saveEvent('presence')}>
          <span className="fan-tap__icon" aria-hidden="true">{FAN_EVENT_BADGES.presence}</span>
          <strong>I am here</strong>
          <span>{FAN_EVENT_HINTS.presence}</span>
        </button>
        <button type="button" className="fan-tap fan-tap--bus" onClick={() => void saveEvent('bus_seen')}>
          <span className="fan-tap__icon" aria-hidden="true">{FAN_EVENT_BADGES.bus_seen}</span>
          <strong>Bus here</strong>
          <span>{FAN_EVENT_HINTS.bus_seen}</span>
        </button>
        <button
          type="button"
          className="fan-tap fan-tap--toilet"
          onClick={() => void saveEvent('toilet_queue')}
        >
          <span className="fan-tap__icon" aria-hidden="true">{FAN_EVENT_BADGES.toilet_queue}</span>
          <strong>Toilet here</strong>
          <span>{FAN_EVENT_HINTS.toilet_queue}</span>
        </button>
      </div>

      <button
        type="button"
        className="secondary-report-toggle"
        aria-expanded={reportsOpen}
        onClick={() => setReportsOpen((value) => !value)}
      >
        More reports {reportsOpen ? '▴' : '▾'}
        <span>jam · blocked · food · help</span>
      </button>

      {reportsOpen ? (
        <div className="report-chips" aria-label="Report what is happening nearby">
          {SECONDARY_REPORT_TYPES.map((type) => (
            <button
              type="button"
              key={type}
              data-kind={type}
              onClick={() => void saveEvent(type)}
            >
              <span className="report-chip__icon" aria-hidden="true">{FAN_EVENT_BADGES[type]}</span>
              <span>
                <strong>{FAN_EVENT_LABELS[type]}</strong>
                <small>{FAN_EVENT_HINTS[type]}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  // One-line summary of what's on the map right now. Replaces the "Around
  // you" panel — same information, dramatically less vertical space.
  const mapStatusLine = (() => {
    if (!storesHydrated) return 'LOADING SAVED DATA…';
    if (walkTarget) {
      const targetLocation = describeParadeLocation(walkTarget, pack);
      const distance = gpsFix ? ` · ${formatDistance(haversineMeters(gpsFix, walkTarget))}` : '';
      return `FIND · ${walkTarget.label} · ${targetLocation.grid}${distance}`;
    }
    if (busInsight) return `BUS · ${placeLabelForCluster(busInsight, pack)} · ${insightMeta(busInsight)}`;
    if (reportInsights[0]) return `${FAN_EVENT_LABELS[reportInsights[0].type].toUpperCase()} · ${placeLabelForCluster(reportInsights[0], pack)}`;
    if (gpsFix) {
      const location = describeParadeLocation(gpsFix, pack);
      return `YOU · ${location.title} · ${location.grid} · ${formatAccuracy(gpsFix)}`;
    }
    if (nearestPoi) return `NEAREST · ${nearestPoi.poi.name} · ${formatDistance(nearestPoi.distance)}`;
    if (!gpsFix) return 'OFFLINE MAP · TURN ON LOCATION';
    return 'OFFLINE MAP · QUIET FOR NOW';
  })();

  return (
    <section className="screen map-screen">
      <StatusStrip
        gpsFix={gpsFix}
        routeDistanceM={routeDistance?.distanceM ?? null}
        syncStatus={liveSyncStatus}
        online={online}
        onRoutePress={
          routeDistance
            ? () => {
                setWalkTarget({
                  lng: routeDistance.snapped.lng,
                  lat: routeDistance.snapped.lat,
                  label: 'Nearest route',
                });
                showToast('Walking line drawn back to the route.', 'success');
                onTrack('parade_route_walk_to', { distance_m: Math.round(routeDistance.distanceM) });
              }
            : undefined
        }
        onSyncPress={onManualSync}
      />

      <div className="map-stage">
        <CorridorMap
          pack={pack}
          gpsFix={gpsFix}
          plan={plan}
          busMarkers={liveBusMarkers}
          fanEvents={fanEvents}
          sideTings={sideTings}
          layers={layers}
          target={walkTarget}
          extraPois={findExtras}
          onPoiTap={(poi) => {
            setSelectedPoi(poi);
            onTrack('parade_poi_tapped', { kind: poi.kind, id: poi.id });
          }}
        />
        <ParadersChip count={paraders} />
      </div>

      <p className="map-status" role="status" aria-live="polite">
        {mapStatusLine}
      </p>

      <PoiSheet
        poi={selectedPoi}
        pack={pack}
        gpsFix={gpsFix}
        onClose={() => setSelectedPoi(null)}
        onWalkTo={(poi) => {
          setWalkTarget({ lng: poi.lng, lat: poi.lat, label: poi.name });
          setSelectedPoi(null);
          onTrack('parade_poi_walk_to', { kind: poi.kind, id: poi.id, has_gps: Boolean(gpsFix) });
          showToast(
            gpsFix
              ? `Goal set · ${poi.name}. Follow the line and arrow.`
              : `Goal set · ${poi.name}. Turn on Location for the arrow.`,
            'success',
          );
        }}
      />

      <GoalPointer
        pack={pack}
        gpsFix={gpsFix}
        target={walkTarget}
        onClear={() => setWalkTarget(null)}
      />

      {showGpsHint && !gpsFix ? (
        <p className="gps-hint" role="status">
          No GPS yet. The saved map still works; live taps need Location.
        </p>
      ) : null}

      {timing.collapsed ? (
        <button
          type="button"
          className="timing-chip"
          aria-expanded={timingExpanded}
          onClick={() => setTimingExpanded((current) => !current)}
        >
          <strong>Bus timing</strong>
          <span>{timing.currentIndex != null ? pack.scheduleEstimate[timing.currentIndex]?.time : 'estimate'} {timingExpanded ? '▴' : '▾'}</span>
        </button>
      ) : null}

      {!timing.collapsed || timingExpanded ? (
        <div className="panel timing-panel">
          <h2>Bus timing estimate</h2>
          <div className="timeline">
            {pack.scheduleEstimate.map((item, index) => (
              <div
                className={`timeline-row ${timing.currentIndex === index ? 'is-current' : ''}`}
                key={`${item.time}-${item.label}`}
              >
                <strong>{item.time}</strong>
                <span>{item.label}</span>
                {timing.currentIndex === index ? <em>now-ish</em> : null}
                {item.note ? <small>{item.note}</small> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tapPanel}

      <button
        type="button"
        className="map-tools-toggle"
        aria-expanded={mapToolsOpen}
        onClick={() => setMapToolsOpen((current) => !current)}
      >
        More map tools
        <span>find toilets · stations · crowd compass {mapToolsOpen ? '▴' : '▾'}</span>
      </button>

      {mapToolsOpen ? (
        <div className="map-tools-panel">
          <QuickFindChips
            active={findCategory}
            onPick={(category) => {
              setFindCategory(category);
              if (category) {
                onTrack('parade_quick_find_used', { category });
                const nearest = nearestPoiForCategory(category, pack, gpsFix);
                if (nearest) {
                  setWalkTarget({ lng: nearest.lng, lat: nearest.lat, label: nearest.name });
                }
              } else {
                setWalkTarget(null);
              }
            }}
          />

          <LayerToggleRow
            layers={layers}
            onToggle={(id) => setLayers((current) => ({ ...current, [id]: !current[id] }))}
          />

          <CrowdCompass
            pack={pack}
            gpsFix={gpsFix}
            fanEvents={fanEvents}
            onTarget={(target) => {
              setWalkTarget(target);
              showToast(`Crowd compass pointed to ${target.label}.`, 'success');
              onTrack('parade_crowd_compass_targeted', { label: target.label });
            }}
          />
        </div>
      ) : null}

      <QrShareSheet
        open={sheetOpen}
        url={shareUrl}
        title="Sync nearby pulse"
        body="Scan on a phone that already opened Parade Companion before the signal drops."
        onClose={() => setSheetOpen(false)}
      />
    </section>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function nearestPoiForCategory(category: QuickFindCategory, pack: RoutePack, gpsFix: GpsFix | null): RoutePoi | null {
  const kinds = new Set(kindsForCategory(category));
  const anchor = gpsFix ?? { lat: pack.route.coordinates[0]?.[1] ?? 0, lng: pack.route.coordinates[0]?.[0] ?? 0 };
  return pack.pois
    .filter((poi) => kinds.has(poi.kind))
    .map((poi) => ({ poi, distance: haversineMeters(anchor, poi) }))
    .sort((a, b) => a.distance - b.distance)[0]?.poi ?? null;
}

function placeLabelForCluster(cluster: FanEventCluster, pack: RoutePack): string {
  return describeParadeLocation(cluster.point, pack).title;
}

function placeLabelForEvent(event: FanEvent, pack: RoutePack): string {
  const point =
    typeof event.snapped_lng === 'number' && typeof event.snapped_lat === 'number'
      ? { lng: event.snapped_lng, lat: event.snapped_lat }
      : { lng: event.lng, lat: event.lat };
  return describeParadeLocation(point, pack).title;
}

function insightMeta(cluster: FanEventCluster): string {
  return `${reportConfidenceText(cluster.confidence, cluster.count)} · ${eventAgeLabel(cluster.latest)}`;
}

function analyticsEventForSignal(type: FanEventType): ParadeAnalyticsEvent {
  switch (type) {
    case 'presence':
      return 'parade_presence_tapped';
    case 'bus_seen':
      return 'parade_bus_seen_tapped';
    case 'crowd_dense':
      return 'parade_crowd_reported';
    case 'road_blocked':
      return 'parade_road_reported';
    case 'food_open':
      return 'parade_food_open_reported';
    case 'toilet_queue':
      return 'parade_toilet_here_reported';
    case 'need_help':
      return 'parade_help_reported';
  }
}
