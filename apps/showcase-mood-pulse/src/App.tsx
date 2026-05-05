import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import {
  MOOD_PALETTE,
  dayKey,
  load,
  save,
  setTodayMood,
  todayKey,
  type MoodEntry,
} from './db.ts';

const shippie = createShippieIframeSdk({ appId: 'app_mood_pulse' });

export function App() {
  const initial = load();
  const [moods, setMoods] = useState<MoodEntry[]>(initial.moods);
  const [note, setNote] = useState('');
  // Cross-app correlation context — caffeine, workout, sleep — pulled
  // from the container so the user can see "you tapped low after a
  // late-night coffee" without leaving the app. Subscriptions are
  // permission-gated; if denied, these stay empty + we don't show
  // the correlations row.
  const [caffeineMgToday, setCaffeineMgToday] = useState(0);
  const [workoutToday, setWorkoutToday] = useState(false);
  const [sleepHoursLast, setSleepHoursLast] = useState<number | null>(null);

  // Persist on every state change.
  useEffect(() => {
    save({ moods });
  }, [moods]);

  // Subscribe to the three correlate-able intents on mount.
  useEffect(() => {
    shippie.requestIntent('caffeine-logged');
    shippie.requestIntent('workout-completed');
    shippie.requestIntent('sleep-logged');
    const offCaffeine = shippie.intent.subscribe(
      'caffeine-logged',
      ({ rows }) => {
        const today = todayKey();
        const sum = (rows as Array<{ mg?: number; logged_at?: string }>).reduce(
          (s, r) => (r.logged_at?.slice(0, 10) === today ? s + (r.mg ?? 0) : s),
          0,
        );
        setCaffeineMgToday(sum);
      },
    );
    const offWorkout = shippie.intent.subscribe(
      'workout-completed',
      ({ rows }) => {
        const today = todayKey();
        const any = (rows as Array<{ logged_at?: string }>).some(
          (r) => r.logged_at?.slice(0, 10) === today,
        );
        setWorkoutToday(any);
      },
    );
    const offSleep = shippie.intent.subscribe('sleep-logged', ({ rows }) => {
      // Pick the most recent sleep_hours value.
      const sorted = (rows as Array<{ hours?: number; logged_at?: string }>)
        .filter((r) => typeof r.hours === 'number')
        .sort((a, b) => (b.logged_at ?? '').localeCompare(a.logged_at ?? ''));
      setSleepHoursLast(sorted[0]?.hours ?? null);
    });
    return () => {
      offCaffeine?.();
      offWorkout?.();
      offSleep?.();
    };
  }, []);

  function logMood(score: MoodEntry['score']) {
    const { next, entry } = setTodayMood(moods, score, note);
    setMoods(next);
    setNote('');
    shippie.feel.texture('confirm');
    shippie.intent.broadcast('mood-logged', [
      {
        score: entry.score,
        note: entry.note,
        logged_at: entry.logged_at,
      },
    ]);
  }

  const today = todayKey();
  const todayEntry = moods.find((m) => dayKey(m.logged_at) === today) ?? null;
  const palette = MOOD_PALETTE.find((p) => p.score === todayEntry?.score) ?? null;

  // 30-day sparkline — fill missing days with null so we can render gaps.
  const last30 = useMemo(() => {
    const days: Array<{ key: string; entry: MoodEntry | null }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const entry = moods.find((m) => dayKey(m.logged_at) === key) ?? null;
      days.push({ key, entry });
    }
    return days;
  }, [moods]);

  const avg30 = useMemo(() => {
    const scored = last30.filter((d) => d.entry != null);
    if (scored.length === 0) return null;
    return scored.reduce((s, d) => s + (d.entry?.score ?? 0), 0) / scored.length;
  }, [last30]);

  function openYourData() {
    shippie.openYourData({ appSlug: 'mood-pulse' });
  }

  const correlations: string[] = [];
  if (caffeineMgToday > 0) correlations.push(`${caffeineMgToday}mg caffeine`);
  if (workoutToday) correlations.push('moved today');
  if (sleepHoursLast !== null) correlations.push(`${sleepHoursLast.toFixed(1)}h sleep`);

  return (
    <main className="app">
      <header className="app-header">
        <h1>Mood Pulse</h1>
        <p className="subtitle">three seconds, once a day</p>
      </header>

      {todayEntry && palette ? (
        <section className="logged">
          <p className="eyebrow">today · logged</p>
          <p className="big">
            {palette.emoji} <span className="label">{palette.label}</span>
          </p>
          {todayEntry.note ? <p className="note">"{todayEntry.note}"</p> : null}
          <p className="small muted">
            tap a different mood below to update, or come back tomorrow
          </p>
        </section>
      ) : (
        <section className="prompt">
          <p className="eyebrow">today</p>
          <p className="big-prompt">how does today feel?</p>
        </section>
      )}

      <section className="palette">
        {MOOD_PALETTE.map((p) => {
          const active = todayEntry?.score === p.score;
          return (
            <button
              key={p.score}
              type="button"
              className={`mood-btn${active ? ' mood-active' : ''}`}
              onClick={() => logMood(p.score)}
              aria-label={`${p.label} (${p.score} of 5)`}
              aria-pressed={active}
            >
              <span className="mood-emoji" aria-hidden="true">{p.emoji}</span>
              <span className="mood-label">{p.label}</span>
            </button>
          );
        })}
      </section>

      <textarea
        className="note-input"
        placeholder="one line about the day (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 180))}
        rows={2}
      />

      {correlations.length > 0 ? (
        <p className="small muted center">
          today's context: {correlations.join(' · ')}
        </p>
      ) : null}

      <section className="chart">
        <div className="chart-head">
          <p className="eyebrow">last 30 days</p>
          {avg30 !== null ? (
            <p className="small muted">avg {avg30.toFixed(1)}/5</p>
          ) : null}
        </div>
        <div className="bars">
          {last30.map((d) => {
            const score = d.entry?.score ?? 0;
            const h = score > 0 ? (score / 5) * 100 : 0;
            return (
              <div
                key={d.key}
                className="day"
                title={
                  d.entry
                    ? `${d.key}: ${d.entry.score}/5${d.entry.note ? ` — ${d.entry.note}` : ''}`
                    : `${d.key}: not logged`
                }
              >
                {h > 0 ? (
                  <div
                    className={`day-bar score-${score}`}
                    style={{ height: `${h}%` }}
                  />
                ) : (
                  <div className="day-blank" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <button type="button" className="your-data" onClick={openYourData}>
        Your Data
      </button>
    </main>
  );
}
