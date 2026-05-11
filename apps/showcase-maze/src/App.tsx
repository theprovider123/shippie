import { useCallback, useEffect, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { createSoundBank, isMuted, toggleMuted } from '@shippie/juice';
import { ARCADE_SAMPLES } from '@shippie/juice/samples';
import {
  createWorld,
  dailySeed,
  queueDirection,
  tickWorld,
  todayKey,
  visualPosition,
  type World,
} from './engine';
import { MAZE_H, MAZE_W, type Direction } from './maze';

const sfx = createSoundBank({
  tap: ARCADE_SAMPLES.tap,
  pop: ARCADE_SAMPLES.pop,
  bing: ARCADE_SAMPLES.bing,
  warn: ARCADE_SAMPLES.warn,
  whoosh: ARCADE_SAMPLES.whoosh,
  fail: ARCADE_SAMPLES.fail,
  success: ARCADE_SAMPLES.success,
  levelUp: ARCADE_SAMPLES.levelUp,
});

const sdk = createShippieIframeSdk({ appId: 'app_maze' });
const observations = createObservationClient(sdk);
sdk.safeEdges.declareInputRegion('all');

const STORAGE_KEY = 'shippie:maze:v1';

type Mode = 'classic' | 'daily' | 'practice';

interface Stored {
  bestScore: number;
  bestDots: number;
  totalRuns: number;
  dailyStreak: number;
  lastDailyDate: string;
}

function loadStored(): Stored {
  if (typeof localStorage === 'undefined') return { bestScore: 0, bestDots: 0, totalRuns: 0, dailyStreak: 0, lastDailyDate: '' };
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      bestScore: typeof v.bestScore === 'number' ? v.bestScore : 0,
      bestDots: typeof v.bestDots === 'number' ? v.bestDots : 0,
      totalRuns: typeof v.totalRuns === 'number' ? v.totalRuns : 0,
      dailyStreak: typeof v.dailyStreak === 'number' ? v.dailyStreak : 0,
      lastDailyDate: typeof v.lastDailyDate === 'string' ? v.lastDailyDate : '',
    };
  } catch {
    return { bestScore: 0, bestDots: 0, totalRuns: 0, dailyStreak: 0, lastDailyDate: '' };
  }
}
function saveStored(s: Stored) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {/**/} }

const GHOST_COLOURS = {
  chaser: '#FF6F61',
  ambusher: '#FFB37C',
  wanderer: '#7AE6FF',
  coward: '#C19BFF',
} as const;

