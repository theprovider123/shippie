import type { RoutePack } from '../data/parade-2026';
import type { PlanPoint } from '../lib/group-plan';
import type { GpsFix } from '../lib/gps';
import { FAN_EVENT_BADGES, FAN_EVENT_LABELS, eventAgeLabel, reportConfidenceText, type FanEvent } from '../lib/fan-events';
import { bearingDeg, haversineMeters } from '../lib/geo';
import type { GroupLiveMember } from '../lib/group-live';
import { crowdCompassTargets } from '../lib/live-sync';
import { describeParadeLocation } from '../lib/location-labels';

interface CrowdCompassProps {
  pack: RoutePack;
  gpsFix: GpsFix | null;
  fanEvents: FanEvent[];
  groupMembers?: GroupLiveMember[];
  onTarget: (target: PlanPoint) => void;
}

export function CrowdCompass({ pack, gpsFix, fanEvents, groupMembers = [], onTarget }: CrowdCompassProps) {
  const crowdTargets = crowdCompassTargets(fanEvents, gpsFix);
  const groupTargets = gpsFix
    ? groupMembers
      .filter((member) => member.hasLocation)
      .slice(0, 5)
    : [];
  const hasTargets = groupTargets.length > 0 || crowdTargets.length > 0;

  return (
    <section className="crowd-compass" aria-label="Crowd compass">
      <div className="crowd-compass__head">
        <span>Crowd compass</span>
        <small>{gpsFix ? 'group + fan signals' : 'needs Location'}</small>
      </div>
      {!gpsFix ? (
        <p>Turn on Location. When signal flickers, this points you to friends, the convoy and useful fan reports.</p>
      ) : !hasTargets ? (
        <p>Waiting for your group or crowd signals. Your three taps help the next fan when the relay wakes up.</p>
      ) : (
        <>
          {groupTargets.length > 0 ? (
            <div className="crowd-compass__section" aria-label="Group compass targets">
              <span className="crowd-compass__section-label">Your group</span>
              <div className="crowd-compass__targets">
                {groupTargets.map((member) => {
                  const bearing = bearingDeg(gpsFix, member);
                  const place = describeParadeLocation(member, pack);
                  return (
                    <button
                      type="button"
                      key={member.sourceId}
                      className="crowd-compass__target group-member"
                      onClick={() => onTarget({ lng: member.lng, lat: member.lat, label: member.displayName })}
                    >
                      <span className="crowd-compass__badge" aria-hidden="true">{initials(member.displayName)}</span>
                      <span className="crowd-compass__arrow" style={{ transform: `rotate(${bearing}deg)` }}>
                        ↑
                      </span>
                      <span>
                        <strong>{member.displayName}</strong>
                        <small>
                          {place.title} · {formatDistance(haversineMeters(gpsFix, member))} · {eventAgeLabel({ created_at: member.lastSeenAt })}
                        </small>
                        <em>{place.detail} · {place.grid}</em>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {crowdTargets.length > 0 ? (
            <div className="crowd-compass__section" aria-label="Crowd signal targets">
              <span className="crowd-compass__section-label">Crowd signals</span>
              <div className="crowd-compass__targets">
                {crowdTargets.map(({ event, point, count, confidence }) => {
                  const bearing = bearingDeg(gpsFix, point);
                  const place = describeParadeLocation(point, pack);
                  return (
                    <button
                      type="button"
                      key={`${event.type}-${event.id}`}
                      className={`crowd-compass__target ${event.type}`}
                      onClick={() => onTarget({ ...point, label: `${FAN_EVENT_LABELS[event.type]} · ${place.title}` })}
                    >
                      <span className="crowd-compass__badge" aria-hidden="true">{FAN_EVENT_BADGES[event.type]}</span>
                      <span className="crowd-compass__arrow" style={{ transform: `rotate(${bearing}deg)` }}>
                        ↑
                      </span>
                      <span>
                        <strong>{FAN_EVENT_LABELS[event.type]}</strong>
                        <small>
                          {place.title} · {formatDistance(haversineMeters(gpsFix, point))} · {reportConfidenceText(confidence, count)} · {eventAgeLabel(event)}
                        </small>
                        <em>{place.detail} · {place.grid}</em>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || 'ME';
}
