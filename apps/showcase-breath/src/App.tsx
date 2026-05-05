import { useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import {
  PATTERNS,
  phaseAt,
  totalSeconds,
  type Pattern,
} from './patterns.ts';
import { load, newId, save, type Session } from './db.ts';

const shippie = createShippieIframeSdk({ appId: 'app_breath' });

export function App() {
  const initial = load();
  const [sessions, setSessions] = useState<Session[]>(initial.sessions);
  const [patternId, setPatternId] = useState<Pattern['id']>('box');
  const pattern = PATTERNS.find((p) => p.id === patternId) ?? PATTERNS[0]!;
  const [rounds, setRounds] = useState<number>(pattern.defaultRounds);

  // Session state
  const [running, setRunning] = useState<boolean>(false);
  const [elapsed, setElapsed] = useState<number>(0);
  const startedAtRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    save({ sessions });
  }, [sessions]);

  // RAF-based ticker so the ring animates smoothly. ~16ms updates.
  useEffect(() => {
    if (!running) return;
    function tick() {
      if (startedAtRef.current === null) {
        startedAtRef.current = performance.now();
      }
      const now = performance.now();
      setElapsed((now - startedAtRef.current!) / 1000);
      animFrameRef.current = requestAnimationFrame(tick);
    }
    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    };
  }, [running]);

  const target = totalSeconds(pattern, rounds);
  const phase = phaseAt(pattern, elapsed);
  const isDone = elapsed >= target && running;

  // Ring scale based on phase + remaining-in-phase. Smooth interpolation
  // gives the visual breathing rhythm.
  const ringScale = useMemo(() => {
    if (!phase) return 0.55;
    const progress = 1 - phase.remainInPhase / phase.phase.seconds;
    if (phase.phase.expand === 1) return 0.55 + progress * 0.45; // 0.55 → 1.0
    if (phase.phase.expand === -1) return 1.0 - progress * 0.45; // 1.0 → 0.55
    // hold phases — keep at the previous expand state
    if (phase.phaseIndex === 0) return 0.55;
    return 1.0;
  }, [phase]);

  // Auto-finish when target reached.
  useEffect(() => {
    if (!isDone) return;
    setRunning(false);
    const session: Session = {
      id: newId(),
      pattern: pattern.id,
      rounds,
      duration_seconds: Math.round(elapsed),
      completed_at: new Date().toISOString(),
    };
    setSessions((prev) => [session, ...prev].slice(0, 50));
    shippie.feel.texture('milestone');
    shippie.intent.broadcast('mindful-session', [
      {
        kind: 'breath',
        pattern: session.pattern,
        rounds: session.rounds,
        duration_seconds: session.duration_seconds,
        completed_at: session.completed_at,
      },
    ]);
    startedAtRef.current = null;
    setElapsed(0);
  }, [isDone]);

  function start() {
    startedAtRef.current = null;
    setElapsed(0);
    setRunning(true);
    shippie.feel.texture('confirm');
  }

  function stop() {
    setRunning(false);
    startedAtRef.current = null;
    setElapsed(0);
  }

  function pickPattern(p: Pattern) {
    if (running) return;
    setPatternId(p.id);
    setRounds(p.defaultRounds);
  }

  function openYourData() {
    shippie.openYourData({ appSlug: 'breath' });
  }

  const remainingSec = Math.max(0, Math.ceil(target - elapsed));
  const remainMin = Math.floor(remainingSec / 60);
  const remainSec = remainingSec % 60;

  return (
    <main className="app">
      <header className="app-header">
        <h1>Breath</h1>
        <p className="subtitle">box · 4-7-8 · wim hof</p>
      </header>

      {/* Ring */}
      <section className="ring-wrap" aria-live="polite">
        <div
          className={`ring ${running ? 'running' : ''}`}
          style={{ transform: `scale(${ringScale})` }}
        />
        <div className="ring-label">
          <p className="phase-label">
            {running && phase ? labelFor(phase.phase.label) : 'ready'}
          </p>
          {running && phase ? (
            <p className="phase-count">{Math.ceil(phase.remainInPhase)}</p>
          ) : null}
        </div>
      </section>

      <p className="muted small center">
        {running
          ? `${remainMin}:${remainSec.toString().padStart(2, '0')} remaining · round ${(phase?.roundIndex ?? 0) + 1} / ${rounds}`
          : `${rounds} rounds · ${Math.ceil(target / 60)}min`}
      </p>

      {/* Pattern picker */}
      <section className="pattern-row">
        {PATTERNS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`pattern-chip ${p.id === pattern.id ? 'active' : ''}`}
            onClick={() => pickPattern(p)}
            disabled={running}
          >
            <span className="pattern-name">{p.name}</span>
            <span className="pattern-blurb">{p.blurb}</span>
          </button>
        ))}
      </section>

      {/* Rounds adjust */}
      <section className="rounds-row">
        <label className="field">
          <span>rounds</span>
          <div className="rounds-stepper">
            <button
              type="button"
              className="step"
              onClick={() => setRounds((r) => Math.max(1, r - 1))}
              disabled={running}
            >
              −
            </button>
            <span className="rounds-value">{rounds}</span>
            <button
              type="button"
              className="step"
              onClick={() => setRounds((r) => Math.min(40, r + 1))}
              disabled={running}
            >
              +
            </button>
          </div>
        </label>
      </section>

      {/* Start / stop */}
      <div className="controls">
        {!running ? (
          <button type="button" className="primary" onClick={start}>
            Begin
          </button>
        ) : (
          <button type="button" className="ghost" onClick={stop}>
            Stop
          </button>
        )}
      </div>

      {/* Past sessions */}
      {sessions.length > 0 ? (
        <section className="log">
          <p className="eyebrow">recent</p>
          <ul>
            {sessions.slice(0, 6).map((s) => (
              <li key={s.id}>
                <strong>{patternName(s.pattern)}</strong>
                <span className="muted small">
                  {s.rounds} rounds · {Math.ceil(s.duration_seconds / 60)}min ·{' '}
                  {new Date(s.completed_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <button type="button" className="your-data" onClick={openYourData}>
        Your Data
      </button>
    </main>
  );
}

function labelFor(label: 'inhale' | 'hold' | 'exhale' | 'hold-empty'): string {
  switch (label) {
    case 'inhale':
      return 'inhale';
    case 'hold':
      return 'hold';
    case 'exhale':
      return 'exhale';
    case 'hold-empty':
      return 'hold';
  }
}

function patternName(id: Pattern['id']): string {
  return PATTERNS.find((p) => p.id === id)?.name ?? id;
}
