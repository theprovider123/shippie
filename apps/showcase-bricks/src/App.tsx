import { useCallback, useEffect, useRef, useState } from 'react';
import { share, shareLines } from '@shippie/arcade-kit';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { createSoundBank, isMuted, toggleMuted } from '@shippie/juice';
import { ARCADE_SAMPLES } from '@shippie/juice/samples';
import {
  BALL_R,
  BRICK_H,
  BRICK_W,
  FIELD_H,
  FIELD_W,
  PADDLE_H,
  PADDLE_Y,
  aliveBrickCount,
  createWorld,
  dailySeed,
  launchBall,
  movePaddleTo,
  tickWorld,
  todayKey,
  type World,
} from './engine';

const sfx = createSoundBank({
  tap: ARCADE_SAMPLES.tap,
  pop: ARCADE_SAMPLES.pop,
  bing: ARCADE_SAMPLES.bing,
  warn: ARCADE_SAMPLES.warn,
  success: ARCADE_SAMPLES.success,
  fail: ARCADE_SAMPLES.fail,
  levelUp: ARCADE_SAMPLES.levelUp,
});

const sdk = createShippieIframeSdk({ appId: 'app_bricks' });
const observations = createObservationClient(sdk);
sdk.safeEdges.declareInputRegion('all');

const STORAGE_KEY = 'shippie:bricks:v1';

type Mode = 'classic' | 'daily' | 'endless';

interface Stored {
  bestScore: number;
  bestLevel: number;
  totalRuns: number;
  dailyStreak: number;
  lastDailyDate: string;
}

function loadStored(): Stored {
  if (typeof localStorage === 'undefined') return { bestScore: 0, bestLevel: 1, totalRuns: 0, dailyStreak: 0, lastDailyDate: '' };
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      bestScore: typeof v.bestScore === 'number' ? v.bestScore : 0,
      bestLevel: typeof v.bestLevel === 'number' ? v.bestLevel : 1,
      totalRuns: typeof v.totalRuns === 'number' ? v.totalRuns : 0,
      dailyStreak: typeof v.dailyStreak === 'number' ? v.dailyStreak : 0,
      lastDailyDate: typeof v.lastDailyDate === 'string' ? v.lastDailyDate : '',
    };
  } catch {
    return { bestScore: 0, bestLevel: 1, totalRuns: 0, dailyStreak: 0, lastDailyDate: '' };
  }
}
function saveStored(s: Stored) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {/**/} }

export function App() {
  const [mode, setMode] = useState<Mode>('classic');
  const [worldRef, setWorldRef] = useState<{ world: World }>(() => ({ world: createWorld(1) }));
  const [stored, setStored] = useState<Stored>(() => loadStored());
  const [muted, setMutedState] = useState(() => isMuted());
  const [, force] = useState(0);
  const [resultRecorded, setResultRecorded] = useState(false);
  const [shared, setShared] = useState(false);
  const lastFrameRef = useRef(performance.now());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const world = worldRef.world;

  useEffect(() => { saveStored(stored); }, [stored]);

  const startGame = useCallback((nextMode: Mode, level = 1) => {
    setMode(nextMode);
    const seed = nextMode === 'daily' ? dailySeed() : undefined;
    setWorldRef({ world: createWorld(level, seed) });
    lastFrameRef.current = performance.now();
    setResultRecorded(false);
    setShared(false);
  }, []);

  // Game loop.
  useEffect(() => {
    if (world.state !== 'playing') return;
    let raf = 0;
    let prevBricks = aliveBrickCount(world);
    const loop = (now: number) => {
      const dtMs = Math.min(40, now - lastFrameRef.current);
      lastFrameRef.current = now;
      tickWorld(world, dtMs);
      const nowBricks = aliveBrickCount(world);
      if (nowBricks < prevBricks) {
        sfx.play('pop', { pitch: 0.9 + Math.random() * 0.4, volume: 0.5 });
      }
      prevBricks = nowBricks;
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
      // Auto-advance to next level after a brief pause (classic + daily).
      window.setTimeout(() => {
        const seed = mode === 'daily' ? dailySeed() + world.level + 1 : undefined;
        setWorldRef({ world: { ...createWorld(world.level + 1, seed), score: world.score, lives: world.lives } });
        setResultRecorded(false);
      }, 1200);
    } else if (world.state === 'lost') {
      sfx.play('fail');
      haptic('error');
      observations.emit({
        kind: 'game.completed',
        game: 'bricks',
        result: `${mode} · lvl ${world.level} · ${world.score} pts`,
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
          bestScore: Math.max(s.bestScore, world.score),
          bestLevel: Math.max(s.bestLevel, world.level),
          dailyStreak,
          lastDailyDate: mode === 'daily' ? today : s.lastDailyDate,
        };
      });
    }
  }, [world.state, world.score, world.level, world.lives, mode, resultRecorded]);

  // Touch / mouse paddle control.
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (world.state !== 'playing') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xRatio = (e.clientX - rect.left) / rect.width;
    movePaddleTo(world, xRatio * FIELD_W);
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (world.state !== 'playing') return;
    if ((e.target as HTMLElement | null)?.closest('button')) return;
    onPointerMove(e);
    launchBall(world);
    sfx.play('tap', { pitch: 1.3 });
  };

  // Keyboard fallback.
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (world.state === 'lost' && (e.key === ' ' || e.key === 'Enter')) {
        startGame(mode);
        return;
      }
      if (world.state !== 'playing') return;
      const step = 30;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') movePaddleTo(world, world.paddle.x - step);
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') movePaddleTo(world, world.paddle.x + step);
      else if (e.key === ' ') { e.preventDefault(); launchBall(world); }
    }
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [world, mode, startGame]);

  return (
    <main className="app">
      <header className="head">
        <div>
          <h1 className="title-hero">Bricks</h1>
          <p className="eyebrow">
            {mode === 'daily' ? `Daily · ${todayKey().slice(5)}` : mode === 'endless' ? 'Endless' : 'Classic'}
            <span className="game-code"> · Lvl <span className="score-numeric">{world.level}</span> · <span className="score-numeric">{world.score}</span> pts · {'♥'.repeat(Math.max(0, world.lives))}</span>
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

      <section className="mode-row" role="tablist" aria-label="Game mode">
        <button type="button" role="tab" aria-selected={mode === 'classic'} className={mode === 'classic' ? 'tab active' : 'tab'} onClick={() => startGame('classic')}>Classic</button>
        <button type="button" role="tab" aria-selected={mode === 'daily'} className={mode === 'daily' ? 'tab active' : 'tab'} onClick={() => startGame('daily')}>Daily</button>
        <button type="button" role="tab" aria-selected={mode === 'endless'} className={mode === 'endless' ? 'tab active' : 'tab'} onClick={() => startGame('endless')}>Endless</button>
      </section>

      <div
        ref={stageRef}
        className="stage"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
      >
        <canvas ref={canvasRef} width={FIELD_W * 2} height={FIELD_H * 2} className="field" />
        <p className="hint">Tap or drag the paddle. Tap again to launch.</p>
      </div>

      {world.state === 'lost' ? (
        <section className="overlay" aria-live="polite">
          <p className="finish-line">Game over · {world.score} pts · lvl {world.level}</p>
          <p className="muted small">Best: {stored.bestScore} pts · lvl {stored.bestLevel}</p>
          {mode === 'daily' ? (
            <button
              type="button"
              className="primary"
              onClick={async () => {
                const ok = await share(
                  shareLines([
                    `Bricks daily ${todayKey()} — ${world.score} pts · lvl ${world.level}${stored.dailyStreak > 0 ? ` · 🔥 ${stored.dailyStreak}` : ''}`,
                    'shippie.app/run/bricks/',
                  ]),
                );
                if (ok) setShared(true);
              }}
            >
              {shared ? 'Shared ✓' : 'Share result'}
            </button>
          ) : null}
          <button type="button" className={mode === 'daily' ? 'tab' : 'primary'} onClick={() => startGame(mode)}>Play again</button>
        </section>
      ) : null}
    </main>
  );
}

