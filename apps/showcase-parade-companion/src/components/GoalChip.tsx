import type { PlanPoint } from '../lib/group-plan';
import type { GpsFix } from '../lib/gps';
import { bearingDeg, haversineMeters } from '../lib/geo';

interface GoalChipProps {
  target: PlanPoint | null;
  gpsFix: GpsFix | null;
  onClear: () => void;
}

/**
 * Goal chip — a small mono pill overlaying the top-right of the map when a
 * goal is set. Replaces the round-9 GoalPointer row so the map keeps full
 * vertical space, and the arrow is always visible without scrolling.
 *
 * Arrow rotates relative to **map north** (not phone compass). The dashed
 * sage walk-line on the map carries the visual "you to there" connection;
 * this chip just labels the goal and gives the user a one-tap "× clear".
 */
export function GoalChip({ target, gpsFix, onClear }: GoalChipProps) {
  if (!target) return null;

  const distance = gpsFix ? haversineMeters(gpsFix, target) : null;
  const bearing = gpsFix ? bearingDeg(gpsFix, target) : null;
  const distanceLabel = distance !== null ? formatDistance(distance) : '—';

  return (
    <div
      className="goal-chip"
      role="status"
      aria-live="polite"
      aria-label={`Goal ${target.label}, ${distanceLabel}${bearing !== null ? `, ${cardinal(bearing)}` : ''}`}
    >
      <span
        className="goal-chip__arrow"
        aria-hidden
        style={bearing !== null ? { transform: `rotate(${bearing}deg)` } : undefined}
      >
        ↑
      </span>
      <div className="goal-chip__body">
        <small>GOAL</small>
        <strong>{target.label}</strong>
        <em>{distanceLabel}{bearing !== null ? ` · ${cardinal(bearing)}` : ''}</em>
      </div>
      <button
        type="button"
        className="goal-chip__clear"
        aria-label="Clear goal"
        onClick={onClear}
      >
        ×
      </button>
    </div>
  );
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function cardinal(bearing: number): string {
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return labels[Math.round(bearing / 45) % labels.length] ?? 'N';
}
