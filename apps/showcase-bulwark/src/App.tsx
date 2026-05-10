import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { createSoundBank, isMuted, toggleMuted, Particles } from '@shippie/juice';
import { ARCADE_SAMPLES } from '@shippie/juice/samples';
import { useTutorial } from '@shippie/juice/react';
import {
  GRID_W,
  GRID_H,
  TOWER_SPECS,
  TOWER_TYPES,
  createWorld,
  enemyPositions,
  placeTower,
  sellTower,
  startWave,
  tickWorld,
  upgradeTower,
  type TowerType,
  type World,
} from './td';
import { exitFullscreen, isFullscreen, requestFullscreen } from './fullscreen';

const sfx = createSoundBank({
  tap: ARCADE_SAMPLES.tap,
  pop: ARCADE_SAMPLES.pop,
  whoosh: ARCADE_SAMPLES.whoosh,
  bing: ARCADE_SAMPLES.bing,
  warn: ARCADE_SAMPLES.warn,
  success: ARCADE_SAMPLES.success,
  fail: ARCADE_SAMPLES.fail,
  levelUp: ARCADE_SAMPLES.levelUp,
});

const TUTORIAL_STEPS = [
  { title: 'Pick a tower', body: 'Tap one of the six tower chips below the header. Cheaper towers are good first picks.' },
  { title: 'Place it', body: 'Tap any grass cell along the enemy path. Cells on the path itself can’t be built on.' },
  { title: 'Start the wave', body: 'Tap the big "Start" button. Enemies walk from left to your base.' },
  { title: 'Upgrade or sell', body: 'Tap a placed tower to inspect it. Upgrade for more damage, sell to refund half.' },
];

/**
 * Bulwark — solo tower-defence campaign.
 *
 * Click a tower-type chip, then click an empty grid cell to place.
 * Click an existing tower to select; "U" upgrades, "S" sells. Enemies
 * walk the fixed path (S-curve); reach the end and you lose lives.
 *
 * Co-op mesh mode (per the arcade-v2 plan: deterministic lockstep
 * simulation) is wired up to the same World engine so a follow-up
 * commit can drop in `@shippie/proximity` without re-architecting.
 */

const sdk = createShippieIframeSdk({ appId: 'app_bulwark' });
const observations = createObservationClient(sdk);

const TOWER_COLOR: Record<TowerType, string> = {
  gun: '#3F8AA8',
  cannon: '#E84A2D',
  missile: '#7E5B96',
  slow: '#4FA487',
  emp: '#F4B860',
  sniper: '#C97B2D',
};

