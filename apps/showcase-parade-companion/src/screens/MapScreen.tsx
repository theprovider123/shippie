import { QrShareSheet } from '@shippie/showcase-kit-v2';
import { useEffect, useMemo, useState } from 'react';
import { CorridorMap } from '../components/CorridorMap';
import { LayerToggleRow, type MapLayerId } from '../components/LayerToggleRow';
import { StatusStrip } from '../components/StatusStrip';
import type { RoutePack } from '../data/parade-2026';
import { recordSighting, formatMarkerTime, type BusMarker } from '../lib/bus';
import {
  createFanEvent,
  encodeFanEventsForSync,
  eventAgeLabel,
  eventSegmentLabel,
  FAN_EVENT_LABELS,
  isActive,
  summarizeFanEvents,
  type FanEvent,
  type FanEventType,
} from '../lib/fan-events';
import { haversineMeters, nearestRouteSegment } from '../lib/geo';
import { formatAccuracy, formatGpsAge, isFreshGpsFix, isReportableGpsFix, watchGps, type GpsFix } from '../lib/gps';
import type { GroupPlan } from '../lib/group-plan';
import type { ParadeAnalyticsEvent } from '../lib/analytics';
import { hapticConfirm, hapticWarn, hapticWow } from '../lib/haptic';
import { listSideTings, type SideTing } from '../lib/side-tings';
import { showToast, type ToastVariant } from '../lib/toast';

interface MapScreenProps {
  pack: RoutePack;
  plan: GroupPlan | null;
  busMarkers: BusMarker[];
  fanEvents: FanEvent[];
  importStatus: string;
  sideTingsRefresh: number;
  onBusMarker: (marker: BusMarker) => void;
  onFanEvent: (event: FanEvent) => Promise<void>;
  onTrack: (event: ParadeAnalyticsEvent, props?: Record<string, string | number | boolean | null>) => void;
}

const REPORT_TYPES: FanEventType[] = ['crowd_dense', 'road_blocked', 'need_help'];

export function MapScreen({ pack, plan, busMarkers, fanEvents, importStatus, sideTingsRefresh, onBusMarker, onFanEvent, onTrack }: MapScreenProps) {
  const [gpsFix, setGpsFix] = useState<GpsFix | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [batterySaver, setBatterySaver] = useState(true);
  const [shareUrl, setShareUrl] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [sideTings, setSideTings] = useState<SideTing[]>(() => listSideTings());
  const [layers, setLayers] = useState<Record<MapLayerId, boolean>>({
    bus: true,
    friends: true,
    'side-tings': listSideTings().length > 0,
    reports: true,
    'my-taps': true,
  });
  const fanSummary = useMemo(() => summarizeFanEvents(fanEvents), [fanEvents]);

  useEffect(() => {
    const stop = watchGps({
      batterySaver,
      onFix: setGpsFix,
      onError: setGpsError,
    });
    return stop;
  }, [batterySaver]);

  useEffect(() => {
    if (importStatus) showToast(importStatus, 'success');
  }, [importStatus]);

  useEffect(() => {
    if (gpsError) showToast(gpsError, 'warn');
  }, [gpsError]);

  useEffect(() => {
    const rows = listSideTings();
    setSideTings(rows);
    if (rows.length > 0) setLayers((current) => ({ ...current, 'side-tings': true }));
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
      feedback(`Bus saved at ${formatMarkerTime(marker)}. It can move phone-to-phone by QR.`, 'success');
    } else if (type === 'need_help') {
      feedback('Move to a steward or call 999 now. This marker only travels by QR or relay.', 'warn');
    } else {
      feedback(`${FAN_EVENT_LABELS[type]} saved near ${eventSegmentLabel(event)}.`, 'success');
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

  const aroundEmpty = !nearestPoi && !fanSummary.latestBus && fanSummary.activeReports.length === 0;

  return (
    <section className="screen map-screen">
      <LayerToggleRow
        layers={layers}
        onToggle={(id) => setLayers((current) => ({ ...current, [id]: !current[id] }))}
      />

      <CorridorMap
        pack={pack}
        gpsFix={gpsFix}
        plan={plan}
        busMarkers={busMarkers}
        fanEvents={fanEvents}
        sideTings={sideTings}
        layers={layers}
      />

      <StatusStrip
        gpsFix={gpsFix}
        routeDistanceM={routeDistance?.distanceM ?? null}
        batterySaver={batterySaver}
        onToggleBatterySaver={() => setBatterySaver((current) => !current)}
        onOpenQr={() => void openSync()}
      />

      <div className="tap-panel" aria-label="Fast parade taps">
        <div className="tap-panel__head">
          <span>Tap what you see</span>
          <small>saved on this phone first</small>
        </div>
        <div className="pulse-actions">
          <button type="button" className="fan-tap fan-tap--presence" onClick={() => void saveEvent('presence')}>
            <strong>I am here</strong>
            <span>fan dot</span>
          </button>
          <button type="button" className="fan-tap fan-tap--bus" onClick={() => void saveEvent('bus_seen')}>
            <strong>Bus is here</strong>
            <span>highest value</span>
          </button>
          <button
            type="button"
            className="fan-tap fan-tap--report"
            aria-expanded={reportsOpen}
            onClick={() => setReportsOpen((value) => !value)}
          >
            <strong>Report {reportsOpen ? '▴' : '▾'}</strong>
            <span>crowd or road</span>
          </button>
        </div>

        {reportsOpen ? (
          <div className="report-chips" aria-label="Report what is happening nearby">
            {REPORT_TYPES.map((type) => (
              <button
                type="button"
                key={type}
                data-kind={type}
                onClick={() => void saveEvent(type)}
              >
                {FAN_EVENT_LABELS[type]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="panel around-you">
        <h2>Around you</h2>
        <div className="pulse-list">
          {nearestPoi ? (
            <div className="pulse-row landmark">
              <strong>Nearest</strong>
              <span>{nearestPoi.poi.name}</span>
              <small>{formatDistance(nearestPoi.distance)}</small>
            </div>
          ) : null}
          {fanSummary.latestBus ? (
            <div className="pulse-row confirmed">
              <strong>Bus</strong>
              <span>{eventSegmentLabel(fanSummary.latestBus)}</span>
              <small>{eventAgeLabel(fanSummary.latestBus)}</small>
            </div>
          ) : null}
          {fanSummary.activeReports.map((report) => (
            <div className={`pulse-row ${report.confidence}`} key={report.type}>
              <strong>{FAN_EVENT_LABELS[report.type]}</strong>
              <span>{report.confidence}</span>
              <small>{report.count} carried · {eventAgeLabel(report.latest)}</small>
            </div>
          ))}
          {aroundEmpty ? (
            <p>Quiet for now. Turn on Location and tap what you can actually see.</p>
          ) : null}
        </div>
      </div>

      <div className="panel">
        <h2>Bus timing estimate</h2>
        <div className="timeline">
          {pack.scheduleEstimate.map((item) => (
            <div className="timeline-row" key={`${item.time}-${item.label}`}>
              <strong>{item.time}</strong>
              <span>{item.label}</span>
              {item.note ? <small>{item.note}</small> : null}
            </div>
          ))}
        </div>
      </div>

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
    case 'need_help':
      return 'parade_help_reported';
  }
}
