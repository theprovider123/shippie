import { useEffect } from 'react';
import type { RoutePoi } from '../data/parade-2026';
import { haversineMeters } from '../lib/geo';
import type { GpsFix } from '../lib/gps';

interface PoiSheetProps {
  poi: RoutePoi | null;
  gpsFix: GpsFix | null;
  onClose: () => void;
  onWalkTo: (poi: RoutePoi) => void;
}

/**
 * Bottom-sheet POI detail. Opens when the user taps a baked POI hit-zone on
 * the map. Shows category, distance from the user (when GPS is live), and a
 * "Walk this way" action that draws a dashed sage line from the user's GPS
 * dot to the POI in the corridor map.
 */
export function PoiSheet({ poi, gpsFix, onClose, onWalkTo }: PoiSheetProps) {
  useEffect(() => {
    if (!poi) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [poi, onClose]);

  if (!poi) return null;

  const distance = gpsFix ? haversineMeters(gpsFix, poi) : null;
  const distanceLabel = distance !== null ? formatDistance(distance) : null;

  return (
    <div
      className="poi-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poi-sheet-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="poi-sheet__surface">
        <p className="eyebrow">{labelForKind(poi.kind)}</p>
        <h2 id="poi-sheet-title">{poi.name}</h2>
        {poi.note ? <p className="poi-sheet__note">{poi.note}</p> : null}
        <div className="poi-sheet__meta">
          <span>
            {distanceLabel !== null
              ? `~${distanceLabel} from you`
              : 'Turn on Location to see distance'}
          </span>
          <span>{`${poi.lat.toFixed(4)}, ${poi.lng.toFixed(4)}`}</span>
        </div>
        <div className="poi-sheet__actions">
          <button type="button" className="secondary-action" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={() => onWalkTo(poi)}
            disabled={!gpsFix}
            title={gpsFix ? '' : 'Need a GPS fix to draw a walking line.'}
          >
            Walk this way
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function labelForKind(kind: string): string {
  switch (kind) {
    case 'station':
      return 'Station';
    case 'tube-exit':
      return 'Tube exit';
    case 'landmark':
      return 'Landmark';
    case 'medical':
      return 'First aid';
    case 'exit':
      return 'Exit landmark';
    case 'toilet':
      return 'Toilet';
    case 'meeting':
      return 'Meeting point';
    case 'stewards':
      return 'Stewards';
    case 'water':
      return 'Water';
    case 'food':
      return 'Food';
    case 'pub':
      return 'Pub';
    case 'atm':
      return 'ATM';
    case 'family':
      return 'Quieter pocket';
    case 'view':
      return 'View';
    default:
      return 'Place';
  }
}
