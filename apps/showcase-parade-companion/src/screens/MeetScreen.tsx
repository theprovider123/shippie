import { useEffect, useMemo, useState } from 'react';
import type { RoutePack } from '../data/parade-2026';
import { requestCompassPermission, relativeBearing, watchCompass, type CompassReading } from '../lib/compass';
import { bearingDeg, haversineMeters } from '../lib/geo';
import { formatAccuracy, watchGps, type GpsFix } from '../lib/gps';
import type { GroupPlan } from '../lib/group-plan';

interface MeetScreenProps {
  pack: RoutePack;
  plan: GroupPlan | null;
  onCreatePlan: () => void;
}

export function MeetScreen({ pack, plan, onCreatePlan }: MeetScreenProps) {
  const [gpsFix, setGpsFix] = useState<GpsFix | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [compass, setCompass] = useState<CompassReading | null>(null);
  const [permission, setPermission] = useState('');

  useEffect(() => {
    const stopGps = watchGps({ onFix: setGpsFix, onError: setGpsError });
    const stopCompass = watchCompass(setCompass);
    return () => {
      stopGps();
      stopCompass();
    };
  }, []);

  const target = plan?.primary ?? null;
  const targetDistance = useMemo(() => (gpsFix && target ? haversineMeters(gpsFix, target) : null), [gpsFix, target]);
  const targetBearing = useMemo(() => (gpsFix && target ? bearingDeg(gpsFix, target) : null), [gpsFix, target]);
  const arrowRotation = targetBearing !== null && compass ? relativeBearing(targetBearing, compass.headingDeg) : targetBearing ?? 0;

  if (!plan) {
    return (
      <section className="screen meet-screen">
        <div className="screen-heading">
          <p className="eyebrow">Offline reunion</p>
          <h1>Meet</h1>
          <p>Live location can fail. A pre-agreed meeting point still works.</p>
        </div>
        <div className="panel empty-panel">
          <h2>No group plan yet</h2>
          <p>Create a plan, save it to this phone, and share it before you leave.</p>
          <button type="button" className="primary-action" onClick={onCreatePlan}>
            Create plan
          </button>
        </div>
      </section>
    );
  }

  const requestPermission = async () => {
    const result = await requestCompassPermission();
    setPermission(result === 'granted' ? 'Compass enabled.' : result === 'denied' ? 'Compass permission denied.' : 'Compass unavailable.');
  };

  return (
    <section className="screen meet-screen">
      <div className="screen-heading">
        <p className="eyebrow">Offline reunion</p>
        <h1>Meet</h1>
        <p>Every position shows source and age. The plan is the guaranteed floor.</p>
      </div>

      <div className="compass-panel">
        <div className="compass-arrow" style={{ transform: `rotate(${arrowRotation}deg)` }} aria-hidden>
          ↑
        </div>
        <div>
          <span>Next point</span>
          <strong>{plan.primary.label}</strong>
          <small>
            {targetDistance !== null ? `${formatDistance(targetDistance)} straight line` : 'Waiting for GPS'} ·{' '}
            {countdownLabel(pack.event.startTime, plan.primary.time)}
          </small>
        </div>
      </div>

      <div className="action-row">
        <button type="button" className="secondary-action" onClick={() => void requestPermission()}>
          Enable compass
        </button>
      </div>
      {permission ? <p className="inline-status">{permission}</p> : null}

      <div className="info-grid two">
        <div className="metric">
          <span>GPS</span>
          <strong>{formatAccuracy(gpsFix)}</strong>
          <small>{gpsError || 'Accuracy radius matters in crowds.'}</small>
        </div>
        <div className="metric">
          <span>Fallback</span>
          <strong>{plan.fallback.label}</strong>
          <small>{plan.fallback.time ? `At ${plan.fallback.time}` : 'Use your agreed time.'}</small>
        </div>
      </div>

      <div className="panel">
        <h2>If separated</h2>
        <p>{plan.ifSeparated}</p>
        {plan.leavePlan ? <small>{plan.leavePlan}</small> : null}
      </div>

      <div className="location-card">
        <span>My location card</span>
        <strong>{gpsFix ? `${gpsFix.lat.toFixed(5)}, ${gpsFix.lng.toFixed(5)}` : 'Waiting for GPS'}</strong>
        <small>
          {gpsFix
            ? `${formatAccuracy(gpsFix)} · source GPS · age ${Math.max(0, Math.round((Date.now() - gpsFix.at) / 1000))}s`
            : 'Show this to a steward once GPS appears.'}
        </small>
      </div>
    </section>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function countdownLabel(startTime: string, time?: string): string {
  if (!time) return 'No fixed time';
  if (time.startsWith(':')) return `on the ${time}`;
  const day = startTime.slice(0, 10);
  const target = new Date(`${day}T${time}:00+01:00`);
  const diff = target.getTime() - Date.now();
  if (Number.isNaN(diff)) return `at ${time}`;
  if (diff <= 0) return `set for ${time}`;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 90) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
