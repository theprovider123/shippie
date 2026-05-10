import { useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { GRID, TARGET, puzzleForDate, shareGrid, todayKey } from './puzzle';

/**
 * Number Trail — 5×5 grid, tap 1 → 25 in order. Daily, deterministic
 * by date. Solo, offline, no ads, no IAP.
 *
 * Share mechanic: emoji grid + final time. Falls back to clipboard if
 * navigator.share is missing.
 */

interface Result {
  puzzle_id: string;
  date: string;
  duration_ms: number;
}

function computeStreak(results: Record<string, Result>): number {
  // Walk backwards from today; count consecutive solved dates.
  const dates = new Set(Object.values(results).map((r) => r.date));
  const d = new Date();
  let streak = 0;
  // Allow skipping today if not yet solved (so streak shows yesterday's
  // active streak before play).
  if (!dates.has(formatDate(d))) d.setDate(d.getDate() - 1);
  while (true) {
    const k = formatDate(d);
    if (!dates.has(k)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STORAGE_KEY = 'shippie:daily-puzzle:v1';

const sdk = createShippieIframeSdk({ appId: 'app_daily_puzzle' });
const observations = createObservationClient(sdk);

function loadResults(): Record<string, Result> {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function saveResults(rows: Record<string, Result>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {/* best-effort */}
}

export function App() {
  const [results, setResults] = useState<Record<string, Result>>(() => loadResults());
  const [next, setNext] = useState(1);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [shareNote, setShareNote] = useState<string | null>(null);
  const wrongRef = useRef<number | null>(null);

  const today = todayKey();
  const puzzle = useMemo(() => puzzleForDate(today), [today]);
  const todayResult = results[puzzle.puzzle_id];
  const done = next > TARGET;

  useEffect(() => { saveResults(results); }, [results]);

  // Tick the visible timer once per 100ms while the puzzle is in progress.
  useEffect(() => {
    if (!startedAt || done) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [startedAt, done]);

  const tap = (value: number) => {
    if (done) return;
    if (value !== next) {
      // Wrong tap — flash without resetting progress (the puzzle is
      // already easy enough that resetting would feel cruel).
      haptic('error');
      wrongRef.current = value;
      window.setTimeout(() => { wrongRef.current = null; }, 250);
      return;
    }
    haptic('tap');
    if (next === 1) setStartedAt(Date.now());
    if (next === TARGET) {
      const finalStart = startedAt ?? Date.now();
      const duration = Date.now() - finalStart;
      const result: Result = {
        puzzle_id: puzzle.puzzle_id,
        date: today,
        duration_ms: duration,
      };
      setResults((prev) => ({ ...prev, [puzzle.puzzle_id]: result }));
      observations.emit({
        kind: 'game.completed',
        game: 'daily-puzzle',
        result: duration,
        at: new Date().toISOString(),
      });
      haptic('success');
    }
    setNext((n) => n + 1);
  };

  const restart = () => {
    setNext(1);
    setStartedAt(null);
    setNow(Date.now());
  };

  const share = async () => {
    if (!todayResult) return;
    const text = shareGrid(puzzle, todayResult.duration_ms);
    const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
    try {
      if (typeof nav.share === 'function') {
        await nav.share({ text });
        setShareNote('Shared');
      } else {
        await navigator.clipboard.writeText(text);
        setShareNote('Copied to clipboard');
      }
    } catch {
      try { await navigator.clipboard.writeText(text); setShareNote('Copied to clipboard'); }
      catch { setShareNote('Share unavailable'); }
    }
    window.setTimeout(() => setShareNote(null), 2500);
  };

  const elapsed = startedAt ? (done ? (todayResult?.duration_ms ?? now - startedAt) : now - startedAt) : 0;
  const seconds = (elapsed / 1000).toFixed(1);

  return (
    <main className="app">
      <header className="head">
        <div>
          <h1>Daily Puzzle</h1>
          <p className="muted small">
            Tap 1 to {TARGET} in order. {puzzle.date}
            {(() => { const s = computeStreak(results); return s > 0 ? <span className="streak"> · 🔥 {s}</span> : null; })()}
          </p>
        </div>
        <div className="timer" aria-live="polite">
          {startedAt ? `${seconds}s` : 'Tap 1 to start'}
        </div>
      </header>

      <section className="grid" aria-label="Number trail grid">
        {puzzle.grid.map((value, idx) => {
          const found = value < next;
          const isNext = value === next && !done;
          const wrong = wrongRef.current === value;
          return (
            <button
              key={idx}
              type="button"
              className={`cell${found ? ' found' : ''}${isNext ? ' hint' : ''}${wrong ? ' wrong' : ''}`}
              onClick={() => tap(value)}
              disabled={done}
            >
              <span>{value}</span>
            </button>
          );
        })}
      </section>

      {done && todayResult ? (
        <section className="done" aria-live="polite">
          <p className="finish-line">Done in <strong>{(todayResult.duration_ms / 1000).toFixed(1)}s</strong>.</p>
          <div className="row-actions">
            <button type="button" className="primary" onClick={share}>Share grid</button>
            <button type="button" className="ghost" onClick={restart}>Try again</button>
          </div>
          {shareNote ? <p className="muted small">{shareNote}</p> : null}
        </section>
      ) : null}

      <footer className="footer">
        <a className="muted small" href="https://github.com/devanteprov/shippie/tree/main/apps/showcase-daily-puzzle" target="_blank" rel="noreferrer">Source</a>
      </footer>
    </main>
  );
}
