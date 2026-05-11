import { useCallback, useEffect, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { createSoundBank, isMuted, toggleMuted } from '@shippie/juice';
import { ARCADE_SAMPLES } from '@shippie/juice/samples';
import {
  BASE_STEP_MS,
  SIZE,
  createWorld,
  dailySeed,
  queueDirection,
  stepIntervalMs,
  tickWorld,
  todayKey,
  visualPosition,
  type Direction,
  type Mode,
  type World,
} from './engine';

const sfx = createSoundBank({
  tap: ARCADE_SAMPLES.tap,
  pop: ARCADE_SAMPLES.pop,
  bing: ARCADE_SAMPLES.bing,
  warn: ARCADE_SAMPLES.warn,
  fail: ARCADE_SAMPLES.fail,
  success: ARCADE_SAMPLES.success,
  levelUp: ARCADE_SAMPLES.levelUp,
});

const sdk = createShippieIframeSdk({ appId: 'app_snake' });
const observations = createObservationClient(sdk);
sdk.safeEdges.declareInputRegion('all');

const STORAGE_KEY = 'shippie:snake:v1';

interface Stored {
  bestClassic: number;
  bestLoop: number;
  bestDaily: number;
  dailyStreak: number;
  lastDailyDate: string;
  totalRuns: number;
}

function loadStored(): Stored {
  if (typeof localStorage === 'undefined') {
    return { bestClassic: 0, bestLoop: 0, bestDaily: 0, dailyStreak: 0, lastDailyDate: '', totalRuns: 0 };
  }
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      bestClassic: typeof v.bestClassic === 'number' ? v.bestClassic : 0,
      bestLoop: typeof v.bestLoop === 'number' ? v.bestLoop : 0,
      bestDaily: typeof v.bestDaily === 'number' ? v.bestDaily : 0,
      dailyStreak: typeof v.dailyStreak === 'number' ? v.dailyStreak : 0,
      lastDailyDate: typeof v.lastDailyDate === 'string' ? v.lastDailyDate : '',
      totalRuns: typeof v.totalRuns === 'number' ? v.totalRuns : 0,
    };
  } catch {
    return { bestClassic: 0, bestLoop: 0, bestDaily: 0, dailyStreak: 0, lastDailyDate: '', totalRuns: 0 };
  }
}
function saveStored(s: Stored) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {/**/} }

const DPAD_FADE_AFTER_HOPS = 8;