export function App() {
  const [mode, setMode] = useState<Mode>('classic');
  const [worldRef, setWorldRef] = useState<{ world: World }>(() => ({ world: createWorld() }));
  const [stored, setStored] = useState<Stored>(() => loadStored());
  const [muted, setMutedState] = useState(() => isMuted());
  const [, force] = useState(0);
  const [resultRecorded, setResultRecorded] = useState(false);
  const lastFrameRef = useRef(performance.now());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const world = worldRef.world;

  useEffect(() => { saveStored(stored); }, [stored]);

  const startGame = useCallback((nextMode: Mode) => {
    setMode(nextMode);
    const seed = nextMode === 'daily' ? dailySeed() : undefined;
    setWorldRef({ world: createWorld({ seed, practice: nextMode === 'practice' }) });
    lastFrameRef.current = performance.now();
    setResultRecorded(false);
  }, []);

  // Game loop.
  useEffect(() => {
    if (world.state !== 'playing') return;
    let raf = 0;
    let prevDots = world.dotsLeft + world.pelletsLeft;
    let prevCombo = world.ghostCombo;
    const loop = (now: number) => {
      const dtMs = Math.min(40, now - lastFrameRef.current);
      lastFrameRef.current = now;
      tickWorld(world, dtMs);
      const dots = world.dotsLeft + world.pelletsLeft;
      if (dots < prevDots) {
        sfx.play('tap', { volume: 0.25, pitch: 1.3 + Math.random() * 0.2 });
      }
      if (world.ghostCombo > prevCombo) {
        sfx.play('bing');
      }
      prevDots = dots;
      prevCombo = world.ghostCombo;
      drawWorld(canvasRef.current, world);
      force((n) => n + 1);
      if (world.state === 'playing') {
        raf = requestAnimationFrame(loop);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [world]);

  // End-of-run.
  useEffect(() => {
    if (world.state === 'playing' || resultRecorded) return;
    setResultRecorded(true);
    if (world.state === 'won') {
      sfx.play('success');
      haptic('success');
    } else {
      sfx.play('fail');
      haptic('error');
    }
    observations.emit({
      kind: 'game.completed',
      game: 'maze',
      result: `${mode} · ${world.state} · ${world.score} pts`,
      at: new Date().toISOString(),
    });
    setStored((s) => {
      const today = todayKey();
      const dailyStreak = mode === 'daily'
        ? (s.lastDailyDate === today ? s.dailyStreak : s.dailyStreak + 1)
        : s.dailyStreak;
      const dotsEaten = world.parsed.dotCount - world.dotsLeft;
      return {
        ...s,
        totalRuns: s.totalRuns + 1,
        bestScore: Math.max(s.bestScore, world.score),
        bestDots: Math.max(s.bestDots, dotsEaten),
        dailyStreak,
        lastDailyDate: mode === 'daily' ? today : s.lastDailyDate,
      };
    });
  }, [world.state, world.score, world.dotsLeft, mode, resultRecorded, world.parsed.dotCount]);

  const issueDirection = useCallback((dir: Direction) => {
    queueDirection(world, dir);
    haptic('tap');
  }, [world]);

  // Keyboard.
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (world.state !== 'playing' && (e.key === ' ' || e.key === 'Enter')) {
        startGame(mode);
        return;
      }
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': e.preventDefault(); issueDirection('N'); break;
        case 'ArrowDown': case 's': case 'S': e.preventDefault(); issueDirection('S'); break;
        case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); issueDirection('W'); break;
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); issueDirection('E'); break;
      }
    }
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [issueDirection, mode, startGame, world.state]);

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
    if (Math.abs(dx) > Math.abs(dy)) issueDirection(dx > 0 ? 'E' : 'W');
    else issueDirection(dy > 0 ? 'S' : 'N');
  };

  const dotsEaten = world.parsed.dotCount - world.dotsLeft;

  return (
    <main className="app">
      <header className="head">
        <div>
          <h1>Maze</h1>
          <p className="muted small">
            {mode === 'daily' ? `Daily · ${todayKey().slice(5)}` : mode === 'practice' ? 'Practice (no death)' : 'Classic'}
            {' · '}{world.score} pts · {dotsEaten}/{world.parsed.dotCount} dots
            {' · '}{'♥'.repeat(Math.max(0, world.lives))}
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
        <button type="button" className={mode === 'daily' ? 'tab active' : 'tab'} onClick={() => startGame('daily')}>Daily</button>
        <button type="button" className={mode === 'practice' ? 'tab active' : 'tab'} onClick={() => startGame('practice')}>Practice</button>
      </section>

      <div
        ref={stageRef}
        className="stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        role="application"
      >
        <canvas ref={canvasRef} width={MAZE_W * 24} height={MAZE_H * 24} className="field" />

        <div className="dpad" aria-hidden>
          <button type="button" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); issueDirection('N'); }} className="dpad-up">▲</button>
          <button type="button" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); issueDirection('W'); }} className="dpad-left">◀</button>
          <button type="button" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); issueDirection('E'); }} className="dpad-right">▶</button>
          <button type="button" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); issueDirection('S'); }} className="dpad-down">▼</button>
        </div>
      </div>

      {world.state !== 'playing' ? (
        <section className="overlay" aria-live="polite">
          <p className="finish-line">
            {world.state === 'won' ? `Cleared · ${world.score} pts` : `Game over · ${world.score} pts`}
          </p>
          <p className="muted small">Best: {stored.bestScore} pts · {stored.bestDots} dots</p>
          <button type="button" className="primary" onClick={() => startGame(mode)}>Play again</button>
        </section>
      ) : null}
    </main>
  );
}

