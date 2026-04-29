import { useEffect, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import {
  advance,
  formatRemaining,
  initialState,
  phaseLabel,
  type PomodoroState,
} from './timer.ts';

const shippie = createShippieIframeSdk({ appId: 'app_pomodoro' });

const STORAGE_KEY = 'shippie.pomodoro.v1';

interface PersistedSession {
  finishedAt: string;
  durationMin: number;
  phase: 'focus' | 'short-break' | 'long-break';
}

function loadSessions(): PersistedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedSession[];
    return Array.isArray(parsed) ? parsed.slice(0, 50) : [];
  } catch {
    return [];
  }
}

function saveSessions(rows: readonly PersistedSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    /* quota errors non-fatal */
  }
}

export function App() {
  const [state, setState] = useState<PomodoroState>(() => initialState());
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState<PersistedSession[]>(() => loadSessions());

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      setState((prev) => {
        const nextRemaining = prev.remainingMs - 1000;
        if (nextRemaining > 0) {
          return { ...prev, remainingMs: nextRemaining };
        }
        const finishedPhase = prev.phase;
        if (finishedPhase === 'focus') {
          const session: PersistedSession = {
            finishedAt: new Date().toISOString(),
            durationMin: 25,
            phase: 'focus',
          };
          setSessions((existing) => [session, ...existing].slice(0, 50));
          shippie.intent.broadcast('focus-session', [
            {
              ...session,
              kind: 'focus-session',
              title: '25-minute focus',
            },
          ]);
        }
        shippie.feel.texture('navigate');
        return advance(prev);
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [running]);

  function start() {
    setRunning(true);
    shippie.feel.texture('confirm');
  }

  function pause() {
    setRunning(false);
    shippie.feel.texture('toggle');
  }

  function skip() {
    setRunning(false);
    setState(advance(stateRef.current));
    shippie.feel.texture('refresh');
  }

  function reset() {
    setRunning(false);
    setState(initialState());
    shippie.feel.texture('refresh');
  }

  const totalDurationMs =
    state.phase === 'focus'
      ? 25 * 60_000
      : state.phase === 'short-break'
        ? 5 * 60_000
        : 15 * 60_000;
  const progress = 1 - state.remainingMs / totalDurationMs;

  return (
    <main>
      <header>
        <h1>Pomodoro</h1>
        <p>{sessions.length} focus session{sessions.length === 1 ? '' : 's'} this device</p>
      </header>

      <section className="ring" data-phase={state.phase}>
        <svg viewBox="0 0 200 200" width="220" height="220" role="img" aria-label="Pomodoro progress ring">
          <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="6" />
          <circle
            cx="100"
            cy="100"
            r="92"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 92}`}
            strokeDashoffset={`${2 * Math.PI * 92 * (1 - progress)}`}
            transform="rotate(-90 100 100)"
          />
        </svg>
        <div className="ring-text">
          <strong>{formatRemaining(state.remainingMs)}</strong>
          <small>{phaseLabel(state.phase)}</small>
          <small>cycle {state.focusCyclesCompleted + 1} of 4</small>
        </div>
      </section>

      <section className="controls">
        {!running ? (
          <button className="primary" onClick={start}>Start</button>
        ) : (
          <button className="primary" onClick={pause}>Pause</button>
        )}
        <button className="ghost" onClick={skip}>Skip</button>
        <button className="ghost" onClick={reset}>Reset</button>
      </section>

      <section aria-label="Recent focus sessions">
        <h2>Recent focus</h2>
        {sessions.length === 0 ? (
          <p className="empty">Finish a focus session and it lands here. Habit Tracker subscribers see the broadcast too.</p>
        ) : (
          <ul>
            {sessions.slice(0, 8).map((s) => (
              <li key={s.finishedAt}>
                <strong>{new Date(s.finishedAt).toLocaleString()}</strong>
                <small>{s.durationMin} min focus</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
