import { QrShareSheet } from '@shippie/showcase-kit-v2';
import { useEffect, useMemo, useState } from 'react';
import { CorridorMap } from '../components/CorridorMap';
import type { RoutePack } from '../data/parade-2026';
import { recordSighting, formatMarkerTime, type BusMarker } from '../lib/bus';
import {
  createFanEvent,
  encodeFanEventsForSync,
  eventAgeLabel,
  eventSegmentLabel,
  FAN_EVENT_LABELS,
  summarizeFanEvents,
  type FanEvent,
  type FanEventType,
} from '../lib/fan-events';
import { haversineMeters, nearestRouteSegment } from '../lib/geo';
import { formatAccuracy, formatGpsAge, isFreshGpsFix, isReportableGpsFix, watchGps, type GpsFix } from '../lib/gps';
import type { GroupPlan } from '../lib/group-plan';

interface MapScreenProps {
  pack: RoutePack;
  plan: GroupPlan | null;
  busMarkers: BusMarker[];
  fanEvents: FanEvent[];
  importStatus: string;
  onBusMarker: (marker: BusMarker) => void;
  onFanEvent: (event: FanEvent) => Promise<void>;
}

const REPORT_TYPES: FanEventType[] = ['crowd_dense', 'road_blocked', 'need_help'];

export function MapScreen({ pack, plan, busMarkers, fanEvents, importStatus, onBusMarker, onFanEvent }: MapScreenProps) {
  const [gpsFix, setGpsFix] = useState<GpsFix | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [batterySaver, setBatterySaver] = useState(true);
  const [status, setStatus] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const fanSummary = useMemo(() => summarizeFanEvents(fanEvents), [fanEvents]);

  useEffect(() => {
    const stop = watchGps({
      batterySaver,
      onFix: setGpsFix,
      onError: setGpsError,
    });
    return stop;
  }, [batterySaver]);

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

  const saveEvent = async (type: FanEventType) => {
    if (!gpsFix) {
      setStatus('Turn on Location and wait for the dot before tapping.');
      return;
    }
    if (!isFreshGpsFix(gpsFix)) {
      setStatus(`Your last GPS snapshot is ${formatGpsAge(gpsFix)}. Wait for a live fix before tapping.`);
      return;
    }
    if (type !== 'presence' && !isReportableGpsFix(gpsFix)) {
      setStatus(`GPS is ${formatAccuracy(gpsFix)}. Wait for a tighter fix before placing a bus or safety report.`);
      return;
    }
    const event = createFanEvent(type, gpsFix, pack.route.coordinates);
    await onFanEvent(event);
    if (type === 'bus_seen') {
      const marker = await recordSighting('here', gpsFix, pack.route.coordinates);
      onBusMarker(marker);
      setStatus(`Bus saved at ${formatMarkerTime(marker)}. It can move phone-to-phone by QR.`);
    } else if (type === 'need_help') {
      setStatus('Move to a steward or call 999 now. This marker only travels by QR or relay.');
    } else {
      setStatus(`${FAN_EVENT_LABELS[type]} saved near ${eventSegmentLabel(event)}.`);
    }
    if ('vibrate' in navigator) navigator.vibrate(type === 'presence' ? 20 : [25, 25, 45]);
  };

  const openSync = async () => {
    if (fanEvents.length === 0) {
      setStatus('Tap "I am here" first, then show the QR to nearby fans.');
      return;
    }
    try {
      const fragment = await encodeFanEventsForSync(fanEvents);
      setShareUrl(`${window.location.origin}/run/parade-companion/#${fragment}`);
      setSheetOpen(true);
      setStatus('Show this QR to another fan. Their phone imports the carried pulse.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not make a sync QR.');
    }
  };

  return (
    <section className="screen map-screen">
      <div className="screen-heading">
        <p className="eyebrow">Rung 0 — offline</p>
        <h1>Map</h1>
        <p>GPS, the raster map, your bus taps, and QR-carried reports work without signal.</p>
      </div>

      <div className="map-actions">
        <label className="toggle">
          <input
            type="checkbox"
            checked={batterySaver}
            onChange={(event) => setBatterySaver(event.currentTarget.checked)}
          />
          Battery saver
        </label>
        <button type="button" className="secondary-action" onClick={() => void openSync()}>
          Show QR
        </button>
      </div>

      <div className="pulse-actions" aria-label="Fast parade taps">
        <button type="button" className="primary-action fan-tap" onClick={() => void saveEvent('presence')}>
          I am here
        </button>
        <button type="button" className="primary-action fan-tap bus-action" onClick={() => void saveEvent('bus_seen')}>
          Bus is here
        </button>
      </div>

      <div className="report-grid" aria-label="Report what is happening nearby">
        {REPORT_TYPES.map((type) => (
          <button
            type="button"
            key={type}
            className={`report-button ${type}`}
            onClick={() => void saveEvent(type)}
          >
            <span>{FAN_EVENT_LABELS[type]}</span>
            <small>{reportHint(type)}</small>
          </button>
        ))}
      </div>

      {status ? <p className="inline-status">{status}</p> : null}
      {importStatus ? <p className="inline-status">{importStatus}</p> : null}

      <CorridorMap pack={pack} gpsFix={gpsFix} plan={plan} busMarkers={busMarkers} fanEvents={fanEvents} />

      <div className="info-grid two">
        <div className="metric">
          <span>Your GPS</span>
          <strong>{formatAccuracy(gpsFix)}</strong>
          <small>{gpsError || `${formatGpsAge(gpsFix)}. Accuracy circle is shown on the map.`}</small>
        </div>
        <div className="metric">
          <span>To route</span>
          <strong>{routeDistance ? formatDistance(routeDistance.distanceM) : 'No fix'}</strong>
          <small>Nearest provisional route segment</small>
        </div>
      </div>

      <div className="panel">
        <h2>Local pulse</h2>
        <div className="pulse-list">
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
          {!fanSummary.latestBus && fanSummary.activeReports.length === 0 ? (
            <p>No carried reports yet. Tap only what you can actually see.</p>
          ) : null}
        </div>
      </div>

      {nearestPoi ? (
        <div className="panel location-panel">
          <h2>Nearest landmark</h2>
          <p>
            {nearestPoi.poi.name} · {formatDistance(nearestPoi.distance)}
          </p>
          <small>{nearestPoi.poi.note}</small>
        </div>
      ) : (
        <div className="panel location-panel">
          <h2>No GPS fix yet</h2>
          <p>Turn on Location. Airplane mode is fine, but Location Services must remain on.</p>
        </div>
      )}

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

function reportHint(type: FanEventType): string {
  switch (type) {
    case 'crowd_dense':
      return 'slow down';
    case 'road_blocked':
      return 'route change';
    case 'need_help':
      return 'QR/relay only';
    default:
      return 'nearby';
  }
}
