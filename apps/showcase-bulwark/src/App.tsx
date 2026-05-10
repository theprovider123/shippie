import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
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
  const [, forceRender] = useState(0);

  const lastFrameRef = useRef(performance.now());
  const containerRef = useRef<HTMLDivElement | null>(null);

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
    // Tower selection takes precedence: click on existing tower → select.
    const t = world.towers.find((t) => t.x === x && t.y === y);
    if (t) {
      setSelectedTowerId(t.id);
      setSelectedType(null);
      return;
    }
    if (selectedType) {
      if (placeTower(world, selectedType, x, y)) {
        haptic('tap');
        forceRender((n) => n + 1);
      } else {
        haptic('error');
      }
    }
  };

  const begin = () => {
    if (!world.waveActive) {
      startWave(world);
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
          <button type="button" className="ghost" onClick={toggleFullscreen} aria-label="Toggle fullscreen">{fullscreen ? '⤡' : '⛶'}</button>
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
          <div className="grid" style={{ gridTemplateColumns: `repeat(${GRID_W}, 1fr)`, gridTemplateRows: `repeat(${GRID_H}, 1fr)` }}>
            {Array.from({ length: GRID_H }, (_, y) =>
              Array.from({ length: GRID_W }, (_, x) => {
                const onPath = world.path.some((p) => p.x === x && p.y === y);
                const tower = world.towers.find((t) => t.x === x && t.y === y);
                return (
                  <button
                    key={`${x}-${y}`}
                    type="button"
                    className={`cell${onPath ? ' path' : ''}${tower ? ' has-tower' : ''}${selectedTowerId === tower?.id ? ' selected' : ''}`}
                    onClick={() => onCellClick(x, y)}
                    aria-label={`${x},${y}`}
                  >
                    {tower ? (
                      <span className="tower" style={{ background: TOWER_COLOR[tower.type] }}>
                        {tower.type[0]?.toUpperCase()}
                        {tower.tier > 0 ? <span className="tier">{tower.tier + 1}</span> : null}
                      </span>
                    ) : null}
                  </button>
                );
              }),
            )}
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
                <span className="hp" style={{ width: `${(e.hp / e.maxHp) * 100}%` }} />
              </span>
            ))}
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
    </main>
  );
}
