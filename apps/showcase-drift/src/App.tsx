import { useCallback, useEffect, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { createSoundBank, isMuted, toggleMuted } from '@shippie/juice';
import { ARCADE_SAMPLES } from '@shippie/juice/samples';
import {
  FIELD_H,
  FIELD_W,
  HYPER_COOLDOWN_MS,
  SHIP_R,
  createWorld,
  dailySeed,
  rotateShip,
  tickWorld,
  todayKey,
  tryFire,
  tryHyperspace,
  type World,
} from './engine';

const sfx = createSoundBank({
  tap: ARCADE_SAMPLES.tap,
  pop: ARCADE_SAMPLES.pop,
  bing: ARCADE_SAMPLES.bing,
  warn: ARCADE_SAMPLES.warn,
  whoosh: ARCADE_SAMPLES.whoosh,
  fail: ARCADE_SAMPLES.fail,
});

const sdk = createShippieIframeSdk({ appId: 'app_drift' });
const observations = createObservationClient(sdk);
sdk.safeEdges.declareInputRegion('all');

const STORAGE_KEY = 'shippie:drift:v1';

type Mode = 'classic' | 'daily' | 'endless';
type Skin = 'classic' | 'synth';

interface Stored {
  bestScore: number;
  bestWave: number;
  totalRuns: number;
  dailyStreak: number;
  lastDailyDate: string;
  skin: Skin;
}

function loadStored(): Stored {
  if (typeof localStorage === 'undefined') return { bestScore: 0, bestWave: 1, totalRuns: 0, dailyStreak: 0, lastDailyDate: '', skin: 'classic' };
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      bestScore: typeof v.bestScore === 'number' ? v.bestScore : 0,
      bestWave: typeof v.bestWave === 'number' ? v.bestWave : 1,
      totalRuns: typeof v.totalRuns === 'number' ? v.totalRuns : 0,
      dailyStreak: typeof v.dailyStreak === 'number' ? v.dailyStreak : 0,
      lastDailyDate: typeof v.lastDailyDate === 'string' ? v.lastDailyDate : '',
      skin: v.skin === 'synth' ? 'synth' : 'classic',
    };
  } catch {
    return { bestScore: 0, bestWave: 1, totalRuns: 0, dailyStreak: 0, lastDailyDate: '', skin: 'classic' };
  }
}
function saveStored(s: Stored) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {/**/} }

const SKINS = {
  classic: { bg: '#000', stroke: '#FFFFFF', accent: '#3CC44B', ufo: '#FFA838', bullet: '#FFFFFF' },
  synth: { bg: '#15131F', stroke: '#FF5DD8', accent: '#7AE6FF', ufo: '#FFA838', bullet: '#FF5DD8' },
};

