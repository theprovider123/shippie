import { useEffect, useMemo, useState } from 'react';
import { CorridorMap } from '../components/CorridorMap';
import type { RoutePack } from '../data/parade-2026';
import { recordSighting, formatMarkerTime, type BusMarker } from '../lib/bus';
import {
  createFanEvent,
  eventAgeLabel,
  eventSegmentLabel,
  FAN_EVENT_LABELS,
  summarizeFanEvents,
  type FanEvent,
} from '../lib/fan-events';
import { haversineMeters, nearestRouteSegment } from '../lib/geo';
import { formatAccuracy, formatGpsAge, isFreshGpsFix, isReportableGpsFix, watchGps, type GpsFix } from '../lib/gps';
import type { GroupPlan } from '../lib/group-plan';

interface MapScreenProps {
  pack: RoutePack;
  plan: GroupPlan | null;
  busMarkers: BusMarker[];
  fanEvents: FanEvent[];
  onBusMarker: (marker: BusMarker) => void;
  onFanEvent: (event: FanEvent) => Promise<void>;
}

export function MapScreen({ pack, plan, busMarkers, fanEvents, onBusMarker, onFanEvent }: MapScreenProps) {
  const [gpsFix, setGpsFix] = useState<GpsFix | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [batterySaver, setBatterySaver] = useState(true);
  const [busStatus, setBusStatus] = useState('');
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

  const onBusHere = async () => {
    if (!gpsFix) {
      setBusStatus('Wait for a GPS fix before saving a bus sighting.');
      return;
    }
    if (!isFreshGpsFix(gpsFix)) {
      setBusStatus(`Your last GPS snapshot is ${formatGpsAge(gpsFix)}. Wait for a live fix before saving the bus.`);
      return;
    }
    if (!isReportableGpsFix(gpsFix)) {
      setBusStatus(`GPS is ${formatAccuracy(gpsFix)}. Wait for a tighter fix before placing the bus.`);
      return;
    }
    const marker = await recordSighting('here', gpsFix, pack.route.coordinates);
    const event = createFanEvent('bus_seen', gpsFix, pack.route.coordinates);
    await onFanEvent(event);
    onBusMarker(marker);
    setBusStatus(`Saved locally at ${formatMarkerTime(marker)}. Nearby fans can carry it by QR sync.`);
    if ('vibrate' in navigator) navigator.vibrate([30, 30, 50]);
  };

  return (
    <section className="screen map-screen">
      <div className="screen-heading">
        <p className="eyebrow">Rung 0 — offline</p>
        <h1>Map</h1>
        <p>GPS, the raster map, your bus taps, and QR-carried reports work without signal.</p>
      </div>

      <div className="map-actions">
        <button type="button" className="primary-action bus-action" onClick={() => void onBusHere()}>
          Bus is here
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={batterySaver}
            onChange={(event) => setBatterySaver(event.currentTarget.checked)}
          />
          Battery saver
        </label>
      </div>

      {busStatus ? <p className="inline-status">{busStatus}</p> : null}

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
            <p>No carried reports yet. Use Pulse to tap what you can actually see.</p>
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
    </section>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
