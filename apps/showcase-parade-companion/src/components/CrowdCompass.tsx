import type { PlanPoint } from '../lib/group-plan';
import type { GpsFix } from '../lib/gps';
import { FAN_EVENT_LABELS, eventAgeLabel, eventSegmentLabel, type FanEvent } from '../lib/fan-events';
import { bearingDeg, haversineMeters } from '../lib/geo';
import { crowdCompassTargets } from '../lib/live-sync';

interface CrowdCompassProps {
  gpsFix: GpsFix | null;
  fanEvents: FanEvent[];
  onTarget: (target: PlanPoint) => void;
}

export function CrowdCompass({ gpsFix, fanEvents, onTarget }: CrowdCompassProps) {
  const targets = crowdCompassTargets(fanEvents, gpsFix);

  return (
    <section className="crowd-compass" aria-label="Crowd compass">
      <div className="crowd-compass__head">
        <span>Crowd compass</span>
        <small>{gpsFix ? 'from live fan taps' : 'needs Location'}</small>
      </div>
      {!gpsFix ? (
        <p>Turn on Location. When signal flickers, nearby fan taps point you to the bus, toilets and blocked spots.</p>
      ) : targets.length === 0 ? (
        <p>Waiting for crowd taps. Your three fast taps help the next fan when the relay wakes up.</p>
      ) : (
        <div className="crowd-compass__targets">
          {targets.map(({ event, point, count, confidence }) => {
            const bearing = bearingDeg(gpsFix, point);
            return (
              <button
                type="button"
                key={`${event.type}-${event.id}`}
                className={`crowd-compass__target ${event.type}`}
                onClick={() => onTarget({ ...point, label: FAN_EVENT_LABELS[event.type] })}
              >
                <span className="crowd-compass__arrow" style={{ transform: `rotate(${bearing}deg)` }}>
                  ↑
                </span>
                <span>
                  <strong>{FAN_EVENT_LABELS[event.type]}</strong>
                  <small>
                    {eventSegmentLabel(event)} · {formatDistance(haversineMeters(gpsFix, point))} · {count} {count === 1 ? 'tap' : 'taps'} · {confidence} · {eventAgeLabel(event)}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
