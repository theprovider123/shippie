import { QrShareSheet } from '@shippie/showcase-kit-v2';
import { useEffect, useMemo, useState } from 'react';
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
import { formatAccuracy, formatGpsAge, isFreshGpsFix, isReportableGpsFix, watchGps, type GpsFix } from '../lib/gps';

interface PulseScreenProps {
  pack: RoutePack;
  fanEvents: FanEvent[];
  busMarkers: BusMarker[];
  importStatus: string;
  onFanEvent: (event: FanEvent) => Promise<void>;
  onBusMarker: (marker: BusMarker) => void;
  onOpenMap: () => void;
}

const REPORT_TYPES: FanEventType[] = ['crowd_dense', 'road_blocked', 'need_help'];

export function PulseScreen({
  pack,
  fanEvents,
  busMarkers,
  importStatus,
  onFanEvent,
  onBusMarker,
  onOpenMap,
}: PulseScreenProps) {
  const [gpsFix, setGpsFix] = useState<GpsFix | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [status, setStatus] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const summary = useMemo(() => summarizeFanEvents(fanEvents), [fanEvents]);

  useEffect(() => {
    const stop = watchGps({
      batterySaver: true,
      onFix: setGpsFix,
      onError: setGpsError,
    });
    return stop;
  }, []);

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
      setStatus('Move to a steward or call 999 now. This marker only travels to nearby fans by QR sync.');
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
    <section className="screen pulse-screen">
      <div className="pulse-hero">
        <p className="eyebrow">Offline crowd</p>
        <h1>Pulse</h1>
        <p>Quick taps that make the parade feel alive on your phone, then move to other phones by QR.</p>
        <div className="pulse-ledger" aria-label="Current offline pulse summary">
          <span>
            <strong>{summary.hereCount}</strong>
            here
          </span>
          <span>
            <strong>{summary.carriedPhones}</strong>
            carried
          </span>
          <span>
            <strong>{summary.totalSignals}</strong>
            signals
          </span>
        </div>
      </div>

      <div className="pulse-actions">
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

      <div className="panel status-board">
        <h2>What your phone knows</h2>
        <div className="status-line">
          <span>GPS</span>
          <strong>{formatAccuracy(gpsFix)}</strong>
          <small>{gpsError || `${formatGpsAge(gpsFix)}. Location stays on this phone.`}</small>
        </div>
        <div className="status-line">
          <span>Bus</span>
          <strong>{summary.latestBus ? eventAgeLabel(summary.latestBus) : busMarkers.length > 0 ? 'saved' : 'no tap yet'}</strong>
          <small>{summary.latestBus ? eventSegmentLabel(summary.latestBus) : 'Tap only when you can see it.'}</small>
        </div>
        {summary.activeReports.length > 0 ? (
          summary.activeReports.map((report) => (
            <div className="status-line" key={report.type}>
              <span>{FAN_EVENT_LABELS[report.type]}</span>
              <strong>{report.count} {report.confidence}</strong>
              <small>{eventAgeLabel(report.latest)} · {eventSegmentLabel(report.latest)}</small>
            </div>
          ))
        ) : (
          <div className="status-line">
            <span>Reports</span>
            <strong>clear</strong>
            <small>No nearby crowd or closure reports carried yet.</small>
          </div>
        )}
      </div>

      <div className="sync-panel">
        <div>
          <p className="eyebrow">Phone to phone</p>
          <h2>Nearby sync</h2>
          <p>Show a QR. Another fan scans it. No server, no login, no live network.</p>
        </div>
        <button type="button" className="secondary-action" onClick={() => void openSync()}>
          Show QR
        </button>
      </div>

      <button type="button" className="ghost map-shortcut" onClick={onOpenMap}>
        Open map with reports
      </button>

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

function reportHint(type: FanEventType): string {
  switch (type) {
    case 'crowd_dense':
      return 'slow down';
    case 'road_blocked':
      return 'route change';
    case 'need_help':
      return 'QR only';
    default:
      return 'nearby';
  }
}