export function App() {
  const [mode, setMode] = useState<Mode>('classic');
  const [worldRef, setWorldRef] = useState<{ world: World }>(() => ({ world: createWorld() }));
  const [stored, setStored] = useState<Stored>(() => loadStored());
  const [muted, setMutedState] = useState(() => isMuted());
  const [phase, setPhase] = useState<'menu' | 'playing' | 'gameover'>('menu');
  const [, force] = useState(0);
  const lastFrameRef = useRef(performance.now());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<{ rotate: -1 | 0 | 1; thrust: boolean; firing: boolean }>({ rotate: 0, thrust: false, firing: false });
  const lastFireRef = useRef(0);
  const world = worldRef.world;
  const skin = SKINS[stored.skin];

  useEffect(() => { saveStored(stored); }, [stored]);

  const startGame = useCallback((nextMode: Mode) => {
    setMode(nextMode);
    const seed = nextMode === 'daily' ? dailySeed() : undefined;
    setWorldRef({ world: createWorld(seed) });
    lastFrameRef.current = performance.now();
    setPhase('playing');
  }, []);

  // Game loop.
  useEffect(() => {
    if (phase !== 'playing') return;
    let raf = 0;
    const loop = (now: number) => {
      const dtMs = Math.min(40, now - lastFrameRef.current);
      lastFrameRef.current = now;
      // Apply input.
      if (inputRef.current.rotate !== 0) {
        rotateShip(world, dtMs / 1000, inputRef.current.rotate as -1 | 1);
      }
      world.ship.thrusting = inputRef.current.thrust;
      // Continuous fire.
      if (inputRef.current.firing && now - lastFireRef.current >= 180) {
        if (tryFire(world)) {
          sfx.play('tap', { volume: 0.3, pitch: 1.4 });
          lastFireRef.current = now;
        }
      }
      tickWorld(world, dtMs);
      drawWorld(canvasRef.current, world, skin);
      force((n) => n + 1);
      if (world.state === 'over') {
        setPhase('gameover');
        sfx.play('fail');
        haptic('error');
        observations.emit({
          kind: 'game.completed',
          game: 'drift',
          result: `${mode} · wave ${world.wave} · ${world.score} pts`,
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
            bestWave: Math.max(s.bestWave, world.wave),
            dailyStreak,
            lastDailyDate: mode === 'daily' ? today : s.lastDailyDate,
          };
        });
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, world, mode, skin]);

  // Keyboard.
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (phase === 'menu' && (e.key === ' ' || e.key === 'Enter')) { startGame(mode); return; }
      if (phase === 'gameover' && (e.key === ' ' || e.key === 'Enter')) { startGame(mode); return; }
      if (phase !== 'playing') return;
      switch (e.key) {
        case 'a': case 'A': case 'ArrowLeft': inputRef.current.rotate = -1; e.preventDefault(); break;
        case 'd': case 'D': case 'ArrowRight': inputRef.current.rotate = 1; e.preventDefault(); break;
        case 'w': case 'W': case 'ArrowUp': inputRef.current.thrust = true; e.preventDefault(); break;
        case ' ': inputRef.current.firing = true; e.preventDefault(); break;
        case 'h': case 'H': if (tryHyperspace(world)) { sfx.play('whoosh'); haptic('success'); } break;
      }
    }
    function up(e: KeyboardEvent) {
      switch (e.key) {
        case 'a': case 'A': case 'ArrowLeft':
        case 'd': case 'D': case 'ArrowRight':
          inputRef.current.rotate = 0; break;
        case 'w': case 'W': case 'ArrowUp': inputRef.current.thrust = false; break;
        case ' ': inputRef.current.firing = false; break;
      }
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [phase, mode, startGame, world]);

  return (
    <main className="app" style={{ background: skin.bg, color: skin.accent }}>
      <header className="head">
        <div>
          <h1 style={{ color: skin.stroke }}>Drift</h1>
          <p className="muted small" style={{ color: skin.accent }}>
            {mode === 'daily' ? `Daily · ${todayKey().slice(5)}` : mode === 'endless' ? 'Endless' : 'Classic'}
            {' · '}Wave {world.wave} · {world.score} pts · {'♥'.repeat(Math.max(0, world.lives))}
            {mode === 'daily' && stored.dailyStreak > 0 ? <span className="streak"> · 🔥 {stored.dailyStreak}</span> : null}
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="ghost" onClick={() => setStored((s) => ({ ...s, skin: s.skin === 'classic' ? 'synth' : 'classic' }))} aria-label="Skin">
            {stored.skin === 'classic' ? '◐' : '◑'}
          </button>
          <button type="button" className="ghost" onClick={() => setMutedState(toggleMuted())} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      <div className="stage" style={{ borderColor: skin.accent }}>
        <canvas ref={canvasRef} width={FIELD_W * 2} height={FIELD_H * 2} className="field" />
      </div>

      <section className="touch-row" aria-hidden>
        <button type="button" className="touch-btn rotate"
          onPointerDown={() => { inputRef.current.rotate = -1; }}
          onPointerUp={() => { inputRef.current.rotate = 0; }}
          onPointerCancel={() => { inputRef.current.rotate = 0; }}
        >↺</button>
        <button type="button" className="touch-btn thrust"
          onPointerDown={() => { inputRef.current.thrust = true; }}
          onPointerUp={() => { inputRef.current.thrust = false; }}
          onPointerCancel={() => { inputRef.current.thrust = false; }}
          style={{ background: skin.accent, color: skin.bg, borderColor: skin.accent }}
        >▲ THRUST</button>
        <button type="button" className="touch-btn fire"
          onPointerDown={() => { inputRef.current.firing = true; }}
          onPointerUp={() => { inputRef.current.firing = false; }}
          onPointerCancel={() => { inputRef.current.firing = false; }}
          style={{ background: skin.stroke, color: skin.bg, borderColor: skin.stroke }}
        >FIRE</button>
        <button type="button" className="touch-btn rotate"
          onPointerDown={() => { inputRef.current.rotate = 1; }}
          onPointerUp={() => { inputRef.current.rotate = 0; }}
          onPointerCancel={() => { inputRef.current.rotate = 0; }}
        >↻</button>
        <button type="button" className="touch-btn hyper"
          onClick={() => {
            if (tryHyperspace(world)) { sfx.play('whoosh'); haptic('success'); }
          }}
          aria-label="Hyperspace"
        >⚡</button>
      </section>

      {phase !== 'playing' ? (
        <section className="overlay" style={{ borderColor: skin.accent }}>
          <p className="finish-line" style={{ color: skin.accent }}>
            {phase === 'gameover' ? `Game over · wave ${world.wave} · ${world.score} pts` : 'Drift'}
          </p>
          <p className="muted small">Best: {stored.bestScore} pts · wave {stored.bestWave}</p>
          <div className="mode-row">
            <button type="button" className={mode === 'classic' ? 'tab active' : 'tab'} onClick={() => setMode('classic')}>Classic</button>
            <button type="button" className={mode === 'daily' ? 'tab active' : 'tab'} onClick={() => setMode('daily')}>Daily</button>
            <button type="button" className={mode === 'endless' ? 'tab active' : 'tab'} onClick={() => setMode('endless')}>Endless</button>
          </div>
          <button type="button" className="primary" onClick={() => startGame(mode)} style={{ background: skin.accent, color: skin.bg, borderColor: skin.accent }}>
            {phase === 'gameover' ? 'Play again' : 'Start'}
          </button>
        </section>
      ) : null}
    </main>
  );
}