export function App() {
  const [mode, setMode] = useState<Mode>('classic');
  const [world, setWorld] = useState<World>(() => createWorld('classic'));
  const [stored, setStored] = useState<Stored>(() => loadStored());
  const [muted, setMutedState] = useState(() => isMuted());
  const [, force] = useState(0);
  const [hopCount, setHopCount] = useState(0);
  const [resultRecorded, setResultRecorded] = useState(false);
  const lastFrameRef = useRef(performance.now());
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { saveStored(stored); }, [stored]);

  const startGame = useCallback((nextMode: Mode) => {
    setMode(nextMode);
    setWorld(createWorld(nextMode));
    lastFrameRef.current = performance.now();
    setHopCount(0);
    setResultRecorded(false);
  }, []);

  // End-of-run side effects.
  useEffect(() => {
    if (world.state !== 'over' || resultRecorded) return;
    setResultRecorded(true);
    sfx.play('fail');
    haptic('error');
    observations.emit({
      kind: 'game.completed',
      game: 'snake',
      result: `${mode} · ${world.score} pts · ${world.applesEaten} apples`,
      at: new Date().toISOString(),
    });
    setStored((s) => {
      const today = todayKey();
      const dailyStreak = mode === 'daily'
        ? (s.lastDailyDate === today ? s.dailyStreak : s.dailyStreak + 1)
        : s.dailyStreak;
      return {
        ...s,
        totalRuns: s.totalRuns + 1,
        bestClassic: mode === 'classic' ? Math.max(s.bestClassic, world.score) : s.bestClassic,
        bestLoop: mode === 'loop' ? Math.max(s.bestLoop, world.score) : s.bestLoop,
        bestDaily: mode === 'daily' ? Math.max(s.bestDaily, world.score) : s.bestDaily,
        dailyStreak,
        lastDailyDate: mode === 'daily' ? today : s.lastDailyDate,
      };
    });
  }, [world.state, world.score, world.applesEaten, mode, resultRecorded]);

  const hopOrSetDir = useCallback((dir: Direction) => {
    queueDirection(world, dir);
    haptic('tap');
    sfx.play('tap', { volume: 0.3, pitch: 1.1 });
    setHopCount((n) => n + 1);
  }, [world]);

  // Game loop. tickWorld now owns step cadence + visual progress so
  // the render path can lerp segments smoothly between cells.
  useEffect(() => {
    if (world.state !== 'playing') return;
    let raf = 0;
    const loop = (now: number) => {
      const dtMs = Math.min(60, now - lastFrameRef.current);
      lastFrameRef.current = now;
      const prevApples = world.applesEaten;
      const prevPellets = world.pelletsEaten;
      const steps = tickWorld(world, dtMs);
      if (steps > 0) {
        if (world.applesEaten > prevApples) {
          sfx.play('pop', { pitch: 0.95 + Math.random() * 0.3 });
          haptic('success');
        }
        if (world.pelletsEaten > prevPellets) {
          sfx.play('bing');
          haptic('success');
        }
      }
      force((n) => n + 1);
      if (world.state === 'playing') {
        raf = requestAnimationFrame(loop);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [world]);

  // Keyboard.
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (world.state === 'over' && (e.key === ' ' || e.key === 'Enter')) {
        startGame(mode);
        return;
      }
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': e.preventDefault(); hopOrSetDir('N'); break;
        case 'ArrowDown': case 's': case 'S': e.preventDefault(); hopOrSetDir('S'); break;
        case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); hopOrSetDir('W'); break;
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); hopOrSetDir('E'); break;
      }
    }
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [hopOrSetDir, mode, startGame, world.state]);

  // Touch swipe.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    swipeRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s) return;
    if ((e.target as HTMLElement | null)?.closest('button')) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
    if (Math.abs(dx) > Math.abs(dy)) hopOrSetDir(dx > 0 ? 'E' : 'W');
    else hopOrSetDir(dy > 0 ? 'S' : 'N');
  };

  const dpadVisible = hopCount < DPAD_FADE_AFTER_HOPS;
  const speedPct = Math.round(((BASE_STEP_MS - stepIntervalMs(world)) / BASE_STEP_MS) * 100);

  return (
    <main className="app">
      <header className="head">
        <div>
          <h1>Snake</h1>
          <p className="muted small">
            {mode === 'daily' ? `Daily · ${todayKey().slice(5)}` : mode === 'loop' ? 'Loop walls' : 'Classic'}
            {' · '}{world.score} pts · {world.applesEaten} apples
            {speedPct > 0 ? <span className="speed-chip">+{speedPct}%</span> : null}
            {mode === 'daily' && stored.dailyStreak > 0 ? <span className="streak"> · 🔥 {stored.dailyStreak}</span> : null}
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="ghost" onClick={() => setMutedState(toggleMuted())} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🔊'}
          </button>
          <button type="button" className="ghost" onClick={() => startGame(mode)} aria-label="Restart">↻</button>
        </div>
      </header>

      <section className="mode-row">
        <button type="button" className={mode === 'classic' ? 'tab active' : 'tab'} onClick={() => startGame('classic')}>Classic</button>
        <button type="button" className={mode === 'loop' ? 'tab active' : 'tab'} onClick={() => startGame('loop')}>Loop</button>
        <button type="button" className={mode === 'daily' ? 'tab active' : 'tab'} onClick={() => startGame('daily')}>Daily</button>
      </section>

      <div
        className="grid-wrap"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        role="application"
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gridTemplateRows: `repeat(${SIZE}, 1fr)` }}
        >
          {/* Discrete cell layer for reliable layout — paints the
              snake bodies, apple, pellet at integer cells. */}
          {Array.from({ length: SIZE * SIZE }, (_, idx) => {
            const c = idx % SIZE;
            const r = Math.floor(idx / SIZE);
            const isApple = c === world.apple.c && r === world.apple.r;
            const isPellet = !!world.pellet && c === world.pellet.cell.c && r === world.pellet.cell.r;
            const onSnake = world.snake.some((s, si) => si > 0 && s.c === c && s.r === r);
            const cls = isApple ? 'cell cell-apple'
              : isPellet ? 'cell cell-pellet'
              : onSnake ? 'cell cell-body'
              : 'cell';
            return <span key={idx} className={cls} aria-hidden />;
          })}
          {/* Smoothly-lerped head overlay — sits on top, glides
              between cells via stepProgress so the snake doesn't
              look like it teleports. */}
          {(() => {
            const vp = visualPosition(world, 0);
            return (
              <span
                className="head-overlay"
                style={{
                  left: `${(vp.c / SIZE) * 100}%`,
                  top: `${(vp.r / SIZE) * 100}%`,
                  width: `${100 / SIZE}%`,
                  height: `${100 / SIZE}%`,
                }}
                aria-hidden
              />
            );
          })()}
        </div>
      </div>

      {dpadVisible ? (
        <section className="dpad-row" aria-hidden>
          <button type="button" className="dpad-btn"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); hopOrSetDir('W'); }}
          >◀</button>
          <div className="dpad-stack">
            <button type="button" className="dpad-btn"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); hopOrSetDir('N'); }}
            >▲</button>
            <button type="button" className="dpad-btn"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); hopOrSetDir('S'); }}
            >▼</button>
          </div>
          <button type="button" className="dpad-btn"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); hopOrSetDir('E'); }}
          >▶</button>
        </section>
      ) : null}

      {world.state === 'over' ? (
        <section className="overlay" aria-live="polite">
          <p className="finish-line">Bit yourself · {world.score} pts</p>
          <p className="muted small">
            Best {mode}: {mode === 'classic' ? stored.bestClassic : mode === 'loop' ? stored.bestLoop : stored.bestDaily} pts
          </p>
          <button type="button" className="primary" onClick={() => startGame(mode)}>Play again</button>
        </section>
      ) : null}
    </main>
  );
}
