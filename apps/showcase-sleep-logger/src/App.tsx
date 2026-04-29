import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import {
  correlateSleepWithEvents,
  describeCorrelation,
  dayKey,
  type SleepNight,
} from './correlation.ts';
import { computeSleepDebt, hoursSlept } from './sleep-debt.ts';
import { ScatterPlot } from './ScatterPlot.tsx';

const shippie = createShippieIframeSdk({ appId: 'app_sleep_logger' });

interface Night extends SleepNight {
  id: string;
  bedtime?: string;
  wakeTime?: string;
}

interface ExternalEvent {
  at: number;
  source: 'workout-completed' | 'caffeine-logged';
}

const STORAGE_KEY = 'shippie.sleep-logger.v1';

interface PersistedState {
  nights: Night[];
  events: ExternalEvent[];
}

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { nights: [], events: [] };
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      nights: Array.isArray(parsed.nights) ? parsed.nights : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return { nights: [], events: [] };
  }
}

export function App() {
  const initial = load();
  const [nights, setNights] = useState<Night[]>(initial.nights);
  const [events, setEvents] = useState<ExternalEvent[]>(initial.events);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [quality, setQuality] = useState(7);
  const [bedtime, setBedtime] = useState('22:30');
  const [wakeTime, setWakeTime] = useState('06:30');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nights, events }));
  }, [nights, events]);

  // Subscribe to the two intents we declared as `consumes`. caffeine-logged
  // is included even though no showcase provides it yet — the contract
  // stays correct for when one does.
  useEffect(() => {
    const intents: Array<'workout-completed' | 'caffeine-logged'> = [
      'workout-completed',
      'caffeine-logged',
    ];
    for (const intent of intents) shippie.requestIntent(intent);
    const offs = intents.map((intent) =>
      shippie.intent.subscribe(intent, () => {
        const at = Date.now();
        setEvents((prev) => [
          ...prev.filter((e) => Math.abs(e.at - at) > 5 * 60 * 1000 || e.source !== intent),
          { at, source: intent },
        ]);
      }),
    );
    return () => {
      for (const off of offs) off();
    };
  }, []);

  const workoutCorrelation = useMemo(() => {
    const workoutEvents = events.filter((e) => e.source === 'workout-completed');
    return correlateSleepWithEvents(nights, workoutEvents);
  }, [nights, events]);

  // P3 — sleep-debt running average over the last 14 nights.
  const sleepDebt = useMemo(() => {
    const withHours = nights.map((n) => ({
      date: n.date,
      hours: n.bedtime && n.wakeTime ? hoursSlept(n.bedtime, n.wakeTime) : 0,
    }));
    return computeSleepDebt(withHours);
  }, [nights]);

  // P3 — scatter plot data: events-per-day vs quality.
  const scatterPoints = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of events) {
      const k = dayKey(ev.at);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return nights.slice(0, 30).map((n) => ({
      date: n.date,
      quality: n.quality,
      events: counts.get(n.date) ?? 0,
    }));
  }, [nights, events]);

  function logNight(e: React.FormEvent) {
    e.preventDefault();
    const hours = bedtime && wakeTime ? hoursSlept(bedtime, wakeTime) : 0;
    const night: Night = {
      id: `n_${Date.now()}`,
      date,
      quality,
      bedtime,
      wakeTime,
    };
    setNights((prev) => [night, ...prev.filter((n) => n.date !== date)]);
    // P3 — broadcast `sleep-logged` so Workout Logger's correlation
    // card and any other consumer can react. Carries enough fields to
    // be useful (date + hours + quality) without leaking subjective
    // notes.
    shippie.intent.broadcast('sleep-logged', [
      { loggedAt: new Date(date).toISOString(), hours, quality },
    ]);
    shippie.feel.texture('confirm');
  }

  function remove(id: string) {
    setNights((prev) => prev.filter((n) => n.id !== id));
    shippie.feel.texture('delete');
  }

  return (
    <main>
      <header>
        <h1>Sleep</h1>
        <p>{nights.length} night{nights.length === 1 ? '' : 's'} logged · {events.filter((e) => e.source === 'workout-completed').length} workouts received</p>
      </header>

      {workoutCorrelation && (
        <section className="insight">
          <strong>Pattern:</strong> {describeCorrelation(workoutCorrelation)}
        </section>
      )}

      {sleepDebt.nightsCounted >= 3 && (
        <section className="debt" aria-label="Sleep debt">
          <strong>
            Debt:{' '}
            {sleepDebt.totalDebtHours > 0
              ? `${sleepDebt.totalDebtHours.toFixed(1)}h short`
              : sleepDebt.totalDebtHours < 0
                ? `${Math.abs(sleepDebt.totalDebtHours).toFixed(1)}h banked`
                : 'on target'}
          </strong>
          <small>
            vs {sleepDebt.targetHours}h × {sleepDebt.nightsCounted} nights
          </small>
        </section>
      )}

      {scatterPoints.length >= 3 && (
        <section className="scatter-section" aria-label="Sleep quality vs activity events">
          <h2>Quality vs activity</h2>
          <ScatterPlot points={scatterPoints} />
        </section>
      )}

      <form onSubmit={logNight}>
        <label>
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="row">
          <label>
            <span>Bedtime</span>
            <input type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} />
          </label>
          <label>
            <span>Wake</span>
            <input type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} />
          </label>
        </div>
        <label>
          <span>Quality · {quality}/10</span>
          <input
            type="range"
            min={1}
            max={10}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            aria-label="Sleep quality"
          />
        </label>
        <button type="submit">Log night</button>
      </form>

      <section>
        <h2>Recent nights</h2>
        {nights.length === 0 ? (
          <p className="empty">Log a night above. After 14 nights with overlapping workouts, a correlation pattern appears.</p>
        ) : (
          <ul>
            {nights.slice(0, 14).map((n) => (
              <li key={n.id}>
                <div>
                  <strong>{n.date}</strong>
                  <small>{n.bedtime} → {n.wakeTime} · quality {n.quality}/10</small>
                </div>
                <button onClick={() => remove(n.id)} aria-label={`Remove ${n.date}`}>×</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