function drawWorld(canvas: HTMLCanvasElement | null, w: World): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cell = canvas.width / MAZE_W;
  ctx.fillStyle = '#0A0E27';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Walls.
  ctx.strokeStyle = '#3E4DBA';
  ctx.lineWidth = Math.max(1, cell * 0.06);
  for (let r = 0; r < MAZE_H; r++) {
    for (let c = 0; c < MAZE_W; c++) {
      const t = w.parsed.tiles[r]![c];
      if (t === '#') {
        ctx.strokeStyle = '#3E4DBA';
        ctx.strokeRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);
      } else if (t === '=') {
        ctx.strokeStyle = '#FFB37C';
        ctx.beginPath();
        ctx.moveTo(c * cell + 1, r * cell + cell / 2);
        ctx.lineTo(c * cell + cell - 1, r * cell + cell / 2);
        ctx.stroke();
      }
    }
  }

  // Dots + pellets.
  for (let r = 0; r < MAZE_H; r++) {
    for (let c = 0; c < MAZE_W; c++) {
      const t = w.tiles[r]![c];
      const cx = c * cell + cell / 2;
      const cy = r * cell + cell / 2;
      if (t === '.') {
        ctx.fillStyle = '#FFD66B';
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.08, 0, Math.PI * 2);
        ctx.fill();
      } else if (t === 'o') {
        const pulse = 0.5 + 0.5 * Math.sin(w.worldTimeMs / 200);
        ctx.fillStyle = `rgba(255, 214, 107, ${0.7 + pulse * 0.3})`;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Ghosts.
  for (const g of w.ghosts) {
    const vp = visualPosition(g);
    const cx = vp.x * cell + cell / 2;
    const cy = vp.y * cell + cell / 2;
    const colour = g.mood === 'frightened' ? '#3E4DBA'
      : g.mood === 'eaten' ? 'rgba(255,255,255,0.5)'
      : GHOST_COLOURS[g.kind];
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(cx, cy - cell * 0.05, cell * 0.42, Math.PI, 0);
    // Skirt zigzag.
    const skirtY = cy + cell * 0.38;
    ctx.lineTo(cx + cell * 0.42, skirtY);
    for (let i = 0; i < 3; i++) {
      const x = cx + cell * 0.42 - (i + 1) * (cell * 0.28);
      const y = skirtY + (i % 2 === 0 ? -cell * 0.1 : 0);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(cx - cell * 0.42, skirtY);
    ctx.closePath();
    ctx.fill();
    // Eyes.
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx - cell * 0.13, cy - cell * 0.07, cell * 0.1, 0, Math.PI * 2);
    ctx.arc(cx + cell * 0.13, cy - cell * 0.07, cell * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g.mood === 'frightened' ? '#FF6F61' : '#0A0E27';
    const eo = g.dir === 'E' ? cell * 0.03 : g.dir === 'W' ? -cell * 0.03 : 0;
    const ed = g.dir === 'S' ? cell * 0.03 : g.dir === 'N' ? -cell * 0.03 : 0;
    ctx.beginPath();
    ctx.arc(cx - cell * 0.13 + eo, cy - cell * 0.07 + ed, cell * 0.05, 0, Math.PI * 2);
    ctx.arc(cx + cell * 0.13 + eo, cy - cell * 0.07 + ed, cell * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  // Player.
  const pv = visualPosition(w.player);
  const px = pv.x * cell + cell / 2;
  const py = pv.y * cell + cell / 2;
  const mouth = 0.15 + 0.2 * (0.5 + 0.5 * Math.sin(w.worldTimeMs / 80));
  const ang = w.player.dir === 'E' ? 0 : w.player.dir === 'S' ? Math.PI / 2 : w.player.dir === 'W' ? Math.PI : -Math.PI / 2;
  ctx.fillStyle = '#FFD66B';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, cell * 0.42, ang + mouth, ang + Math.PI * 2 - mouth);
  ctx.closePath();
  ctx.fill();
}
