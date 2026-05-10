import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import {
  COLS,
  ROWS,
  CAMPAIGN_LEVELS,
  generateLevel,
  hitsObstacle,
  laneObstacles,
  logUnderFrog,
  dailySeedForDate,
} from './levels';
import { exitFullscreen, isFullscreen, requestFullscreen } from './fullscreen';

/**
 * Crossing — Frogger-style hop-the-road game.
 *
 * Game loop: requestAnimationFrame at refresh rate. Frog stays at the
 * cell it last hopped to; on river lanes, the frog drifts with the log
 * under it until you hop off or the log floats off-screen with you
 * (drown).
 *
 * Inputs: arrow keys / WASD on desktop, swipe + tap on mobile. The
 * leftmost 16px of the playfield is reserved for the container's
 * back-to-launcher edge swipe.
 */

const sdk = createShippieIframeSdk({ appId: 'app_crossing' });
const observations = createObservationClient(sdk);

const STORAGE_KEY = 'shippie:crossing:v1';
const STARTING_LIVES = 3;
const HOP_DURATION_MS = 90;
const EDGE_NO_INPUT_PX = 16;

interface Progress {
  bestLevel: number;
  bestScore: number;
  totalRuns: number;
}

interface Frog {
  col: number;
  row: number;
  drift: number;
}

type Mode = 'campaign' | 'endless' | 'daily';
type Phase = 'idle' | 'playing' | 'lose' | 'win';

