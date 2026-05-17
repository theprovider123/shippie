import { useCallback, useEffect, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { createSoundBank, isMuted, toggleMuted, Particles } from '@shippie/juice';
import { ARCADE_SAMPLES } from '@shippie/juice/samples';
import {
  BUNKER_H,
  BUNKER_PIX,
  BUNKER_W,
  COLS,
  ENEMY_H,
  ENEMY_W,
  FIELD_H,
  FIELD_W,
  PLAYER_H,
  PLAYER_W,
  PLAYER_Y,
  ROWS,
  aliveEnemyCount,
  createWorld,
  fire,
  movePlayer,
  tickWorld,
  type ShipKind,
  type World,
  type Enemy,
} from './engine';

const sfx = createSoundBank({
  tap: ARCADE_SAMPLES.tap,
  pop: ARCADE_SAMPLES.pop,
  bing: ARCADE_SAMPLES.bing,
  warn: ARCADE_SAMPLES.warn,
  success: ARCADE_SAMPLES.success,
  fail: ARCADE_SAMPLES.fail,
  levelUp: ARCADE_SAMPLES.levelUp,
  whoosh: ARCADE_SAMPLES.whoosh,
});

const sdk = createShippieIframeSdk({ appId: 'app_invaders' });
sdk.safeEdges.declareInputRegion('bottom');
const observations = createObservationClient(sdk);

const STORAGE_KEY = 'shippie:invaders:v1';

interface Stored {
  bestScore: number;
  bestWave: number;
  totalRuns: number;
  shipKind: ShipKind;
  skin: 'classic' | 'synth';
}

function loadStored(): Stored {
  if (typeof localStorage === 'undefined') return { bestScore: 0, bestWave: 1, totalRuns: 0, shipKind: 'laser', skin: 'classic' };
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      bestScore: typeof v.bestScore === 'number' ? v.bestScore : 0,
      bestWave: typeof v.bestWave === 'number' ? v.bestWave : 1,
      totalRuns: typeof v.totalRuns === 'number' ? v.totalRuns : 0,
      shipKind: v.shipKind === 'spread' || v.shipKind === 'missile' ? v.shipKind : 'laser',
      skin: v.skin === 'synth' ? 'synth' : 'classic',
    };
  } catch {
    return { bestScore: 0, bestWave: 1, totalRuns: 0, shipKind: 'laser', skin: 'classic' };
  }
}
function saveStored(s: Stored) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {/**/} }

const SKINS = {
  classic: { bg: '#000', accent: '#3CC44B', enemy: '#FFFFFF', bullet: '#FFFFFF', bunker: '#3CC44B', boss: '#E84A2D', text: '#3CC44B' },
  synth: { bg: '#15131F', accent: '#FF5DD8', enemy: '#7AE6FF', bullet: '#FF5DD8', bunker: '#7E5B96', boss: '#FFA838', text: '#FF5DD8' },
};