export function App() {
  const [world, setWorld] = useState<World>(() => createWorld());
  const [selectedType, setSelectedType] = useState<TowerType | null>(null);
  const [selectedTowerId, setSelectedTowerId] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 3>(1);
  const [fullscreen, setFullscreenState] = useState(false);
  const [muted, setMutedState] = useState(() => isMuted());
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  const [waveBanner, setWaveBanner] = useState<{ id: number; text: string } | null>(null);
  const [, forceRender] = useState(0);
  const tutorial = useTutorial('bulwark', TUTORIAL_STEPS);

  const lastFrameRef = useRef(performance.now());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const particlesRef = useRef<Particles | null>(null);
  const lastEnemyHpRef = useRef<Map<number, number>>(new Map());
  const lastWaveRef = useRef(0);
  const bannerIdRef = useRef(0);

  // Mount canvas particles.
  useEffect(() => {
    const canvas = fxCanvasRef.current;
    if (!canvas) return;
    const fx = new Particles(canvas);
    particlesRef.current = fx;
    const resize = () => fx.resize();
    resize();
    window.addEventListener('resize', resize);
    fx.start();
    return () => {
      window.removeEventListener('resize', resize);
      fx.stop();
      particlesRef.current = null;
    };
  }, []);

  const burstAt = (gridX: number, gridY: number, colour: string, count = 8) => {
    const grid = gridRef.current;
    const canvas = fxCanvasRef.current;
    if (!grid || !canvas || !particlesRef.current) return;
    const gridRect = grid.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const cellW = gridRect.width / GRID_W;
    const cellH = gridRect.height / GRID_H;
    const x = gridRect.left - canvasRect.left + cellW * (gridX + 0.5);
    const y = gridRect.top - canvasRect.top + cellH * (gridY + 0.5);
    particlesRef.current.emit({ x, y, count, colour, kind: 'burst', speed: 0.9, lifetimeMs: 600 });
  };

  // Wave banner whenever world.wave advances.
  useEffect(() => {
    if (world.wave > lastWaveRef.current && world.wave > 0) {
      lastWaveRef.current = world.wave;
      const id = ++bannerIdRef.current;
      setWaveBanner({ id, text: `Wave ${world.wave}` });
      sfx.play('warn', { pitch: 1.2 });
      window.setTimeout(() => setWaveBanner((b) => (b?.id === id ? null : b)), 1400);
    }
  }, [world.wave]);

  // Detect enemy deaths frame-over-frame for particle bursts + sound.
  useEffect(() => {
    const positions = enemyPositions(world);
    const seenIds = new Set<number>();
    for (const e of positions) {
      seenIds.add(e.id);
      const lastHp = lastEnemyHpRef.current.get(e.id);
      if (lastHp !== undefined && lastHp > e.hp) {
        // Took damage this frame — small spark.
        burstAt(e.x, e.y, '#fff', 2);
      }
      lastEnemyHpRef.current.set(e.id, e.hp);
    }
    // Anything that dropped out of positions either reached the base
    // (lives--) or died (currency awarded). Burst + pop for both.
    for (const [id, hp] of lastEnemyHpRef.current) {
      if (!seenIds.has(id)) {
        if (hp > 0) {
          // Survivor — base hit.
          sfx.play('warn', { pitch: 0.8 });
        } else {
          sfx.play('pop', { pitch: 0.8 + Math.random() * 0.4 });
        }
        lastEnemyHpRef.current.delete(id);
      }
    }
  });

  // Game tick.
  useEffect(() => {
    if (paused || world.over || world.won) return;
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - lastFrameRef.current) / 1000) * speed;
      lastFrameRef.current = now;
      tickWorld(world, dt);
      forceRender((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    lastFrameRef.current = performance.now();
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, world, speed]);

  // Game-end emit.
  const endRef = useRef(false);
  useEffect(() => {
    if (endRef.current) return;
    if (world.over || world.won) {
      endRef.current = true;
      sfx.play(world.won ? 'levelUp' : 'fail');
      observations.emit({
        kind: 'game.completed',
        game: 'bulwark',
        result: world.won ? `won ${world.score}` : `lost wave ${world.wave}`,
        at: new Date().toISOString(),
      });
      haptic(world.won ? 'success' : 'error');
    }
  }, [world.over, world.won, world.score, world.wave]);

  // Keyboard.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k >= '1' && k <= '6') setSelectedType(TOWER_TYPES[parseInt(k, 10) - 1]!);
      else if (k === 'u' && selectedTowerId !== null) {
        if (upgradeTower(world, selectedTowerId)) { haptic('tap'); forceRender((n) => n + 1); }
      } else if (k === 's' && selectedTowerId !== null) {
        sellTower(world, selectedTowerId);
        setSelectedTowerId(null);
        forceRender((n) => n + 1);
      } else if (k === ' ') { e.preventDefault(); setPaused((p) => !p); }
      else if (k === '+' || k === '=') setSpeed((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
      else if (k === '-') setSpeed((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedTowerId, world]);

  const onCellClick = (x: number, y: number) => {
    const t = world.towers.find((t) => t.x === x && t.y === y);
    if (t) {
      setSelectedTowerId(t.id);
      setSelectedType(null);
      sfx.play('tap');
      return;
    }
    if (selectedType) {
      if (placeTower(world, selectedType, x, y)) {
        haptic('tap');
        sfx.play('bing', { pitch: 1.1 });
        burstAt(x, y, TOWER_COLOR[selectedType], 6);
        forceRender((n) => n + 1);
      } else {
        haptic('error');
        sfx.play('fail', { volume: 0.4 });
      }
    }
  };

  const begin = () => {
    if (!world.waveActive) {
      startWave(world);
      sfx.play('warn');
      forceRender((n) => n + 1);
    }
  };

  const restart = () => {
    setWorld(createWorld());
    setSelectedType(null);
    setSelectedTowerId(null);
    endRef.current = false;
    setPaused(false);
  };

  const toggleFullscreen = () => {
    if (isFullscreen()) void exitFullscreen();
    else void requestFullscreen(containerRef.current);
  };
  useEffect(() => {
    const h = () => setFullscreenState(isFullscreen());
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const enemies = enemyPositions(world);
  const selectedTower = useMemo(() => world.towers.find((t) => t.id === selectedTowerId) ?? null, [world.towers, selectedTowerId]);

  return (
    <main className="app" ref={containerRef}>
      <header className="head">
        <div>
          <h1>Bulwark</h1>
          <p className="muted small">
            Wave {world.wave}/20 · {world.lives}♥ · ${world.bank} · {world.score} pts
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="ghost" onClick={() => setPaused((p) => !p)} aria-label="Pause">{paused ? '▶' : '⏸'}</button>
          <button type="button" className="ghost" onClick={() => setSpeed((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : 1))} aria-label="Speed">{speed}×</button>
          <button type="button" className="ghost" onClick={() => setMutedState(toggleMuted())} aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? '🔇' : '🔊'}</button>
          <button type="button" className="ghost" onClick={toggleFullscreen} aria-label="Toggle fullscreen">{fullscreen ? '⤡' : '⛶'}</button>
          <button type="button" className="ghost" onClick={tutorial.reset} aria-label="Show tutorial">?</button>
        </div>
      </header>

      <section className="tower-row">
        {TOWER_TYPES.map((t, i) => {
          const spec = TOWER_SPECS[t][0]!;
          const affordable = world.bank >= spec.cost;
          return (
            <button
              key={t}
              type="button"
              className={`tower-chip${t === selectedType ? ' active' : ''}${affordable ? '' : ' broke'}`}
              onClick={() => { setSelectedType(t); setSelectedTowerId(null); }}
              style={{ borderColor: TOWER_COLOR[t] }}
            >
              <span className="num">{i + 1}</span>
              <span className="name">{t}</span>
              <span className="cost">${spec.cost}</span>
            </button>
          );
        })}
      </section>

      <div className="play-row">
        <div className="grid-wrap">
          <canvas ref={fxCanvasRef} className="fx-canvas" aria-hidden />
          <div
            className="grid"
            ref={gridRef}
            style={{ gridTemplateColumns: `repeat(${GRID_W}, 1fr)`, gridTemplateRows: `repeat(${GRID_H}, 1fr)` }}
            onPointerLeave={() => setHoverCell(null)}
          >
            {Array.from({ length: GRID_H }, (_, y) =>
              Array.from({ length: GRID_W }, (_, x) => {
                const onPath = world.path.some((p) => p.x === x && p.y === y);
                const tower = world.towers.find((t) => t.x === x && t.y === y);
                const isHover = hoverCell?.x === x && hoverCell?.y === y;
                return (
                  <button
                    key={`${x}-${y}`}
                    type="button"
                    className={`cell${onPath ? ' path' : ''}${tower ? ' has-tower' : ''}${selectedTowerId === tower?.id ? ' selected' : ''}${isHover ? ' hover' : ''}`}
                    onClick={() => onCellClick(x, y)}
                    onPointerEnter={() => setHoverCell({ x, y })}
                    aria-label={`${x},${y}`}
                  >
                    {tower ? (
                      <span className="tower" style={{ background: TOWER_COLOR[tower.type] }} aria-hidden>
                        <TowerSprite type={tower.type} tier={tower.tier} />
                        {tower.tier > 0 ? <span className="tier">{tower.tier + 1}</span> : null}
                      </span>
                    ) : null}
                  </button>
                );
              }),
            )}
            {/* Range circle preview — when placing a new tower OR
                 inspecting an existing one. Uses absolute positioning
                 over the grid so it scales with the play area. */}
            {(() => {
              const previewType = selectedType;
              const previewTower = selectedTower;
              if (!previewType && !previewTower) return null;
              const range = previewTower
                ? TOWER_SPECS[previewTower.type][previewTower.tier]!.range
                : TOWER_SPECS[previewType!][0]!.range;
              const cx = previewTower ? previewTower.x : hoverCell?.x;
              const cy = previewTower ? previewTower.y : hoverCell?.y;
              const colour = previewTower ? TOWER_COLOR[previewTower.type] : TOWER_COLOR[previewType!];
              if (cx === undefined || cy === undefined) return null;
              return (
                <span
                  className="range-circle"
                  style={{
                    left: `${((cx + 0.5) / GRID_W) * 100}%`,
                    top: `${((cy + 0.5) / GRID_H) * 100}%`,
                    width: `${(range * 2 / GRID_W) * 100}%`,
                    height: `${(range * 2 / GRID_H) * 100}%`,
                    borderColor: colour,
                  }}
                  aria-hidden
                />
              );
            })()}
            {enemies.map((e) => (
              <span
                key={e.id}
                className="enemy"
                style={{
                  left: `${(e.x / GRID_W) * 100}%`,
                  top: `${(e.y / GRID_H) * 100}%`,
                  width: `${(1 / GRID_W) * 100}%`,
                  height: `${(1 / GRID_H) * 100}%`,
                }}
              >
                <span className="enemy-body" />
                {e.hp < e.maxHp ? <span className="hp" style={{ width: `${(e.hp / e.maxHp) * 100}%` }} /> : null}
              </span>
            ))}
            {waveBanner ? <div key={waveBanner.id} className="wave-banner">{waveBanner.text}</div> : null}
          </div>
        </div>

        <aside className="side">
          {selectedTower ? (
            <div className="tower-card">
              <p className="muted small">{selectedTower.type} · tier {selectedTower.tier + 1}</p>
              <p>Range {TOWER_SPECS[selectedTower.type][selectedTower.tier]!.range} · DMG {TOWER_SPECS[selectedTower.type][selectedTower.tier]!.damage}</p>
              <button type="button" className="ghost" onClick={() => { upgradeTower(world, selectedTower.id); forceRender((n) => n + 1); }}
                disabled={selectedTower.tier === 2 || world.bank < (TOWER_SPECS[selectedTower.type][((selectedTower.tier + 1) as 0 | 1 | 2)]?.cost ?? Infinity)}>
                Upgrade ${selectedTower.tier === 2 ? '—' : TOWER_SPECS[selectedTower.type][((selectedTower.tier + 1) as 0 | 1 | 2)]?.cost}
              </button>
              <button type="button" className="ghost" onClick={() => { sellTower(world, selectedTower.id); setSelectedTowerId(null); forceRender((n) => n + 1); }}>
                Sell
              </button>
            </div>
          ) : selectedType ? (
            <div className="tower-card">
              <p className="muted small">{selectedType}</p>
              <p>{TOWER_SPECS[selectedType][0]!.description}</p>
              <p className="muted small">Click an empty cell to place</p>
            </div>
          ) : (
            <div className="tower-card">
              <p className="muted small">Pick a tower (1-6) or click an existing one.</p>
            </div>
          )}
        </aside>
      </div>

      <section className="controls">
        {!world.waveActive && !world.over && !world.won ? (
          <button type="button" className="primary" onClick={begin}>{world.wave === 0 ? 'Start' : `Wave ${world.wave + 1}`}</button>
        ) : null}
        {world.over || world.won ? (
          <>
            <p className="finish-line">{world.won ? `🏆 Defended! ${world.score} pts` : `Base fell on wave ${world.wave}`}</p>
            <button type="button" className="primary" onClick={restart}>Play again</button>
          </>
        ) : null}
      </section>

      {tutorial.active && tutorial.step ? (
        <div className="tutorial-overlay" role="dialog">
          <div className="tutorial-card">
            <p className="tutorial-step muted small">Step {tutorial.index + 1} / {tutorial.total}</p>
            <h3 className="tutorial-title">{tutorial.step.title}</h3>
            <p>{tutorial.step.body}</p>
            <div className="row-actions">
              <button type="button" className="primary" onClick={tutorial.next}>
                {tutorial.index + 1 >= tutorial.total ? 'Got it' : 'Next'}
              </button>
              <button type="button" className="ghost" onClick={tutorial.dismiss}>Skip</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function TowerSprite({ type, tier }: { type: TowerType; tier: 0 | 1 | 2 }) {
  // Same SVG silhouette per type; tier shown via decoration ring.
  const stroke = tier === 0 ? '#ffffff80' : tier === 1 ? '#ffffffcc' : '#fff';
  switch (type) {
    case 'gun':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="6" y="14" width="12" height="6" fill="#fff" opacity="0.9" />
          <rect x="11" y="4" width="2" height="12" fill="#fff" opacity="0.9" />
          <circle cx="12" cy="12" r="10" fill="none" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
    case 'cannon':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="6" y="14" width="12" height="6" rx="1" fill="#fff" opacity="0.9" />
          <rect x="9" y="4" width="6" height="14" rx="1" fill="#fff" opacity="0.9" />
          <circle cx="12" cy="12" r="10" fill="none" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
    case 'missile':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <polygon points="12,3 15,9 15,15 9,15 9,9" fill="#fff" opacity="0.9" />
          <rect x="7" y="15" width="10" height="5" fill="#fff" opacity="0.9" />
          <circle cx="12" cy="12" r="10" fill="none" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
    case 'slow':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 4v16M5 8l14 8M5 16l14-8" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="12" cy="12" r="10" fill="none" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
    case 'emp':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="3" fill="#fff" opacity="0.9" />
          <circle cx="12" cy="12" r="6" stroke="#fff" strokeWidth="1.4" fill="none" opacity="0.7" />
          <circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="1.2" fill="none" opacity="0.4" />
          <circle cx="12" cy="12" r="10" fill="none" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
    case 'sniper':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <line x1="3" y1="21" x2="21" y2="3" stroke="#fff" strokeWidth="2" />
          <circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="1.5" fill="none" />
          <circle cx="12" cy="12" r="10" fill="none" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
  }
}
