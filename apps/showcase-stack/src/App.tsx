import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import {
  WIDTH,
  HEIGHT,
  applyScoring,
  createGame,
  ghostY,
  gravityIntervalMs,
  hardDrop,
  holdSwap,
  lockPiece,
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

const SOFT_DROP_INTERVAL_MS = 50;
const LOCK_DELAY_MS = 500;
const SPRINT_TARGET_LINES = 40;
const ULTRA_DURATION_MS = 120_000;

const sdk = createShippieIframeSdk({ appId: 'app_stack' });
const observations = createObservationClient(sdk);

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
function saveRecords(r: Records) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)); } catch {/**/}
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

  const lastFallRef = useRef(performance.now());
  const lockTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { saveRecords(records); }, [records]);

  const elapsed = startedAt ? now - startedAt : 0;
  const sprintRemaining = SPRINT_TARGET_LINES - game.lines;
  const ultraRemainingMs = startedAt ? Math.max(0, ULTRA_DURATION_MS - elapsed) : ULTRA_DURATION_MS;

  const finishGame = useCallback((reason: 'topout' | 'win' | 'time') => {
    setRunning(false);
    setPaused(false);
    haptic(reason === 'win' ? 'success' : 'error');
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
      if (ts - lastFallRef.current >= interval) {
        lastFallRef.current = ts;
        const moved = tryMove(game, 0, 1);
        if (!moved) {
          // Start lock delay if not already running.
          if (lockTimerRef.current === null) {
            lockTimerRef.current = window.setTimeout(() => {
              lockTimerRef.current = null;
              const { cleared, tspin } = lockPiece(game);
              applyScoring(game, cleared, tspin);
              const ok = spawnNext(game);
              if (!ok) finishGame('topout');
              setGame({ ...game });
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
          if (tryMove(game, -1, 0)) { haptic('tap'); setGame({ ...game }); }
          break;
        case 'right':
          if (tryMove(game, 1, 0)) { haptic('tap'); setGame({ ...game }); }
          break;
        case 'down':
          if (tryMove(game, 0, 1)) { game.score += 1; setGame({ ...game }); }
          break;
        case 'rotateL':
          if (tryRotate(game, -1)) { haptic('tap'); setGame({ ...game }); }
          break;
        case 'rotateR':
          if (tryRotate(game, 1)) { haptic('tap'); setGame({ ...game }); }
          break;
        case 'hard': {
          const dy = hardDrop(game);
          game.score += dy * 2;
          const { cleared, tspin } = lockPiece(game);
          applyScoring(game, cleared, tspin);
          const ok = spawnNext(game);
          if (!ok) finishGame('topout');
          haptic('success');
          setGame({ ...game });
          break;
        }
        case 'hold':
          if (holdSwap(game)) { haptic('tap'); setGame({ ...game }); }
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

  // Render board with the active piece + ghost overlay.
  const overlay = useMemo(() => {
    const cells: Array<{ x: number; y: number; v: number; ghost?: boolean }> = [];
    const ghost = ghostY(game);
    // Render ghost first.
    const shape = (() => {
      // Mirror SHAPES in tetris.ts — duplicated lookup.
      const s = require('./tetris');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (s as { default?: unknown }) && undefined;
    })();
    return { ghost, cells };
  }, [game]);

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

        <Board game={game} />

        <aside className="side">
          <p className="muted small">Next</p>
          {game.next.slice(0, 3).map((t, i) => (
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

      {!running ? (
        <section className="overlay">
          {game.over ? <p className="finish-line">Top-out · {game.score} pts</p> : null}
          <button type="button" className="primary" onClick={() => start(mode)}>Start {mode}</button>
          <p className="muted small">Best {mode}: {records[mode].bestScore} pts · {records[mode].runs} runs</p>
        </section>
      ) : null}
    </main>
  );
}

function PieceMini({ type }: { type: PieceType | null }) {
  if (!type) return <div className="piece-mini empty" />;
  return <div className="piece-mini" style={{ background: COLOR[pieceIndex(type)] }}>{type}</div>;
}

function pieceIndex(t: PieceType): number {
  return { I: 1, J: 2, L: 3, O: 4, S: 5, T: 6, Z: 7 }[t];
}

function Board({ game }: { game: GameState }) {
  // Clone the board + stamp the active piece + ghost on top.
  const display = new Uint8Array(game.board);
  const ghost = ghostY(game);
  // Ghost (lowest priority — only on empty cells).
  const tetromino = require('./tetris');
  // Inline shape lookup to avoid extra imports.
  const SHAPES_LOCAL: Record<PieceType, ReadonlyArray<ReadonlyArray<readonly [number, number]>>> = {
    I: [[[0,1],[1,1],[2,1],[3,1]],[[2,0],[2,1],[2,2],[2,3]],[[0,2],[1,2],[2,2],[3,2]],[[1,0],[1,1],[1,2],[1,3]]],
    J: [[[0,0],[0,1],[1,1],[2,1]],[[1,0],[2,0],[1,1],[1,2]],[[0,1],[1,1],[2,1],[2,2]],[[1,0],[1,1],[0,2],[1,2]]],
    L: [[[2,0],[0,1],[1,1],[2,1]],[[1,0],[1,1],[1,2],[2,2]],[[0,1],[1,1],[2,1],[0,2]],[[0,0],[1,0],[1,1],[1,2]]],
    O: [[[1,0],[2,0],[1,1],[2,1]],[[1,0],[2,0],[1,1],[2,1]],[[1,0],[2,0],[1,1],[2,1]],[[1,0],[2,0],[1,1],[2,1]]],
    S: [[[1,0],[2,0],[0,1],[1,1]],[[1,0],[1,1],[2,1],[2,2]],[[1,1],[2,1],[0,2],[1,2]],[[0,0],[0,1],[1,1],[1,2]]],
    T: [[[1,0],[0,1],[1,1],[2,1]],[[1,0],[1,1],[2,1],[1,2]],[[0,1],[1,1],[2,1],[1,2]],[[1,0],[0,1],[1,1],[1,2]]],
    Z: [[[0,0],[1,0],[1,1],[2,1]],[[2,0],[1,1],[2,1],[1,2]],[[0,1],[1,1],[1,2],[2,2]],[[1,0],[0,1],[1,1],[0,2]]],
  };
  const shape = SHAPES_LOCAL[game.active.type][game.active.rotation]!;
  // Ghost cells.
  const ghostMarks = new Set<number>();
  for (const [cx, cy] of shape) {
    const x = game.active.x + cx;
    const y = ghost + cy;
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) continue;
    if (display[y * WIDTH + x] === 0) ghostMarks.add(y * WIDTH + x);
  }
  // Active piece (overrides ghost).
  for (const [cx, cy] of shape) {
    const x = game.active.x + cx;
    const y = game.active.y + cy;
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) continue;
    display[y * WIDTH + x] = pieceIndex(game.active.type);
    ghostMarks.delete(y * WIDTH + x);
  }
  void tetromino;
  return (
    <div className="board" style={{ gridTemplateColumns: `repeat(${WIDTH}, 1fr)` }}>
      {Array.from(display, (v, idx) => {
        const ghostHere = ghostMarks.has(idx);
        return (
          <span
            key={idx}
            className={`cell${v === 0 ? '' : ' filled'}${ghostHere ? ' ghost' : ''}`}
            style={{ background: ghostHere ? 'transparent' : COLOR[v] ?? 'transparent' }}
          />
        );
      })}
    </div>
  );
}
