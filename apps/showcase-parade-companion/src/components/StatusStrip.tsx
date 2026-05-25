import { formatAccuracy, type GpsFix } from '../lib/gps';
import type { LiveSyncStatus } from '../lib/live-sync';

interface StatusStripProps {
  gpsFix: GpsFix | null;
  routeDistanceM: number | null;
  syncStatus?: LiveSyncStatus;
  online?: boolean;
  onRoutePress?: () => void;
  onSyncPress?: () => void;
}

/**
 * Status strip — one row, all critical system state. Round 9 folded the
 * standalone LiveSyncStrip into a fourth cell so the map gets back the
 * vertical space the second strip used to take.
 */
export function StatusStrip({
  gpsFix,
  routeDistanceM,
  syncStatus,
  online = true,
  onRoutePress,
  onSyncPress,
}: StatusStripProps) {
  const routeLabel = routeDistanceM == null ? '—' : formatRouteDistance(routeDistanceM);
  const routeAria =
    routeDistanceM != null
      ? `Distance to route ${Math.round(routeDistanceM)} metres. Tap to draw a walking line back to the route.`
      : 'Distance to route unknown';
  const sync = syncCopy(syncStatus, online);

  return (
    <div className="status-strip" aria-label="Quick status and actions">
      <div
        className="status-strip__cell"
        aria-label={`GPS accuracy ${formatAccuracy(gpsFix)}`}
      >
        <span className="status-strip__label">GPS</span>
        <strong className="status-strip__value">{formatAccuracy(gpsFix)}</strong>
      </div>
      <button
        type="button"
        className="status-strip__cell status-strip__button"
        aria-label={routeAria}
        disabled={!onRoutePress || routeDistanceM == null}
        onClick={onRoutePress}
      >
        <span className="status-strip__label">Route</span>
        <strong className="status-strip__value">{routeLabel}</strong>
      </button>
      {onSyncPress ? (
        <button
          type="button"
          className={`status-strip__cell status-strip__button status-strip__sync sync-${sync.tone}`}
          aria-label={`Crowd sync ${sync.detail}. Tap to check now.`}
          onClick={onSyncPress}
        >
          <span className="status-strip__label">Sync</span>
          <strong className="status-strip__value">{sync.short}</strong>
        </button>
      ) : (
        <div
          className={`status-strip__cell status-strip__sync sync-${sync.tone}`}
          aria-label={`Crowd sync ${sync.detail}`}
          role="status"
          aria-live="polite"
        >
          <span className="status-strip__label">Sync</span>
          <strong className="status-strip__value">{sync.short}</strong>
        </div>
      )}
    </div>
  );
}

function formatRouteDistance(m: number): string {
  // "on route" reads better than "0 m" when the user is standing on the line.
  if (m < 18) return 'on route';
  if (m > 50_000) return 'away';
  if (m > 5_000) return '>5km';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function syncCopy(status: LiveSyncStatus | undefined, online: boolean): { short: string; detail: string; tone: string } {
  if (!status) return { short: '—', detail: 'idle', tone: 'idle' };
  if (!online || status.state === 'offline') return { short: 'OFF', detail: 'offline · saving locally', tone: 'offline' };
  if (status.state === 'syncing') return { short: '…', detail: 'syncing', tone: 'syncing' };
  if (status.state === 'failed') return { short: 'RTRY', detail: 'patchy · will retry', tone: 'failed' };
  if (status.state === 'synced') {
    const minutes = status.lastSyncAt ? Math.max(0, Math.round((Date.now() - Date.parse(status.lastSyncAt)) / 60_000)) : 0;
    return { short: minutes < 1 ? 'NOW' : `${minutes}M`, detail: `last synced ${minutes < 1 ? 'just now' : `${minutes} min ago`}`, tone: 'synced' };
  }
  return { short: 'RDY', detail: 'ready when signal appears', tone: 'idle' };
}