export function App() {
  const [stored, setStored] = useState<Stored>(() => loadStored());
  const [phase, setPhase] = useState<'menu' | 'playing' | 'gameover' | 'paused'>('menu');
  const [, force] = useState(0);
  const [muted, setMutedState] = useState(() => isMuted());
  const worldRef = useRef<World | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particles | null>(null);
  const lastFrameRef = useRef(performance.now());
  const inputRef = useRef<{ left: boolean; right: boolean; fire: boolean }>({ left: false, right: false, fire: false });
  const lastFireRef = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const skin = SKINS[stored.skin];

  useEffect(() => { saveStored(stored); }, [stored]);

  // Mount particles overlay.
  useEffect(() => {
    const c = particlesCanvasRef.current;
    if (!c) return;
    const fx = new Particles(c);
    particlesRef.current = fx;
    const resize = () => fx.resize();
    resize();
    window.addEventListener('resize', resize);
    fx.start();
    return () => { window.removeEventListener('resize', resize); fx.stop(); particlesRef.current = null; };
  }, []);

  const startGame = useCallback(() => {
    worldRef.current = createWorld(stored.shipKind);
    lastFrameRef.current = performance.now();
    setPhase('playing');
  }, [stored.shipKind]);

  // Game loop.
  useEffect(() => {
    if (phase !== 'playing') return;
    let raf = 0;
    let prevAlive = worldRef.current ? aliveEnemyCount(worldRef.current) : 0;
    const loop = (now: number) => {
      const w = worldRef.current;
      if (!w) return;
      const dtMs = Math.min(40, now - lastFrameRef.current);
      lastFrameRef.current = now;

      // Apply input → player velocity.
      const speed = 220;
      let vx = 0;
      if (inputRef.current.left) vx -= speed;
      if (inputRef.current.right) vx += speed;
      w.player.vx = vx;

      // Continuous fire if held: cooldown depends on rapid power-up.
      if (inputRef.current.fire) {
        const cd = w.nowMs < w.rapidUntilMs ? 80 : 240;
        if (now - lastFireRef.current >= cd) {
          fire(w);
          sfx.play('tap', { pitch: 1.4, volume: 0.4 });
          lastFireRef.current = now;
        }
      }

      tickWorld(w, dtMs);

      // Audio + particle reaction to enemy deaths.
      const aliveNow = aliveEnemyCount(w);
      if (aliveNow < prevAlive) {
        const deaths = prevAlive - aliveNow;
        sfx.play('pop', { pitch: 0.9 + Math.random() * 0.6 });
        // Burst particles at canvas-mapped centre of grid: approximate.
        const fx = particlesRef.current;
        const canvas = canvasRef.current;
        if (fx && canvas) {
          const rect = canvas.getBoundingClientRect();
          for (let i = 0; i < deaths; i++) {
            // Sample a recently-killed cell — random nearby spot.
            const x = rect.left + (Math.random() * rect.width);
            const y = rect.top + (rect.height * 0.3) + Math.random() * rect.height * 0.3;
            const pcanvas = particlesCanvasRef.current!;
            const prect = pcanvas.getBoundingClientRect();
            fx.emit({
              x: x - prect.left,
              y: y - prect.top,
              count: 6,
              colour: skin.enemy,
              kind: 'burst',
              speed: 1.0,
              lifetimeMs: 500,
            });
          }
        }
      }
      prevAlive = aliveNow;

      // Audio shuffle escalates as wave thins (NES-style).
      // Simple: every 20 ticks, play a low blip whose pitch scales.
      // (Implemented by rate of play of 'whoosh' but kept low to not annoy.)

      // End check.
      if (w.state === 'lost' || w.state === 'won') {
        setPhase('gameover');
        sfx.play('fail');
        haptic('error');
        observations.emit({
          kind: 'game.completed',
          game: 'invaders',
          result: `${w.state} wave ${w.wave} · ${w.score} pts`,
          at: new Date().toISOString(),
        });
        setStored((s) => ({
          ...s,
          totalRuns: s.totalRuns + 1,
          bestScore: Math.max(s.bestScore, w.score),
          bestWave: Math.max(s.bestWave, w.wave),
        }));
        return;
      }

      drawWorld(canvasRef.current, w, skin);
      force((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, skin]);

  // Keyboard.
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (phase === 'menu' && (e.key === ' ' || e.key === 'Enter')) { startGame(); return; }
      if (phase === 'gameover' && (e.key === ' ' || e.key === 'Enter')) { startGame(); return; }
      if (phase !== 'playing') return;
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A': inputRef.current.left = true; e.preventDefault(); break;
        case 'ArrowRight': case 'd': case 'D': inputRef.current.right = true; e.preventDefault(); break;
        case ' ': inputRef.current.fire = true; e.preventDefault(); break;
        case 'p': case 'P': setPhase('paused'); break;
      }
    }
    function up(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A': inputRef.current.left = false; break;
        case 'ArrowRight': case 'd': case 'D': inputRef.current.right = false; break;
        case ' ': inputRef.current.fire = false; break;
      }
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [phase, startGame]);

  // Touch input — drag to move ship, tap upper-half to fire.
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const w = worldRef.current;
    if (!w || phase !== 'playing') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width * FIELD_W;
    w.player.x = Math.max(PLAYER_W / 2, Math.min(FIELD_W - PLAYER_W / 2, x));
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== 'playing') return;
    inputRef.current.fire = true;
    onPointerMove(e);
  };
  const onPointerUp = () => {
    inputRef.current.fire = false;
  };

  const w = worldRef.current;
  const shielded = w ? w.nowMs < w.shieldUntilMs : false;
  const rapid = w ? w.nowMs < w.rapidUntilMs : false;

  return (
    <main className="app" style={{ background: skin.bg, color: skin.text }} ref={containerRef}>
      <header className="head">
        <div>
          <h1 style={{ color: skin.accent }}>Invaders</h1>
          <p className="muted small" style={{ color: skin.text }}>
            {w ? `Wave ${w.wave} · ${w.score} pts · ${'♥'.repeat(Math.max(0, w.lives))}` : `Best ${stored.bestScore} pts · wave ${stored.bestWave}`}
            {rapid ? <span className="badge">RAPID</span> : null}
            {shielded ? <span className="badge">SHIELD</span> : null}
            {w && w.nowMs < w.doubleUntilMs ? <span className="badge">DOUBLE</span> : null}
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

      <div
        className="stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ borderColor: skin.accent, transform: w && w.shake > 0 ? `translate(${(Math.random() - 0.5) * 4 * w.shake}px, ${(Math.random() - 0.5) * 4 * w.shake}px)` : undefined }}
      >
        <canvas ref={canvasRef} width={FIELD_W * 2} height={FIELD_H * 2} className="field" />
        <canvas ref={particlesCanvasRef} className="fx-canvas" aria-hidden />
      </div>

      <section className="touch-row">
        <button type="button" className="touch-btn"
          onPointerDown={() => inputRef.current.left = true}
          onPointerUp={() => inputRef.current.left = false}
          onPointerCancel={() => inputRef.current.left = false}
        >◀</button>
        <button type="button" className="touch-btn fire"
          onPointerDown={() => inputRef.current.fire = true}
          onPointerUp={() => inputRef.current.fire = false}
          onPointerCancel={() => inputRef.current.fire = false}
          style={{ background: skin.accent, color: skin.bg, borderColor: skin.accent }}
        >FIRE</button>
        <button type="button" className="touch-btn"
          onPointerDown={() => inputRef.current.right = true}
          onPointerUp={() => inputRef.current.right = false}
          onPointerCancel={() => inputRef.current.right = false}
        >▶</button>
      </section>

      {phase === 'menu' || phase === 'gameover' ? (
        <section className="overlay" style={{ background: skin.bg, borderColor: skin.accent }}>
          <p className="finish-line" style={{ color: skin.accent }}>
            {phase === 'gameover' ? `Game over · ${w?.score ?? 0} pts` : 'Invaders'}
          </p>
          <p className="muted small">Best: {stored.bestScore} pts · wave {stored.bestWave}</p>
          <p className="muted small">Pick a ship</p>
          <div className="ship-row">
            {(['laser', 'spread', 'missile'] as ShipKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`ship-tile${stored.shipKind === k ? ' selected' : ''}`}
                onClick={() => setStored((s) => ({ ...s, shipKind: k }))}
                style={{ borderColor: stored.shipKind === k ? skin.accent : undefined }}
              >
                <ShipIcon kind={k} colour={skin.accent} />
                <span style={{ textTransform: 'capitalize' }}>{k}</span>
                <span className="ship-desc">
                  {k === 'laser' ? 'Fast single shot' : k === 'spread' ? '3 bullets per fire' : 'Slow, heavy hits'}
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="primary" onClick={startGame} style={{ background: skin.accent, color: skin.bg, borderColor: skin.accent }}>
            {phase === 'gameover' ? 'Play again' : 'Start'}
          </button>
        </section>
      ) : null}

      {phase === 'paused' ? (
        <section className="overlay" style={{ background: skin.bg, borderColor: skin.accent }}>
          <p className="finish-line" style={{ color: skin.accent }}>Paused</p>
          <button type="button" className="primary" onClick={() => { lastFrameRef.current = performance.now(); setPhase('playing'); }} style={{ background: skin.accent, color: skin.bg, borderColor: skin.accent }}>Resume</button>
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

  // Stars / grid lines for synth skin.
  if (skin === SKINS.synth) {
    ctx.strokeStyle = 'rgba(126, 91, 150, 0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const y = (canvas.height / 7) * (i + 1);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  // Bunkers.
  for (const b of w.bunkers) {
    const cellW = (BUNKER_W / BUNKER_PIX) * sx;
    const cellH = (BUNKER_H / BUNKER_PIX) * sy;
    ctx.fillStyle = skin.bunker;
    for (let r = 0; r < BUNKER_PIX; r++) {
      for (let c = 0; c < BUNKER_PIX; c++) {
        if (b.cells[r]![c] === 1) {
          ctx.fillRect(b.x * sx + c * cellW, b.y * sy + r * cellH, cellW + 0.5, cellH + 0.5);
        }
      }
    }
  }

  // Enemies.
  ctx.fillStyle = skin.enemy;
  for (const e of w.enemies) {
    if (!e.alive) continue;
    drawEnemy(ctx, e, sx, sy, skin.enemy);
  }

  // Boss.
  if (w.boss) {
    ctx.fillStyle = skin.boss;
    const bx = w.boss.x * sx;
    const by = w.boss.y * sy;
    ctx.beginPath();
    ctx.ellipse(bx, by, 26 * sx, 14 * sy, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eye stripe.
    ctx.fillStyle = skin.bg;
    ctx.fillRect(bx - 16 * sx, by - 4 * sy, 32 * sx, 4 * sy);
    // HP bar.
    const barW = 60 * sx;
    const barH = 6 * sy;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(bx - barW / 2, by - 22 * sy, barW, barH);
    ctx.fillStyle = skin.boss;
    ctx.fillRect(bx - barW / 2, by - 22 * sy, barW * (w.boss.hp / w.boss.maxHp), barH);
  }

  // UFO.
  if (w.ufo) {
    ctx.fillStyle = skin.boss;
    ctx.beginPath();
    ctx.ellipse(w.ufo.x * sx, w.ufo.y * sy, 12 * sx, 5 * sy, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bullets.
  for (const b of w.bullets) {
    ctx.fillStyle = b.side === 'player' ? skin.bullet : skin.boss;
    ctx.fillRect((b.x - 1.5) * sx, (b.y - 4) * sy, 3 * sx, 8 * sy);
  }

  // Power-ups.
  for (const p of w.powerups) {
    ctx.fillStyle = p.kind === 'rapid' ? '#F4B860' : p.kind === 'shield' ? '#4FA487' : '#7AE6FF';
    ctx.beginPath();
    ctx.arc(p.x * sx, p.y * sy, 6 * sx, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.bg;
    ctx.font = `bold ${10 * sx}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.kind === 'rapid' ? 'R' : p.kind === 'shield' ? 'S' : 'D', p.x * sx, p.y * sy);
  }

  // Player ship.
  const shielded = w.nowMs < w.shieldUntilMs;
  ctx.fillStyle = shielded ? skin.accent : skin.accent;
  const px = w.player.x * sx;
  const py = PLAYER_Y * sy;
  ctx.beginPath();
  ctx.moveTo(px, py - 8 * sy);
  ctx.lineTo(px - 14 * sx, py + 4 * sy);
  ctx.lineTo(px + 14 * sx, py + 4 * sy);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(px - 4 * sx, py - 12 * sy, 8 * sx, 6 * sy);
  if (shielded) {
    ctx.strokeStyle = skin.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 22 * sx, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Wave-clear banner.
  if (w.waveClearMs > 0 && !w.boss && w.enemies.length > 0) {
    ctx.fillStyle = skin.accent;
    ctx.font = `bold ${24 * sx}px Fraunces, serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`Wave ${w.wave} clear`, canvas.width / 2, canvas.height / 2);
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, sx: number, sy: number, colour: string): void {
  ctx.save();
  ctx.fillStyle = colour;
  const x = e.x * sx;
  const y = e.y * sy;
  const w = ENEMY_W * sx;
  const h = ENEMY_H * sy;
  if (e.kind === 'squid') {
    // Tall squid: two big eyes, two tentacles down.
    ctx.fillRect(x + 2, y + 1, w - 4, 4);
    ctx.fillRect(x, y + 5, w, 5);
    ctx.fillRect(x + 2, y + 10, 4, 4);
    ctx.fillRect(x + w - 6, y + 10, 4, 4);
  } else if (e.kind === 'crab') {
    ctx.fillRect(x + 4, y + 0, w - 8, 4);
    ctx.fillRect(x, y + 4, w, 6);
    ctx.fillRect(x - 1, y + 10, 4, 3);
    ctx.fillRect(x + w - 3, y + 10, 4, 3);
  } else {
    // Octopus — wider body, spikes at bottom.
    ctx.fillRect(x + 4, y + 1, w - 8, 5);
    ctx.fillRect(x + 1, y + 6, w - 2, 4);
    ctx.fillRect(x, y + 10, 3, 3);
    ctx.fillRect(x + w / 2 - 1.5, y + 10, 3, 3);
    ctx.fillRect(x + w - 3, y + 10, 3, 3);
  }
  ctx.restore();
}

function ShipIcon({ kind, colour }: { kind: ShipKind; colour: string }) {
  return (
    <svg viewBox="0 0 28 22" width="32" height="24" aria-hidden>
      <polygon points="14,1 26,18 2,18" fill={colour} />
      {kind === 'spread' ? <>
        <rect x="2" y="6" width="3" height="6" fill={colour} />
        <rect x="23" y="6" width="3" height="6" fill={colour} />
      </> : null}
      {kind === 'missile' ? <rect x="11" y="1" width="6" height="6" fill={colour} /> : null}
    </svg>
  );
}