function drawWorld(canvas: HTMLCanvasElement | null, w: World): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const sx = canvas.width / FIELD_W;
  const sy = canvas.height / FIELD_H;
  ctx.fillStyle = '#15131F';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Bricks.
  for (const b of w.bricks) {
    if (b.hp <= 0) continue;
    ctx.fillStyle = b.colour;
    ctx.fillRect(b.x * sx, b.y * sy, BRICK_W * sx, BRICK_H * sy);
    // Pixel-art notch on top.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(b.x * sx, b.y * sy, BRICK_W * sx, 2 * sy);
    // HP indicator.
    if (b.maxHp > 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(b.x * sx + 2, (b.y + BRICK_H - 4) * sy, (BRICK_W - 4) * sx * (b.hp / b.maxHp), 2 * sy);
    }
  }

  // Paddle.
  ctx.fillStyle = '#F4B860';
  const px = (w.paddle.x - w.paddle.w / 2) * sx;
  const py = PADDLE_Y * sy;
  ctx.fillRect(px, py, w.paddle.w * sx, PADDLE_H * sy);

  // Balls.
  ctx.fillStyle = '#FFFFFF';
  for (const b of w.balls) {
    if (b.x < 0) continue;
    ctx.beginPath();
    ctx.arc(b.x * sx, b.y * sy, BALL_R * sx, 0, Math.PI * 2);
    ctx.fill();
  }

  // Power-ups.
  for (const p of w.powerups) {
    ctx.fillStyle = p.kind === 'wide' ? '#7AC4E8' : p.kind === 'sticky' ? '#7E5B96' : p.kind === 'multi' ? '#F4B860' : '#E84A2D';
    ctx.fillRect((p.x - 9) * sx, p.y * sy, 18 * sx, 8 * sy);
    ctx.fillStyle = '#15131F';
    ctx.font = `bold ${10 * sx}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.kind === 'wide' ? 'W' : p.kind === 'sticky' ? 'S' : p.kind === 'multi' ? 'M' : 'L', p.x * sx, (p.y + 4) * sy);
  }

  // Lasers.
  ctx.fillStyle = '#E84A2D';
  for (const l of w.lasers) {
    ctx.fillRect((l.x - 1) * sx, l.y * sy, 2 * sx, 10 * sy);
  }

  // Win banner.
  if (w.state === 'won') {
    ctx.fillStyle = 'rgba(79, 164, 135, 0.92)';
    ctx.fillRect(0, canvas.height / 2 - 30 * sy, canvas.width, 60 * sy);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${22 * sx}px Fraunces, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Level ${w.level} cleared`, canvas.width / 2, canvas.height / 2);
  }
}
