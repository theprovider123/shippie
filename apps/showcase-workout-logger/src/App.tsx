import { useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import {
  detectBleAvailability,
  pairHrm,
  type HeartRateSample,
  type HrmPairingHandle,
} from '@shippie/proximity';
import { inferCadence, dayName } from './cadence.ts';
import {
  correlateSleepWithWorkouts,
  type SleepRow,
} from './sleep-correlation.ts';

const shippie = createShippieIframeSdk({ appId: 'app_workout_logger' });

interface Session {
  id: string;
  kind: 'strength' | 'cardio' | 'mobility';
  durationMin: number;
  intensity: 'easy' | 'moderate' | 'hard';
  notes?: string;
  /** Heart rate observed mid-session, when an HRM was paired. */
  avgBpm?: number;
  createdAt: string;
}

const STORAGE_KEY = 'shippie.workout-logger.v1';

interface PersistedState {
  sessions: Session[];
}

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sessions: [] };
    const parsed = JSON.parse(raw) as PersistedState;
    return { sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [] };
  } catch {
    return { sessions: [] };
  }
}

function save(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota errors non-fatal */
  }
}

function fireWorkoutCompleted(session: Session): void {
  shippie.intent.broadcast('workout-completed', [session]);
}

const REST_INTERVAL_SECONDS = 90;