function drawWorld(canvas: HTMLCanvasElement | null, w: World, skin: typeof SKINS['classic']): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const sx = canvas.width / FIELD_W;
  const sy = canvas.height / FIELD_H;
  ctx.fillStyle = skin.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Stars / grid for synth skin.
  if (skin === SKINS.synth) {
    ctx.strokeStyle = 'rgba(126, 91, 150, 0.16)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const y = (canvas.height / 8) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  } else {
    // Stars for classic.
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 40; i++) {
      const x = ((i * 73) % FIELD_W) * sx;
      const y = ((i * 137) % FIELD_H) * sy;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Asteroids.
  ctx.strokeStyle = skin.stroke;
  ctx.lineWidth = 1.5;
  for (const a of w.asteroids) {
    ctx.save();
    ctx.translate(a.x * sx, a.y * sy);
    ctx.rotate(a.rot);
    ctx.beginPath();
    for (let i = 0; i < a.hull.length; i++) {
      const [vx, vy] = a.hull[i]!;
      if (i === 0) ctx.moveTo(vx * sx, vy * sy);
      else ctx.lineTo(vx * sx, vy * sy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // UFO.
  if (w.ufo) {
    ctx.fillStyle = skin.ufo;
    ctx.beginPath();
    ctx.ellipse(w.ufo.x * sx, w.ufo.y * sy, 14 * sx, 6 * sy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = skin.stroke;
    ctx.beginPath();
    ctx.ellipse(w.ufo.x * sx, w.ufo.y * sy - 4 * sy, 7 * sx, 3 * sy, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Bullets.
  ctx.fillStyle = skin.bullet;
  for (const b of w.bullets) {
    ctx.fillRect((b.x - 1) * sx, (b.y - 1) * sy, 2 * sx, 2 * sy);
  }

  // Ship.
  const blink = w.worldTimeMs < w.ship.invulnUntilMs;
  if (!blink || Math.floor(w.worldTimeMs / 100) % 2 === 0) {
    ctx.save();
    ctx.translate(w.ship.x * sx, w.ship.y * sy);
    ctx.rotate(w.ship.heading);
    ctx.strokeStyle = skin.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -SHIP_R * sy);
    ctx.lineTo(SHIP_R * 0.7 * sx, SHIP_R * sy);
    ctx.lineTo(0, SHIP_R * 0.5 * sy);
    ctx.lineTo(-SHIP_R * 0.7 * sx, SHIP_R * sy);
    ctx.closePath();
    ctx.stroke();
    if (w.ship.thrusting) {
      ctx.strokeStyle = skin.ufo;
      ctx.beginPath();
      ctx.moveTo(-2 * sx, SHIP_R * 0.6 * sy);
      ctx.lineTo(0, (SHIP_R + 6) * sy);
      ctx.lineTo(2 * sx, SHIP_R * 0.6 * sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Hyperspace cooldown bar.
  const hyperReady = w.worldTimeMs >= w.ship.hyperReadyAt;
  if (!hyperReady) {
    const elapsed = HYPER_COOLDOWN_MS - (w.ship.hyperReadyAt - w.worldTimeMs);
    const pct = Math.max(0, Math.min(1, elapsed / HYPER_COOLDOWN_MS));
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(8, canvas.height - 12, canvas.width - 16, 4);
    ctx.fillStyle = skin.accent;
    ctx.fillRect(8, canvas.height - 12, (canvas.width - 16) * pct, 4);
  }
}
