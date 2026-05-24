import type { PlanPoint } from '../lib/group-plan';
import type { LngLat } from '../data/parade-2026';
import { bearingDeg, haversineMeters } from '../lib/geo';
import type { GpsFix } from '../lib/gps';

interface GoalPointerProps {
  gpsFix: GpsFix | null;
  target: PlanPoint | null;
  onClear: () => void;
}

export function GoalPointer({ gpsFix, target, onClear }: GoalPointerProps) {
  if (!target) return null;

  const targetPoint: LngLat = { lng: target.lng, lat: target.lat };
  const distance = gpsFix ? haversineMeters(gpsFix, targetPoint) : null;
  const bearing = gpsFix ? bearingDeg(gpsFix, targetPoint) : null;

  return (
    <div className="goal-pointer" role="status" aria-live="polite">
      <div className="goal-pointer__compass" aria-hidden>
        <span
          className="goal-pointer__arrow"
          style={bearing !== null ? { transform: `rotate(${bearing}deg)` } : undefined}
        >
          ↑
        </span>
      </div>
      <div className="goal-pointer__body">
        <span className="goal-pointer__label">Goal</span>
        <strong>{target.label}</strong>
        <small>
          {distance !== null && bearing !== null
            ? `${formatDistance(distance)} · ${cardinal(bearing)}`
            : 'Turn on Location to point from here'}
        </small>
      </div>
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
