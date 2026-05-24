import { useEffect, useState } from 'react';
import type { RoutePack } from '../data/parade-2026';
import type { PlanPoint } from '../lib/group-plan';
import type { LngLat } from '../data/parade-2026';
import { bearingDeg, haversineMeters } from '../lib/geo';
import type { GpsFix } from '../lib/gps';
import { describeParadeLocation } from '../lib/location-labels';
import {
  relativeBearing,
  requestCompassPermission,
  watchCompass,
  type CompassReading,
} from '../lib/compass';

interface GoalPointerProps {
  pack: RoutePack;
  gpsFix: GpsFix | null;
  target: PlanPoint | null;
  onClear: () => void;
}

export function GoalPointer({ pack, gpsFix, target, onClear }: GoalPointerProps) {
  const [compass, setCompass] = useState<CompassReading | null>(null);
  const [compassState, setCompassState] = useState<'idle' | 'granted' | 'denied' | 'unsupported'>('idle');

  useEffect(() => {
    if (compassState === 'denied' || compassState === 'unsupported') return undefined;
    return watchCompass((reading) => {
      setCompass(reading);
      setCompassState('granted');
    });
  }, [compassState]);

  if (!target) return null;

  const targetPoint: LngLat = { lng: target.lng, lat: target.lat };
  const distance = gpsFix ? haversineMeters(gpsFix, targetPoint) : null;
  const bearing = gpsFix ? bearingDeg(gpsFix, targetPoint) : null;
  const relative = bearing !== null && compass ? relativeBearing(bearing, compass.headingDeg) : null;
  const arrowDeg = relative ?? bearing;
  const location = describeParadeLocation(targetPoint, pack);
  const radius = gpsFix ? Math.max(gpsFix.accuracyM, distance !== null && distance < 60 ? 12 : 24) : null;
  const confidenceLabel = compass
    ? compass.confidence >= 0.72
      ? 'phone arrow'
      : 'wave to calibrate'
    : 'map north';

  return (
    <div className={`goal-pointer ${compass ? 'is-phone-relative' : 'is-map-relative'}`} role="status" aria-live="polite">
      <div className="goal-pointer__compass" aria-hidden>
        <span
          className="goal-pointer__arrow"
          style={arrowDeg !== null ? { transform: `rotate(${arrowDeg}deg)` } : undefined}
        >
          ↑
        </span>
      </div>
      <div className="goal-pointer__body">
        <span className="goal-pointer__label">Find mode · {confidenceLabel}</span>
        <strong>{target.label}</strong>
        <small>
          {distance !== null && bearing !== null
            ? `${formatDistance(distance)} · ${cardinal(bearing)} · ${location.title} · ${location.grid}`
            : 'Turn on Location to point from here'}
        </small>
        <em>{radius ? `radius ±${Math.round(radius)}m · ${location.detail}` : location.detail}</em>
      </div>
      {!compass ? (
        <button
          type="button"
          className="goal-pointer__calibrate"
          onClick={() => {
            void requestCompassPermission().then((result) => setCompassState(result));
          }}
        >
          Compass
        </button>
      ) : null}
      <button type="button" className="goal-pointer__clear" onClick={onClear} aria-label="Clear goal">
        ×
      </button>
    </div>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function cardinal(bearing: number): string {
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return labels[Math.round(bearing / 45) % labels.length] ?? 'N';
}
