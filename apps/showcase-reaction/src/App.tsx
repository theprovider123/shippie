import { useEffect, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';

/**
 * Reaction — wait for green, tap as fast as you can.
 *
 * Three-second hook: ready → wait (random 0.8–2.4s) → green → tap →
 * ms shown. Tapping early shows a friendly "too early" and resets.
 * Best-of-the-day kept in localStorage; daily ribbon shows trend over
 * the last 14 days.
 */

type Phase = 'idle' | 'waiting' | 'go' | 'result' | 'too-early';

interface DayBest {
  date: string;
  bestMs: number;
  attempts: number;
}

const STORAGE_KEY = 'shippie:reaction:v1';

const sdk = createShippieIframeSdk({ appId: 'app_reaction' });
const observations = createObservationClient(sdk);

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadHistory(): Record<string, DayBest> {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {}; }
  catch { return {}; }
}
function saveHistory(rows: Record<string, DayBest>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); } catch {/**/}
}

export function App() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [history, setHistory] = useState<Record<string, DayBest>>(() => loadHistory());
  const goAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const today = todayKey();
  const todayBest = history[today]?.bestMs ?? null;

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  function start() {
    setLastMs(null);
    setPhase('waiting');
    const delay = 800 + Math.random() * 1600;
    timerRef.current = window.setTimeout(() => {
      goAtRef.current = performance.now();
      setPhase('go');
      haptic('success');
    }, delay);
  }

  function reset() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    goAtRef.current = null;
    setPhase('idle');
  }

  function onPress() {
    if (phase === 'idle' || phase === 'result' || phase === 'too-early') {
      start();
      return;
    }
    if (phase === 'waiting') {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      setPhase('too-early');
      haptic('error');
      return;
    }
    if (phase === 'go' && goAtRef.current !== null) {
      const ms = Math.round(performance.now() - goAtRef.current);
      setLastMs(ms);
      setPhase('result');
      haptic('tap');
      const prevBest = history[today]?.bestMs;
      const nextBest = prevBest === undefined ? ms : Math.min(prevBest, ms);
      const next: DayBest = {
        date: today,
        bestMs: nextBest,
        attempts: (history[today]?.attempts ?? 0) + 1,
      };
      const updated = { ...history, [today]: next };
      setHistory(updated);
      saveHistory(updated);
      observations.emit({
        kind: 'game.completed',
        game: 'reaction',
        result: ms,
        at: new Date().toISOString(),
      });
    }
  }

  const ribbon = (() => {
    const out: { key: string; ms: number | null }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ key, ms: history[key]?.bestMs ?? null });
    }
    return out;
  })();

  function tone(ms: number | null): string {
    if (ms === null) return 'transparent';
    if (ms < 200) return '#2EAD64';
    if (ms < 280) return '#4FA487';
    if (ms < 360) return '#F4B860';
    if (ms < 460) return '#F0734A';
    return '#E84A2D';
  }

  return (
    <main className="app">
      <header className="head">
        <div>
          <h1>Reaction</h1>
          <p className="muted small">Wait for green. Tap fast.</p>
        </div>
        {todayBest !== null ? (
          <p className="muted small">Today best: <strong>{todayBest}ms</strong></p>
        ) : null}
      </header>

      <section
        className={`stage stage-${phase}`}
        onPointerDown={onPress}
        role="button"
        tabIndex={0}
      >
        {phase === 'idle' && <p>Tap to start</p>}
        {phase === 'waiting' && <p>Wait…</p>}
        {phase === 'go' && <p>TAP!</p>}
        {phase === 'result' && lastMs !== null && (
          <>
            <p className="ms">{lastMs}<span className="unit">ms</span></p>
            <p className="muted small">Tap again</p>
          </>
        )}
        {phase === 'too-early' && (
          <>
            <p>Too early</p>
            <p className="muted small">Tap to try again</p>
          </>
        )}
      </section>

      {phase === 'waiting' || phase === 'go' ? (
        <button type="button" className="ghost" onClick={reset}>Reset</button>
      ) : null}

      <section className="ribbon-section">
        <h2>Last 14 days</h2>
        <div className="ribbon" aria-hidden>
          {ribbon.map((d) => (
            <span
              key={d.key}
              className="tile"
              style={{ background: tone(d.ms) }}
              title={d.ms !== null ? `${d.key} — ${d.ms}ms` : `${d.key} — no play`}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
