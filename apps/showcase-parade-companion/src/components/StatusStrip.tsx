import { BatterySaverGlyph } from './BatterySaverGlyph';
import { formatAccuracy, type GpsFix } from '../lib/gps';

interface StatusStripProps {
  gpsFix: GpsFix | null;
  routeDistanceM: number | null;
  batterySaver: boolean;
  onRoutePress?: () => void;
  onToggleBatterySaver: () => void;
  onOpenQr: () => void;
}

export function StatusStrip({
  gpsFix,
  routeDistanceM,
  batterySaver,
  onRoutePress,
  onToggleBatterySaver,
  onOpenQr,
}: StatusStripProps) {
  const routeLabel = routeDistanceM == null ? '—' : formatDistance(routeDistanceM);
  const routeAria =
    routeDistanceM != null
      ? `Distance to route ${Math.round(routeDistanceM)} metres. Tap to draw a walking line back to the route.`
      : 'Distance to route unknown';
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
      <button
        type="button"
        className="icon-toggle saver"
        aria-pressed={batterySaver}
        aria-label={`Battery saver ${batterySaver ? 'on' : 'off'}`}
        onClick={onToggleBatterySaver}
      >
        <BatterySaverGlyph on={batterySaver} />
      </button>
      <button
        type="button"
        className="icon-toggle qr"
        aria-label="Show share QR"
        onClick={onOpenQr}
      >
        <QrGlyph />
      </button>
    </div>
  );
}

function QrGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="5" height="5" stroke="#14120F" strokeWidth="1" />
      <rect x="2" y="2" width="2" height="2" fill="#14120F" />
      <rect x="10.5" y="0.5" width="5" height="5" stroke="#14120F" strokeWidth="1" />
      <rect x="12" y="2" width="2" height="2" fill="#14120F" />
      <rect x="0.5" y="10.5" width="5" height="5" stroke="#14120F" strokeWidth="1" />
      <rect x="2" y="12" width="2" height="2" fill="#14120F" />
      <rect x="7" y="7" width="2" height="2" fill="#14120F" />
      <rect x="11" y="9" width="2" height="2" fill="#14120F" />
      <rect x="9" y="11" width="2" height="2" fill="#14120F" />
      <rect x="13" y="13" width="2" height="2" fill="#14120F" />
    </svg>
  );
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
