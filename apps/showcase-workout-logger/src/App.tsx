import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { inferCadence, dayName } from './cadence.ts';

const shippie = createShippieIframeSdk({ appId: 'app_workout_logger' });

interface Session {
  id: string;
  kind: 'strength' | 'cardio' | 'mobility';
  durationMin: number;
  intensity: 'easy' | 'moderate' | 'hard';
  notes?: string;
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

export function App() {
  const [sessions, setSessions] = useState<Session[]>(() => load().sessions);
  const [kind, setKind] = useState<Session['kind']>('strength');
  const [duration, setDuration] = useState(30);
  const [intensity, setIntensity] = useState<Session['intensity']>('moderate');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    save({ sessions });
  }, [sessions]);

  const cadence = useMemo(() => inferCadence(sessions), [sessions]);

  function logSession(e: React.FormEvent) {
    e.preventDefault();
    const session: Session = {
      id: `s_${Date.now()}`,
      kind,
      durationMin: duration,
      intensity,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    setSessions((prev) => [session, ...prev]);
    fireWorkoutCompleted(session);
    setNotes('');
  }

  const recent = sessions.slice(0, 8);

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
                  <small>{s.intensity} · {new Date(s.createdAt).toLocaleString()}</small>
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