function loadProgress(): Progress {
  if (typeof localStorage === 'undefined') return { bestLevel: 1, bestScore: 0, totalRuns: 0 };
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      bestLevel: typeof v.bestLevel === 'number' ? v.bestLevel : 1,
      bestScore: typeof v.bestScore === 'number' ? v.bestScore : 0,
      totalRuns: typeof v.totalRuns === 'number' ? v.totalRuns : 0,
    };
  } catch {
    return { bestLevel: 1, bestScore: 0, totalRuns: 0 };
  }
}
function saveProgress(p: Progress) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {/**/}
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function App() {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [mode, setMode] = useState<Mode>('campaign');
  const [levelN, setLevelN] = useState(1);
  const [phase, setPhase] = useState<Phase>('idle');
  const [lives, setLives] = useState(STARTING_LIVES);
  const [score, setScore] = useState(0);
  const [fullscreen, setFullscreenState] = useState(false);
  const [, force] = useState(0);

  const tickRef = useRef(0);
  const lastFrameRef = useRef(performance.now());
  const frogRef = useRef<Frog>({ col: Math.floor(COLS / 2), row: 0, drift: 0 });
  const hopRef = useRef<{ from: { col: number; row: number }; to: { col: number; row: number }; until: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  const seedSalt = useMemo(() => (mode === 'daily' ? dailySeedForDate(todayKey()) : 0), [mode]);
  const level = useMemo(() => generateLevel(levelN, seedSalt), [levelN, seedSalt]);

  useEffect(() => { saveProgress(progress); }, [progress]);

  const reset = useCallback((toLevel = 1) => {
    setLevelN(toLevel);
    setLives(STARTING_LIVES);
    setScore(0);
    setPhase('idle');
    frogRef.current = { col: Math.floor(COLS / 2), row: 0, drift: 0 };
    hopRef.current = null;
    tickRef.current = 0;
  }, []);

  const start = () => {
    setPhase('playing');
    lastFrameRef.current = performance.now();
    tickRef.current = 0;
  };

  const die = useCallback(() => {
    haptic('error');
    setLives((l) => {
      const next = l - 1;
      if (next <= 0) {
        setPhase('lose');
        observations.emit({
          kind: 'game.completed',
          game: 'crossing',
          result: `level ${levelN} · ${score} pts`,
          at: new Date().toISOString(),
        });
        setProgress((p) => ({ ...p, totalRuns: p.totalRuns + 1, bestScore: Math.max(p.bestScore, score) }));
        return 0;
      }
      frogRef.current = { col: Math.floor(COLS / 2), row: 0, drift: 0 };
      hopRef.current = null;
      return next;
    });
  }, [levelN, score]);

  const winLevel = useCallback(() => {
    haptic('success');
    setScore((s) => s + 100 + lives * 25);
    if (mode === 'campaign') {
      const next = levelN + 1;
      if (next > CAMPAIGN_LEVELS) {
        setPhase('win');
        observations.emit({
          kind: 'game.completed',
          game: 'crossing',
          result: `campaign-clear ${score + 100 + lives * 25} pts`,
          at: new Date().toISOString(),
        });
        return;
      }
      setLevelN(next);
    }
    frogRef.current = { col: Math.floor(COLS / 2), row: 0, drift: 0 };
    hopRef.current = null;
    setProgress((p) => ({ ...p, bestLevel: Math.max(p.bestLevel, levelN) }));
  }, [levelN, lives, mode, score]);

  const hop = useCallback((dx: number, dy: number) => {
    if (phase !== 'playing' || hopRef.current) return;
    const f = frogRef.current;
    const nextCol = Math.max(0, Math.min(COLS - 1, f.col + dx));
    const nextRow = Math.max(0, Math.min(ROWS - 1, f.row + dy));
    if (nextCol === f.col && nextRow === f.row) return;
    haptic('tap');
    hopRef.current = {
      from: { col: f.col, row: f.row },
      to: { col: nextCol, row: nextRow },
      until: performance.now() + HOP_DURATION_MS,
    };
  }, [phase]);

  // Keyboard input.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (phase !== 'playing') {
        if (e.key === ' ' || e.key === 'Enter') start();
        return;
      }
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': e.preventDefault(); hop(0, 1); break;
        case 'ArrowDown': case 's': case 'S': e.preventDefault(); hop(0, -1); break;
        case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); hop(-1, 0); break;
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); hop(1, 0); break;
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hop, phase]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const localX = rect ? e.clientX - rect.left : e.clientX;
    if (localX < EDGE_NO_INPUT_PX) return;
    swipeRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      if (phase !== 'playing') start();
      else hop(0, 1);
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) hop(dx > 0 ? 1 : -1, 0);
    else hop(0, dy > 0 ? -1 : 1);
  };

  // Game tick.
  useEffect(() => {
    if (phase !== 'playing') return;
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;
      tickRef.current += dt;

      if (hopRef.current && now >= hopRef.current.until) {
        const to = hopRef.current.to;
        const prevRow = frogRef.current.row;
        frogRef.current = { col: to.col, row: to.row, drift: 0 };
        hopRef.current = null;
        if (to.row > prevRow) setScore((s) => s + 10);
      }

      const lane = level.lanes[frogRef.current.row];
      if (lane?.kind === 'river') {
        const log = logUnderFrog(lane, tickRef.current, frogRef.current.col + frogRef.current.drift);
        if (log) {
          frogRef.current.drift += log.speed * dt;
          const px = frogRef.current.col + frogRef.current.drift;
          if (px < -0.5 || px > COLS - 0.5) die();
        } else if (!hopRef.current) {
          die();
        }
      } else {
        frogRef.current.drift = 0;
      }

      if (lane?.kind === 'road' && !hopRef.current) {
        if (hitsObstacle(lane, tickRef.current, frogRef.current.col + frogRef.current.drift)) die();
      }

      if (frogRef.current.row === level.goalRow && !hopRef.current) winLevel();

      force((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, level, die, winLevel]);

  useEffect(() => {
    const h = () => setFullscreenState(isFullscreen());
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const toggleFullscreen = () => {
    if (isFullscreen()) void exitFullscreen();
    else void requestFullscreen(containerRef.current);
  };

  const renderRows: React.ReactElement[] = [];
  for (let r = ROWS - 1; r >= 0; r--) {
    const lane = level.lanes[r]!;
    const obstacles = laneObstacles(lane, tickRef.current);
    const isFrogRow = frogRef.current.row === r;
    const animPos = hopRef.current
      ? (() => {
          const a = hopRef.current!;
          const remaining = Math.max(0, a.until - performance.now());
          const p = 1 - remaining / HOP_DURATION_MS;
          return { col: a.from.col + (a.to.col - a.from.col) * p, row: a.from.row + (a.to.row - a.from.row) * p };
        })()
      : null;
    const frogCol = isFrogRow
      ? animPos?.row === r ? animPos.col : frogRef.current.col + frogRef.current.drift
      : null;
    renderRows.push(
      <div key={r} className={`lane lane-${lane.kind}`}>
        {lane.kind !== 'safe' &&
          obstacles.map((x, idx) => (
            <span
              key={idx}
              className={`obstacle obstacle-${lane.kind}`}
              style={{ left: `${(x / COLS) * 100}%`, width: `${(lane.length / COLS) * 100}%` }}
            />
          ))}
        {frogCol !== null ? (
          <span className="frog" style={{ left: `${(frogCol / COLS) * 100}%`, width: `${(1 / COLS) * 100}%` }} aria-label="frog">🐸</span>
        ) : null}
      </div>,
    );
  }

  return (
    <main className="app" ref={containerRef}>
      <header className="head">
        <div>
          <h1>Crossing</h1>
          <p className="muted small">Level {levelN} · {lives}♥ · {score} pts</p>
        </div>
        <div className="head-actions">
          <button type="button" className="ghost" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
            {fullscreen ? '⤡' : '⛶'}
          </button>
        </div>
      </header>

      <section className="mode-row">
        {(['campaign', 'endless', 'daily'] as Mode[]).map((m) => (
          <button key={m} type="button" className={m === mode ? 'tab active' : 'tab'}
            onClick={() => { setMode(m); reset(1); }}>
            {m}
          </button>
        ))}
      </section>

      <div className="playfield" onPointerDown={onPointerDown} onPointerUp={onPointerUp} role="application">
        {renderRows}
      </div>

      {phase === 'idle' ? (
        <section className="overlay" aria-live="polite">
          <p className="finish-line">Tap to start</p>
          <p className="muted small">Arrow keys / WASD on desktop. Swipe or tap up on mobile.</p>
          <button type="button" className="primary" onClick={start}>Hop</button>
        </section>
      ) : phase === 'lose' ? (
        <section className="overlay" aria-live="polite">
          <p className="finish-line">Game over · {score} pts</p>
          <button type="button" className="primary" onClick={() => reset(1)}>Try again</button>
        </section>
      ) : phase === 'win' ? (
        <section className="overlay" aria-live="polite">
          <p className="finish-line">🏆 Campaign cleared! {score} pts</p>
          <button type="button" className="primary" onClick={() => reset(1)}>Play again</button>
        </section>
      ) : null}

      <footer className="footer">
        <span className="muted small">Best: lvl {progress.bestLevel} · {progress.bestScore} pts</span>
      </footer>
    </main>
  );
}
