import { useCallback, useEffect, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { createSoundBank, isMuted, toggleMuted } from '@shippie/juice';
import { ARCADE_SAMPLES } from '@shippie/juice/samples';
import {
  WIDTH,
  HEIGHT,
  applyScoring,
  canMove,
  createGame,
  ghostY,
  gravityIntervalMs,
  hardDrop,
  holdSwap,
  lockPiece,
  pieceCells,
  spawnNext,
  tryMove,
  tryRotate,
  type GameState,
  type PieceType,
} from './tetris';
import { exitFullscreen, isFullscreen, requestFullscreen } from './fullscreen';

/**
 * Stack — modern Tetris.
 *
 * Modes:
 *   - Marathon: gravity scales with level; play until top-out.
 *   - Sprint: clear 40 lines, time displayed.
 *   - Ultra: 2 minutes, score race.
 *
 * Controls (desktop):
 *   ←/→  move          ↓  soft drop      space  hard drop
 *   Z    rotate left   X  rotate right    Shift  hold
 *   P    pause
 *
 * Mobile: tap left/right halves to move, swipe down for hard drop,
 * tap centre to rotate. Hold/pause via on-screen buttons.
 */

type Mode = 'marathon' | 'sprint' | 'ultra';

const LOCK_DELAY_MS = 500;
const SPRINT_TARGET_LINES = 40;
const ULTRA_DURATION_MS = 120_000;

const sdk = createShippieIframeSdk({ appId: 'app_stack' });
// Tell the container the bottom touch-controls row owns the bottom
// of the viewport. Host shrinks its left chrome pill so it stops
// overlapping the left-arrow touch button.
sdk.safeEdges.declareInputRegion('bottom');
const observations = createObservationClient(sdk);
const sfx = createSoundBank({
  tap: ARCADE_SAMPLES.tap,
  pop: ARCADE_SAMPLES.pop,
  whoosh: ARCADE_SAMPLES.whoosh,
  bing: ARCADE_SAMPLES.bing,
  success: ARCADE_SAMPLES.success,
  fail: ARCADE_SAMPLES.fail,
  levelUp: ARCADE_SAMPLES.levelUp,
});

interface Toast {
  id: number;
  text: string;
  flavour: 'tspin' | 'tetris' | 'b2b' | 'combo';
}

const STORAGE_KEY = 'shippie:stack:v1';

interface ModeRecord {
  bestScore: number;
  /** Sprint: best lines cleared in <time>; Ultra: best score; Marathon: best score. */
  best: number;
  runs: number;
}
type Records = Record<Mode, ModeRecord>;

function loadRecords(): Records {
  if (typeof localStorage === 'undefined')
    return {
      marathon: { bestScore: 0, best: 0, runs: 0 },
      sprint: { bestScore: 0, best: 0, runs: 0 },
      ultra: { bestScore: 0, best: 0, runs: 0 },
    };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      marathon: raw.marathon ?? { bestScore: 0, best: 0, runs: 0 },
      sprint: raw.sprint ?? { bestScore: 0, best: 0, runs: 0 },
      ultra: raw.ultra ?? { bestScore: 0, best: 0, runs: 0 },
    };
  } catch {
    return {
      marathon: { bestScore: 0, best: 0, runs: 0 },
      sprint: { bestScore: 0, best: 0, runs: 0 },
      ultra: { bestScore: 0, best: 0, runs: 0 },
    };
  }
}
function warnQuota(key: string, err: unknown): void {
  // localStorage.setItem throws QuotaExceededError (or NS_ERROR_DOM_QUOTA_REACHED
  // on Firefox) when full / private-mode-restricted. We swallow so the game
  // keeps running, but surface a one-time console.warn so devs notice in QA.
  // eslint-disable-next-line no-console
  console.warn(`[stack] localStorage write failed for "${key}":`, err);
}

function saveRecords(r: Records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
  } catch (err) {
    warnQuota(STORAGE_KEY, err);
  }
}

