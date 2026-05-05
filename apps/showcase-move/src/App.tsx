import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { summarizeMove, type MoveEntry } from './move.ts';

const shippie = createShippieIframeSdk({ appId: 'app_move' });
const STORAGE_KEY = 'shippie.move.v1';

function load(): MoveEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { entries?: unknown };
    return Array.isArray(parsed.entries) ? parsed.entries as MoveEntry[] : [];
  } catch {
    return [];
  }
}

function save(entries: readonly MoveEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries }));
  } catch {
    /* local quota errors are non-fatal */
  }
}

export function App() {
  const [entries, setEntries] = useState<MoveEntry[]>(() => load());
  const [mode, setMode] = useState<'plan' | 'workout' | 'sleep'>('workout');
  const [distanceKm, setDistanceKm] = useState(5);
  const [minutes, setMinutes] = useState(35);
  const [sleepHours, setSleepHours] = useState(7.5);
  const [quality, setQuality] = useState(7);
  const [caffeineEvents, setCaffeineEvents] = useState(0);

  useEffect(() => save(entries), [entries]);

  useEffect(() => {
    shippie.requestIntent('caffeine-logged');
    const off = shippie.intent.subscribe('caffeine-logged', ({ rows }) => {
      setCaffeineEvents((prev) => prev + Math.max(1, rows.length));
    });
    return () => off();
  }, []);

  const summary = useMemo(() => summarizeMove(entries), [entries]);
  const recent = entries.slice(0, 10);

  function addEntry() {
    const createdAt = Date.now();
    if (mode === 'plan') {
      const entry: MoveEntry = {
        id: `move_${createdAt}`,
        kind: 'plan',
        sport: 'run',
        distanceKm,
        minutes,
        createdAt,
      };
      setEntries((prev) => [entry, ...prev].slice(0, 120));
      shippie.intent.broadcast('run-planned', [
        { sport: 'run', distance_km: distanceKm, target_seconds: minutes * 60, started_at: new Date(createdAt).toISOString() },
      ]);
    } else if (mode === 'workout') {
      const entry: MoveEntry = {
        id: `move_${createdAt}`,
        kind: 'workout',
        sport: 'strength',
        minutes,
        createdAt,
      };
      setEntries((prev) => [entry, ...prev].slice(0, 120));
      shippie.intent.broadcast('workout-completed', [
        { id: entry.id, kind: 'strength', durationMin: minutes, intensity: 'moderate', createdAt: new Date(createdAt).toISOString() },
      ]);
    } else {
      const entry: MoveEntry = {
        id: `move_${createdAt}`,
        kind: 'sleep',
        sleepHours,
        quality,
        createdAt,
      };
      setEntries((prev) => [entry, ...prev].slice(0, 120));
      shippie.intent.broadcast('sleep-logged', [
        { loggedAt: new Date(createdAt).toISOString(), hours: sleepHours, quality },
      ]);
    }
    shippie.feel.texture('complete');
  }

  return (
    <main>
      <header>
        <p className="eyebrow">Move</p>
        <h1>Energy, load, recovery.</h1>
        <p>Plan a run, log a workout, close the loop with sleep. No leaderboard.</p>
        <button type="button" onClick={() => shippie.openYourData({ appSlug: 'move' })}>
          Your Data
        </button>
      </header>

      <section className="summary" aria-label="Move summary">
        <div><strong>{summary.plans}</strong><span>plans</span></div>
        <div><strong>{summary.workouts}</strong><span>workouts</span></div>
        <div><strong>{summary.totalMinutes}</strong><span>minutes</span></div>
        <div><strong>{summary.avgSleep === null ? '-' : summary.avgSleep.toFixed(1)}</strong><span>avg sleep</span></div>
      </section>

      {caffeineEvents > 0 ? (
        <p className="context">{caffeineEvents} caffeine signal{caffeineEvents === 1 ? '' : 's'} received for sleep context.</p>
      ) : null}

      <section className="modes" aria-label="Move modes">
        {(['plan', 'workout', 'sleep'] as const).map((next) => (
          <button
            key={next}
            type="button"
            className={mode === next ? 'active' : ''}
            onClick={() => setMode(next)}
          >
            {next}
          </button>
        ))}
      </section>

      <section className="editor">
        {mode === 'plan' ? (
          <>
            <label>
              <span>distance - {distanceKm.toFixed(1)} km</span>
              <input type="range" min={1} max={42} step={0.5} value={distanceKm} onChange={(event) => setDistanceKm(Number(event.target.value))} />
            </label>
            <label>
              <span>target - {minutes} min</span>
              <input type="range" min={10} max={240} step={5} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} />
            </label>
          </>
        ) : mode === 'workout' ? (
          <label>
            <span>duration - {minutes} min</span>
            <input type="range" min={5} max={150} step={5} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} />
          </label>
        ) : (
          <>
            <label>
              <span>sleep - {sleepHours.toFixed(1)} h</span>
              <input type="range" min={3} max={12} step={0.5} value={sleepHours} onChange={(event) => setSleepHours(Number(event.target.value))} />
            </label>
            <label>
              <span>quality - {quality}/10</span>
              <input type="range" min={1} max={10} value={quality} onChange={(event) => setQuality(Number(event.target.value))} />
            </label>
          </>
        )}
        <button type="button" className="primary" onClick={addEntry}>
          Log {mode}
        </button>
      </section>

      <section className="recent">
        <h2>Recent</h2>
        {recent.length === 0 ? (
          <p className="empty">Add a plan, workout, or night. Daily receives the same local intent stream.</p>
        ) : (
          <ul>
            {recent.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.kind}</strong>
                <small>{describe(entry)}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function describe(entry: MoveEntry): string {
  if (entry.kind === 'plan') return `${entry.distanceKm?.toFixed(1)} km - ${entry.minutes} min`;
  if (entry.kind === 'workout') return `${entry.minutes} min - ${new Date(entry.createdAt).toLocaleDateString()}`;
  return `${entry.sleepHours?.toFixed(1)} h - quality ${entry.quality}/10`;
}