export function App() {
  const [sessions, setSessions] = useState<Session[]>(() => load().sessions);
  const [kind, setKind] = useState<Session['kind']>('strength');
  const [duration, setDuration] = useState(30);
  const [intensity, setIntensity] = useState<Session['intensity']>('moderate');
  const [notes, setNotes] = useState('');
  // Rest-period timer — counts up from 0 in the active rep, fires
  // `confirm` every REST_INTERVAL_SECONDS seconds so the lifter
  // doesn't have to watch the clock.
  const [restRunning, setRestRunning] = useState(false);
  const [restSeconds, setRestSeconds] = useState(0);
  const lastIntervalFiredAt = useRef(0);
  // Heart-rate strap state — empty when nothing is paired.
  const ble = useMemo(() => detectBleAvailability(), []);
  const [hrm, setHrm] = useState<HrmPairingHandle | null>(null);
  const [hrmError, setHrmError] = useState<string | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const bpmSamples = useRef<number[]>([]);
  // Sleep correlation — populated from `sleep-logged` broadcasts.
  const [sleepRows, setSleepRows] = useState<SleepRow[]>([]);

  useEffect(() => {
    save({ sessions });
  }, [sessions]);

  // Subscribe to sleep-logged once on mount. The local-storage cache
  // lets the correlation card stay populated across iframe reloads
  // without re-asking the user to grant the intent.
  useEffect(() => {
    shippie.requestIntent('sleep-logged');
    const off = shippie.intent.subscribe('sleep-logged', ({ rows }) => {
      const next: SleepRow[] = [];
      for (const row of rows as Array<{ loggedAt?: string; hours?: number }>) {
        if (typeof row?.loggedAt === 'string' && typeof row.hours === 'number') {
          next.push({ loggedAt: row.loggedAt, hours: row.hours });
        }
      }
      if (next.length === 0) return;
      setSleepRows((prev) => mergeSleepRows(prev, next));
    });
    return () => off();
  }, []);

  // Tick the rest-period timer, fire `confirm` every interval.
  useEffect(() => {
    if (!restRunning) return undefined;
    const id = window.setInterval(() => {
      setRestSeconds((s) => {
        const next = s + 1;
        if (next % REST_INTERVAL_SECONDS === 0 && next !== lastIntervalFiredAt.current) {
          lastIntervalFiredAt.current = next;
          shippie.feel.texture('confirm');
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [restRunning]);

  // Fan HRM samples into the live BPM display + cumulative average.
  useEffect(() => {
    if (!hrm) return undefined;
    const reader = hrm.samples.getReader();
    let stopped = false;
    (async () => {
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        const sample: HeartRateSample = value;
        if (sample.bpm > 0) {
          setBpm(sample.bpm);
          bpmSamples.current.push(sample.bpm);
          // Keep ring buffer bounded — last 600 samples ≈ 10 minutes.
          if (bpmSamples.current.length > 600) {
            bpmSamples.current = bpmSamples.current.slice(-600);
          }
        }
      }
    })().catch(() => {});
    return () => {
      stopped = true;
      reader.cancel().catch(() => {});
    };
  }, [hrm]);

  const cadence = useMemo(() => inferCadence(sessions), [sessions]);
  const correlation = useMemo(
    () => correlateSleepWithWorkouts(sessions, sleepRows),
    [sessions, sleepRows],
  );

  function logSession(e: React.FormEvent) {
    e.preventDefault();
    const samples = bpmSamples.current;
    const avgBpm =
      samples.length === 0
        ? undefined
        : Math.round(samples.reduce((s, v) => s + v, 0) / samples.length);
    const session: Session = {
      id: `s_${Date.now()}`,
      kind,
      durationMin: duration,
      intensity,
      notes: notes.trim() || undefined,
      avgBpm,
      createdAt: new Date().toISOString(),
    };
    setSessions((prev) => [session, ...prev]);
    fireWorkoutCompleted(session);
    shippie.feel.texture('complete');
    setNotes('');
    bpmSamples.current = [];
    if (restRunning) {
      setRestRunning(false);
      setRestSeconds(0);
    }
  }

  async function startHrm() {
    setHrmError(null);
    try {
      const handle = await pairHrm();
      setHrm(handle);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'pairing failed';
      setHrmError(msg);
    }
  }

  function stopHrm() {
    hrm?.stop();
    setHrm(null);
    setBpm(null);
    bpmSamples.current = [];
  }

  const recent = sessions.slice(0, 8);
  const restMins = Math.floor(restSeconds / 60);
  const restSecs = restSeconds % 60;

  return (
    <main>
      <header>
        <h1>Workouts</h1>
        <p>{sessions.length} session{sessions.length === 1 ? '' : 's'} logged on this device</p>
      </header>

      {cadence && (
        <section className="cadence" aria-label="Cadence insight">
          <strong>Cadence:</strong> roughly 1 every {cadence.avgGapDays.toFixed(1)} days
          {cadence.restDay !== null && ` · rest day looks like ${dayName(cadence.restDay)}`}
        </section>
      )}

      {correlation.deltaHours !== null && (
        <section className="correlation" aria-label="Sleep correlation">
          <strong>Sleep:</strong>{' '}
          {correlation.deltaHours > 0
            ? `+${correlation.deltaHours.toFixed(1)}h after workouts`
            : `${correlation.deltaHours.toFixed(1)}h after workouts`}
          {' · '}
          {correlation.avgHoursAfterWorkout?.toFixed(1)}h vs{' '}
          {correlation.avgHoursOtherNights?.toFixed(1)}h
        </section>
      )}

      <section className="rest" aria-label="Rest timer">
        <div className="rest-display" aria-live="polite">
          {String(restMins).padStart(2, '0')}:{String(restSecs).padStart(2, '0')}
        </div>
        <div className="rest-controls">
          <button
            type="button"
            onClick={() => {
              if (restRunning) {
                setRestRunning(false);
              } else {
                setRestRunning(true);
                shippie.feel.texture('navigate');
              }
            }}
          >
            {restRunning ? 'Pause rest' : restSeconds === 0 ? 'Start rest' : 'Resume'}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setRestRunning(false);
              setRestSeconds(0);
              lastIntervalFiredAt.current = 0;
            }}
          >
            Reset
          </button>
        </div>
        <p className="rest-hint">
          Haptic every {REST_INTERVAL_SECONDS}s — keep your eyes off the clock.
        </p>
      </section>

      <section className="hrm" aria-label="Heart rate strap">
        <h2>Heart rate</h2>
        {!ble.webBluetooth ? (
          <p className="hrm-unsupported">
            Heart-rate pairing requires Chrome on Android. On iPhone, log workouts manually — every other feature still works.
          </p>
        ) : hrm ? (
          <div className="hrm-live">
            <strong>{bpm ?? '—'} bpm</strong>
            <small>{hrm.deviceName ?? 'Paired strap'}</small>
            <button type="button" className="ghost" onClick={stopHrm}>
              Disconnect
            </button>
          </div>
        ) : (
          <button type="button" onClick={startHrm}>
            Pair heart-rate strap
          </button>
        )}
        {hrmError && <p className="hrm-error">{hrmError}</p>}
      </section>

      <form onSubmit={logSession}>
        <div className="row">
          <label>
            <span>Type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as Session['kind'])}>
              <option value="strength">Strength</option>
              <option value="cardio">Cardio</option>
              <option value="mobility">Mobility</option>
            </select>
          </label>
          <label>
            <span>Duration (min)</span>
            <input
              type="number"
              min={5}
              max={300}
              value={duration}
              onChange={(e) => setDuration(Math.max(5, Number(e.target.value) || 5))}
            />
          </label>
          <label>
            <span>Intensity</span>
            <select value={intensity} onChange={(e) => setIntensity(e.target.value as Session['intensity'])}>
              <option value="easy">Easy</option>
              <option value="moderate">Moderate</option>
              <option value="hard">Hard</option>
            </select>
          </label>
        </div>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          aria-label="Session notes"
        />
        <button type="submit">Log session</button>
      </form>

      <section aria-label="Recent sessions">
        <h2>Recent</h2>
        {recent.length === 0 ? (
          <p className="empty">Log your first session above. Your habit tracker will tick automatically.</p>
        ) : (
          <ul>
            {recent.map((s) => (
              <li key={s.id}>
                <div className="kind-badge">{s.kind[0]?.toUpperCase()}</div>
                <div>
                  <strong>{s.kind} · {s.durationMin}m</strong>
                  <small>
                    {s.intensity} · {new Date(s.createdAt).toLocaleString()}
                    {typeof s.avgBpm === 'number' ? ` · avg ${s.avgBpm} bpm` : ''}
                  </small>
                  {s.notes && <p>{s.notes}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function mergeSleepRows(prev: readonly SleepRow[], next: readonly SleepRow[]): SleepRow[] {
  const seen = new Map<string, SleepRow>();
  for (const row of prev) seen.set(row.loggedAt, row);
  for (const row of next) seen.set(row.loggedAt, row);
  return [...seen.values()].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
}