const COLOR: Record<number, string> = {
  0: 'transparent',
  1: '#3F8AA8', // I — cyan
  2: '#3D6BAB', // J — blue
  3: '#F0734A', // L — orange
  4: '#F4B860', // O — yellow
  5: '#7FB269', // S — green
  6: '#7E5B96', // T — purple
  7: '#E84A2D', // Z — red
  8: '#6B5C4A', // Garbage
};

export function App() {
  const [mode, setMode] = useState<Mode>('marathon');
  const [game, setGame] = useState<GameState>(() => createGame());
  const [paused, setPaused] = useState(false);
  const [running, setRunning] = useState(false);
  const [records, setRecords] = useState<Records>(() => loadRecords());
  const [fullscreen, setFullscreenState] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [muted, setMutedState] = useState(() => isMuted());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const lastFallRef = useRef(performance.now());
  const lockTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Bumped whenever the active piece locks; Board consumes it to fire
  // a one-shot flash animation on the freshly-locked cells.
  const [lockFlashKey, setLockFlashKey] = useState(0);
  // Sub-cell vertical offset for the active piece (0..1). Driven by
  // the per-frame gravity timestamp, so the piece visibly slides
  // between rows instead of snapping. Reset to 0 on hard-drop / lock.
  const [fallProgress, setFallProgress] = useState(0);
  // Wow-pass additions: theme picker, level-up flash trigger,
  // line-clear flash overlay (rows that just cleared).
  const [theme, setTheme] = useState<'cosmic' | 'forest' | 'clean'>(() => {
    if (typeof localStorage === 'undefined') return 'cosmic';
    const t = localStorage.getItem('shippie:stack:theme:v1');
    return t === 'forest' || t === 'clean' ? t : 'cosmic';
  });
  const [levelFlashKey, setLevelFlashKey] = useState(0);
  const [clearedRowsFlash, setClearedRowsFlash] = useState<{ rows: number[]; until: number } | null>(null);
  const [tspinBanner, setTspinBanner] = useState<{ key: number; text: string } | null>(null);
  const tspinKeyRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem('shippie:stack:theme:v1', theme);
    } catch (err) {
      warnQuota('shippie:stack:theme:v1', err);
    }
    document.body.dataset.theme = theme;
  }, [theme]);

  useEffect(() => { saveRecords(records); }, [records]);

  const pushToast = useCallback((text: string, flavour: Toast['flavour']) => {
    const id = ++toastIdRef.current;
    setToasts((t) => [...t, { id, text, flavour }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 1500);
  }, []);

  const elapsed = startedAt ? now - startedAt : 0;
  const sprintRemaining = SPRINT_TARGET_LINES - game.lines;
  const ultraRemainingMs = startedAt ? Math.max(0, ULTRA_DURATION_MS - elapsed) : ULTRA_DURATION_MS;

  const finishGame = useCallback((reason: 'topout' | 'win' | 'time') => {
    setRunning(false);
    setPaused(false);
    haptic(reason === 'win' ? 'success' : 'error');
    sfx.play(reason === 'win' ? 'success' : 'fail');
    const score = game.score;
    setRecords((r) => {
      const prev = r[mode];
      const newBest = mode === 'sprint'
        ? Math.min(prev.best || Number.MAX_SAFE_INTEGER, elapsed)
        : Math.max(prev.best, score);
      return {
        ...r,
        [mode]: {
          bestScore: Math.max(prev.bestScore, score),
          best: newBest,
          runs: prev.runs + 1,
        },
      };
    });
    observations.emit({
      kind: 'game.completed',
      game: 'stack',
      result: `${mode}/${score}/${game.lines}L`,
      at: new Date().toISOString(),
    });
  }, [elapsed, game.lines, game.score, mode]);

  // Game tick: gravity + lock delay + mode-end checks.
  useEffect(() => {
    if (!running || paused || game.over) return;
    let raf = 0;
    const loop = (ts: number) => {
      setNow(Date.now());
      const interval = gravityIntervalMs(game.level);
      // Visual sub-cell offset between gravity steps. Cap at 1 so we
      // never overshoot during the lock-delay window. When the piece
      // can't move down (resting on stack/floor), pin to 0.
      const cantFall = !canMove(game, 0, 1);
      const rawProgress = (ts - lastFallRef.current) / interval;
      const next = cantFall ? 0 : Math.max(0, Math.min(1, rawProgress));
      setFallProgress(next);
      if (ts - lastFallRef.current >= interval) {
        lastFallRef.current = ts;
        const moved = tryMove(game, 0, 1);
        if (!moved) {
          // Start lock delay if not already running.
          if (lockTimerRef.current === null) {
            lockTimerRef.current = window.setTimeout(() => {
              lockTimerRef.current = null;
              const beforeLevel = game.level;
              const beforeCombo = game.combo;
              const beforeB2B = game.b2b;
              const { cleared, tspin } = lockPiece(game);
              sfx.play('pop', { volume: 0.7 });
              applyScoring(game, cleared, tspin);
              // Audio + toast reactions to the clear quality.
              if (cleared > 0) {
                // Capture the now-cleared row indices for the flash
                // overlay. lockPiece already cleared them in-place;
                // we approximate by flashing the bottom-most `cleared`
                // rows of the previous board state. Visual-only.
                setClearedRowsFlash({ rows: Array.from({ length: cleared }, (_, i) => HEIGHT - 1 - i), until: performance.now() + 240 });
                if (cleared === 4) {
                  sfx.play('bing');
                  pushToast(beforeB2B && game.b2b ? 'B2B Tetris!' : 'Tetris!', 'tetris');
                } else if (tspin) {
                  sfx.play('bing');
                  pushToast(beforeB2B && game.b2b ? `B2B T-Spin ${labelForCleared(cleared)}!` : `T-Spin ${labelForCleared(cleared)}!`, 'tspin');
                  // Big T-spin banner overlay (separate from toast).
                  tspinKeyRef.current++;
                  setTspinBanner({ key: tspinKeyRef.current, text: `T-Spin ${labelForCleared(cleared)}` });
                  window.setTimeout(() => setTspinBanner((b) => (b?.key === tspinKeyRef.current ? null : b)), 1100);
                } else {
                  sfx.play('whoosh', { volume: 0.8 });
                  if (cleared >= 2) pushToast(labelForCleared(cleared), 'b2b');
                }
                if (game.combo - beforeCombo > 0 && game.combo > 1) {
                  pushToast(`Combo ×${game.combo}`, 'combo');
                }
                if (game.level !== beforeLevel) {
                  sfx.play('levelUp');
                  pushToast(`Level ${game.level}`, 'b2b');
                  setLevelFlashKey((k) => k + 1);
                }
              }
              const ok = spawnNext(game);
              if (!ok) finishGame('topout');
              setGame({ ...game });
              setLockFlashKey((k) => k + 1);
              setFallProgress(0);
              lastFallRef.current = performance.now();
            }, LOCK_DELAY_MS);
          }
        } else {
          // Cancel any pending lock — piece moved.
          if (lockTimerRef.current !== null) {
            window.clearTimeout(lockTimerRef.current);
            lockTimerRef.current = null;
          }
          setGame({ ...game });
        }
      }
      // Mode-end checks.
      if (mode === 'sprint' && game.lines >= SPRINT_TARGET_LINES) {
        finishGame('win');
        return;
      }
      if (mode === 'ultra' && startedAt && Date.now() - startedAt >= ULTRA_DURATION_MS) {
        finishGame('time');
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (lockTimerRef.current !== null) {
        window.clearTimeout(lockTimerRef.current);
        lockTimerRef.current = null;
      }
    };
  }, [running, paused, game, mode, startedAt, finishGame]);

  const start = (m: Mode) => {
    setMode(m);
    const fresh = createGame();
    setGame(fresh);
    setRunning(true);
    setPaused(false);
    setStartedAt(Date.now());
    lastFallRef.current = performance.now();
  };

  const togglePause = () => setPaused((p) => !p);

  const onAction = useCallback(
    (action: 'left' | 'right' | 'down' | 'rotateL' | 'rotateR' | 'hard' | 'hold' | 'pause') => {
      if (action === 'pause') return togglePause();
      if (!running || paused || game.over) return;
      switch (action) {
        case 'left':
          if (tryMove(game, -1, 0)) { haptic('tap'); sfx.play('tap', { volume: 0.4 }); setGame({ ...game }); }
          break;
        case 'right':
          if (tryMove(game, 1, 0)) { haptic('tap'); sfx.play('tap', { volume: 0.4 }); setGame({ ...game }); }
          break;
        case 'down':
          if (tryMove(game, 0, 1)) { game.score += 1; setGame({ ...game }); }
          break;
        case 'rotateL':
          if (tryRotate(game, -1)) { haptic('tap'); sfx.play('tap', { pitch: 1.2, volume: 0.5 }); setGame({ ...game }); }
          break;
        case 'rotateR':
          if (tryRotate(game, 1)) { haptic('tap'); sfx.play('tap', { pitch: 1.2, volume: 0.5 }); setGame({ ...game }); }
          break;
        case 'hard': {
          const dy = hardDrop(game);
          game.score += dy * 2;
          const beforeCombo = game.combo;
          const beforeB2B = game.b2b;
          const { cleared, tspin } = lockPiece(game);
          sfx.play('whoosh');
          applyScoring(game, cleared, tspin);
          if (cleared > 0) {
            if (cleared === 4) {
              sfx.play('bing');
              pushToast(beforeB2B && game.b2b ? 'B2B Tetris!' : 'Tetris!', 'tetris');
            } else if (tspin) {
              sfx.play('bing');
              pushToast(`T-Spin ${labelForCleared(cleared)}!`, 'tspin');
            } else {
              sfx.play('pop');
              if (cleared >= 2) pushToast(labelForCleared(cleared), 'b2b');
            }
            if (game.combo - beforeCombo > 0 && game.combo > 1) {
              pushToast(`Combo ×${game.combo}`, 'combo');
            }
          }
          const ok = spawnNext(game);
          if (!ok) finishGame('topout');
          haptic('success');
          setGame({ ...game });
          setLockFlashKey((k) => k + 1);
          setFallProgress(0);
          lastFallRef.current = performance.now();
          break;
        }
        case 'hold':
          if (holdSwap(game)) { haptic('tap'); sfx.play('tap', { pitch: 0.8 }); setGame({ ...game }); }
          break;
      }
    },
    [game, paused, running, finishGame],
  );

  // Keyboard binding — desktop hero.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); onAction('left'); break;
        case 'ArrowRight': e.preventDefault(); onAction('right'); break;
        case 'ArrowDown': e.preventDefault(); onAction('down'); break;
        case ' ': e.preventDefault(); onAction('hard'); break;
        case 'z': case 'Z': onAction('rotateL'); break;
        case 'x': case 'X': case 'ArrowUp': onAction('rotateR'); break;
        case 'Shift': onAction('hold'); break;
        case 'p': case 'P': onAction('pause'); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onAction]);

  useEffect(() => {
    const h = () => setFullscreenState(isFullscreen());
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const toggleFullscreen = () => {
    if (isFullscreen()) void exitFullscreen();
    else void requestFullscreen(containerRef.current);
  };

  return (
    <main className="app" ref={containerRef}>
      <header className="head">
        <div>
          <h1>Stack</h1>
          <p className="muted small">{mode} · L{game.level} · {game.score} pts · {game.lines} lines</p>
        </div>
        <div className="head-actions">
          <button type="button" className="ghost" onClick={togglePause} aria-label="Pause">
            {paused ? '▶' : '⏸'}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setTheme((t) => t === 'cosmic' ? 'forest' : t === 'forest' ? 'clean' : 'cosmic')}
            aria-label="Theme"
            title={`Theme: ${theme}`}
          >
            {theme === 'cosmic' ? '◐' : theme === 'forest' ? '◑' : '◯'}
          </button>
          <button type="button" className="ghost" onClick={() => setMutedState(toggleMuted())} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🔊'}
          </button>
          <button type="button" className="ghost" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
            {fullscreen ? '⤡' : '⛶'}
          </button>
        </div>
      </header>

      <section className="mode-row">
        {(['marathon', 'sprint', 'ultra'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={m === mode ? 'tab active' : 'tab'}
            onClick={() => start(m)}
          >
            {m}
          </button>
        ))}
      </section>

      <div className="play-row">
        <aside className="side">
          <div className="hold">
            <p className="muted small">Hold</p>
            <PieceMini type={game.hold} />
          </div>
          {mode === 'sprint' ? (
            <p className="status">{Math.max(0, sprintRemaining)} lines · {(elapsed / 1000).toFixed(1)}s</p>
          ) : mode === 'ultra' ? (
            <p className="status">{(ultraRemainingMs / 1000).toFixed(1)}s left</p>
          ) : (
            <p className="status">Marathon</p>
          )}
        </aside>

        <Board game={game} fallProgress={fallProgress} lockFlashKey={lockFlashKey} />

        <aside className="side">
          <p className="muted small">Next</p>
          {game.next.slice(0, 5).map((t, i) => (
            <PieceMini key={i} type={t} />
          ))}
        </aside>
      </div>

      <section className="touch-controls" aria-hidden>
        <button type="button" onClick={() => onAction('left')}>←</button>
        <button type="button" onClick={() => onAction('rotateR')}>↻</button>
        <button type="button" onClick={() => onAction('right')}>→</button>
        <button type="button" onClick={() => onAction('hold')}>HOLD</button>
        <button type="button" onClick={() => onAction('hard')}>DROP</button>
      </section>

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.flavour}`}>{t.text}</div>
        ))}
      </div>

      {!running ? (
        <section className="overlay">
          {game.over ? <p className="finish-line">Top-out · {game.score} pts</p> : null}
          <button type="button" className="primary" onClick={() => start(mode)}>Start {mode}</button>
          <p className="muted small">Best {mode}: {records[mode].bestScore} pts · {records[mode].runs} runs</p>
        </section>
      ) : null}

      {/* Wow-pass overlays. Level-flash fires once per level-up,
          T-spin banner shows briefly on T-spin clears. Both keyed
          so React re-mounts re-fires the keyframe. */}
      <span key={`level-flash-${levelFlashKey}`} className="level-flash" aria-hidden />
      {tspinBanner ? (
        <span key={`tspin-${tspinBanner.key}`} className="tspin-banner" aria-hidden>{tspinBanner.text}</span>
      ) : null}
    </main>
  );
}

function labelForCleared(n: number): string {
  if (n === 1) return 'Single';
  if (n === 2) return 'Double';
  if (n === 3) return 'Triple';
  if (n === 4) return 'Tetris';
  return `${n}-line`;
}

function PieceMini({ type }: { type: PieceType | null }) {
  if (!type) return <div className="piece-mini empty" />;
  return <div className="piece-mini" style={{ background: COLOR[pieceIndex(type)] }}>{type}</div>;
}

function pieceIndex(t: PieceType): number {
  return { I: 1, J: 2, L: 3, O: 4, S: 5, T: 6, Z: 7 }[t];
}

// Inline SRS rotations — same shape as the engine, kept here so the
// renderer doesn't depend on a private export.
const RENDER_SHAPES: Record<PieceType, ReadonlyArray<ReadonlyArray<readonly [number, number]>>> = {
  I: [[[0,1],[1,1],[2,1],[3,1]],[[2,0],[2,1],[2,2],[2,3]],[[0,2],[1,2],[2,2],[3,2]],[[1,0],[1,1],[1,2],[1,3]]],
  J: [[[0,0],[0,1],[1,1],[2,1]],[[1,0],[2,0],[1,1],[1,2]],[[0,1],[1,1],[2,1],[2,2]],[[1,0],[1,1],[0,2],[1,2]]],
  L: [[[2,0],[0,1],[1,1],[2,1]],[[1,0],[1,1],[1,2],[2,2]],[[0,1],[1,1],[2,1],[0,2]],[[0,0],[1,0],[1,1],[1,2]]],
  O: [[[1,0],[2,0],[1,1],[2,1]],[[1,0],[2,0],[1,1],[2,1]],[[1,0],[2,0],[1,1],[2,1]],[[1,0],[2,0],[1,1],[2,1]]],
  S: [[[1,0],[2,0],[0,1],[1,1]],[[1,0],[1,1],[2,1],[2,2]],[[1,1],[2,1],[0,2],[1,2]],[[0,0],[0,1],[1,1],[1,2]]],
  T: [[[1,0],[0,1],[1,1],[2,1]],[[1,0],[1,1],[2,1],[1,2]],[[0,1],[1,1],[2,1],[1,2]],[[1,0],[0,1],[1,1],[1,2]]],
  Z: [[[0,0],[1,0],[1,1],[2,1]],[[2,0],[1,1],[2,1],[1,2]],[[0,1],[1,1],[1,2],[2,2]],[[1,0],[0,1],[1,1],[0,2]]],
};

function Board({
  game,
  fallProgress,
  lockFlashKey,
}: {
  game: GameState;
  fallProgress: number;
  lockFlashKey: number;
}) {
  const ghost = ghostY(game);
  const shape = RENDER_SHAPES[game.active.type][game.active.rotation]!;
  // Ghost overlay cells (sub-cell offset NOT applied — ghost shows
  // landing position).
  const ghostMarks = new Set<number>();
  for (const [cx, cy] of shape) {
    const x = game.active.x + cx;
    const y = ghost + cy;
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) continue;
    if (game.board[y * WIDTH + x] === 0) ghostMarks.add(y * WIDTH + x);
  }
  const ghostColor = COLOR[pieceIndex(game.active.type)] ?? '#fff';
  const activeColor = COLOR[pieceIndex(game.active.type)] ?? '#fff';
  return (
    <div
      className="board"
      style={{
        gridTemplateColumns: `repeat(${WIDTH}, 1fr)`,
        gridTemplateRows: `repeat(${HEIGHT}, 1fr)`,
      }}
    >
      {Array.from(game.board, (v, idx) => {
        const ghostHere = ghostMarks.has(idx);
        return (
          <span
            key={idx}
            className={`cell${v === 0 && !ghostHere ? '' : ' filled'}${ghostHere ? ' ghost' : ''}`}
            style={{ background: ghostHere ? `${ghostColor}38` : COLOR[v] ?? 'transparent' }}
          />
        );
      })}
      <ActiveOverlay
        cells={pieceCells(game.active)}
        x={game.active.x}
        y={game.active.y}
        offsetY={fallProgress}
        colour={activeColor}
      />
      <LockFlash key={lockFlashKey} />
    </div>
  );
}

function ActiveOverlay({
  cells,
  x,
  y,
  offsetY,
  colour,
}: {
  cells: ReadonlyArray<readonly [number, number]>;
  x: number;
  y: number;
  offsetY: number;
  colour: string;
}) {
  return (
    <span className="active-overlay" aria-hidden>
      {cells.map(([cx, cy], i) => {
        const px = x + cx;
        const py = y + cy;
        if (px < 0 || px >= WIDTH || py < 0 || py >= HEIGHT) return null;
        return (
          <span
            key={i}
            className="active-tile"
            style={{
              left: `${(px / WIDTH) * 100}%`,
              top: `${((py + offsetY) / HEIGHT) * 100}%`,
              width: `${(1 / WIDTH) * 100}%`,
              height: `${(1 / HEIGHT) * 100}%`,
              background: colour,
            }}
          />
        );
      })}
    </span>
  );
}

/**
 * One-shot flash overlay rendered with a fresh React key on every
 * lock event — drives a CSS keyframe so the freshly-locked piece
 * pulses briefly before settling into the locked-cell colour.
 */
function LockFlash() {
  return <span className="lock-flash" aria-hidden />;
}
