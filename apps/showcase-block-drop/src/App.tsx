import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { createSoundBank, isMuted, toggleMuted, Particles } from '@shippie/juice';
import { ARCADE_SAMPLES } from '@shippie/juice/samples';
import { Confetti } from '@shippie/juice/react';
import {
  SIZE,
  canPlace,
  createWorld,
  dailySeed,
  isPerfectClear,
  place,
  todayKey,
  type Shape,
  type World,
} from './engine';

const sfx = createSoundBank({
  tap: ARCADE_SAMPLES.tap,
  pop: ARCADE_SAMPLES.pop,
  bing: ARCADE_SAMPLES.bing,
  whoosh: ARCADE_SAMPLES.whoosh,
  warn: ARCADE_SAMPLES.warn,
  success: ARCADE_SAMPLES.success,
  fail: ARCADE_SAMPLES.fail,
  levelUp: ARCADE_SAMPLES.levelUp,
});

const sdk = createShippieIframeSdk({ appId: 'app_block_drop' });
sdk.safeEdges.declareInputRegion('bottom');
const observations = createObservationClient(sdk);

const STORAGE_KEY = 'shippie:block-drop:v1';

interface Stored {
  bestScore: number;
  totalRuns: number;
  dailyStreak: number;
  lastDailyDate: string;
  lastDailyScore: number;
}

function loadStored(): Stored {
  if (typeof localStorage === 'undefined') return { bestScore: 0, totalRuns: 0, dailyStreak: 0, lastDailyDate: '', lastDailyScore: 0 };
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      bestScore: typeof v.bestScore === 'number' ? v.bestScore : 0,
      totalRuns: typeof v.totalRuns === 'number' ? v.totalRuns : 0,
      dailyStreak: typeof v.dailyStreak === 'number' ? v.dailyStreak : 0,
      lastDailyDate: typeof v.lastDailyDate === 'string' ? v.lastDailyDate : '',
      lastDailyScore: typeof v.lastDailyScore === 'number' ? v.lastDailyScore : 0,
    };
  } catch {
    return { bestScore: 0, totalRuns: 0, dailyStreak: 0, lastDailyDate: '', lastDailyScore: 0 };
  }
}
function saveStored(s: Stored) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {/**/} }

type Mode = 'endless' | 'daily';

const PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['#3F8AA8', '#7AC4E8'],
  ['#7E5B96', '#B48BC8'],
  ['#F4B860', '#F8D9A8'],
  ['#4FA487', '#83D2B6'],
  ['#E84A2D', '#FF8870'],
  ['#C97B2D', '#E8A655'],
];

function colourForLevel(level: number): readonly [string, string] {
  return PALETTE[(level - 1) % PALETTE.length]!;
}

interface Toast { id: number; text: string; until: number; flavour: 'combo' | 'triple' | 'level' | 'perfect'; }

export function App() {
  const [stored, setStored] = useState<Stored>(() => loadStored());
  const [mode, setMode] = useState<Mode>('endless');
  const [world, setWorld] = useState<World>(() => createWorld());
  const [muted, setMutedState] = useState(() => isMuted());
  const [dragging, setDragging] = useState<{ bagIndex: 0 | 1 | 2; shape: Shape } | null>(null);
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [shake, setShake] = useState(0);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [resultRecorded, setResultRecorded] = useState(false);
  const toastIdRef = useRef(1);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const particlesCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particles | null>(null);

  useEffect(() => { saveStored(stored); }, [stored]);

  // Particle overlay.
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

  const startGame = useCallback((m: Mode) => {
    setMode(m);
    setWorld(createWorld(m === 'daily' ? dailySeed() : undefined));
    setDragging(null);
    setHoverCell(null);
    setResultRecorded(false);
  }, []);

  const pushToast = (text: string, flavour: Toast['flavour']) => {
    const id = toastIdRef.current++;
    setToasts((t) => [...t, { id, text, flavour, until: performance.now() + 1400 }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 1400);
  };

  const burstAt = (row: number, col: number, colour: string, count = 8) => {
    const fx = particlesRef.current;
    const board = boardRef.current;
    const canvas = particlesCanvasRef.current;
    if (!fx || !board || !canvas) return;
    const boardRect = board.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const cellW = boardRect.width / SIZE;
    const cellH = boardRect.height / SIZE;
    const x = boardRect.left - canvasRect.left + cellW * (col + 0.5);
    const y = boardRect.top - canvasRect.top + cellH * (row + 0.5);
    fx.emit({ x, y, count, colour, kind: 'burst', speed: 1.0, lifetimeMs: 600 });
  };

  // End-of-run side effects.
  useEffect(() => {
    if (world.state !== 'over' || resultRecorded) return;
    setResultRecorded(true);
    sfx.play('fail');
    haptic('error');
    observations.emit({
      kind: 'game.completed',
      game: 'block-drop',
      result: `${mode} · ${world.score} pts`,
      at: new Date().toISOString(),
    });
    setStored((s) => {
      const today = todayKey();
      const isDaily = mode === 'daily';
      const dailyStreak = isDaily
        ? (s.lastDailyDate === today ? s.dailyStreak : s.dailyStreak + 1)
        : s.dailyStreak;
      return {
        ...s,
        totalRuns: s.totalRuns + 1,
        bestScore: Math.max(s.bestScore, world.score),
        dailyStreak,
        lastDailyDate: isDaily ? today : s.lastDailyDate,
        lastDailyScore: isDaily ? world.score : s.lastDailyScore,
      };
    });
  }, [world.state, world.score, mode, resultRecorded]);

  function pickFromBag(bagIndex: 0 | 1 | 2, e: React.PointerEvent) {
    if (world.state !== 'playing') return;
    const s = world.bag[bagIndex];
    if (!s) return;
    setDragging({ bagIndex, shape: s });
    sfx.play('tap', { volume: 0.4 });
    e.preventDefault();
  }

  function onBoardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cellW = rect.width / SIZE;
    const cellH = rect.height / SIZE;
    const col = Math.floor((e.clientX - rect.left) / cellW);
    const row = Math.floor((e.clientY - rect.top) / cellH);
    if (col >= 0 && col < SIZE && row >= 0 && row < SIZE) {
      setHoverCell({ row, col });
    } else {
      setHoverCell(null);
    }
  }

  function onBoardPointerUp() {
    if (!dragging || !hoverCell) {
      setDragging(null);
      setHoverCell(null);
      return;
    }
    const r = place(world, dragging.bagIndex, hoverCell.row, hoverCell.col);
    if (!r) {
      sfx.play('warn', { volume: 0.4 });
      haptic('error');
      setShake((n) => n + 1);
      setDragging(null);
      setHoverCell(null);
      return;
    }
    haptic('success');
    sfx.play('pop', { volume: 0.6, pitch: 0.8 + dragging.shape.length * 0.05 });
    if (r.cleared > 0) {
      sfx.play('bing', { pitch: 1.1 });
      const [colA] = colourForLevel(world.level);
      // Burst at each cleared cell — reuse fullRow scan.
      // Simpler: burst at hover cell + scaled by group count.
      burstAt(hoverCell.row, hoverCell.col, colA, Math.min(40, r.cleared * 2));
      const groups = r.rowsCleared + r.colsCleared + r.squaresCleared;
      if (groups >= 3) {
        pushToast('Triple Clear!', 'triple');
        setShake((n) => n + 1);
      } else if (r.comboHit) {
        pushToast(`Combo ×${world.combo}`, 'combo');
      }
    }
    if (isPerfectClear(world)) {
      pushToast('Perfect Clear!', 'perfect');
      setConfettiTrigger((n) => n + 1);
      sfx.play('success');
      // Reward bonus
      world.score += 200;
    }
    // Force a re-render via cloned state object (engine mutates in place).
    setWorld({ ...world, board: world.board.map((r) => [...r]), bag: [...world.bag] });
    setDragging(null);
    setHoverCell(null);
  }

  // Pre-compute cells the shape would land on, for the ghost preview.
  const ghostCells = useMemo(() => {
    if (!dragging || !hoverCell) return null;
    const cells = dragging.shape.map(([dr, dc]) => [hoverCell.row + dr, hoverCell.col + dc] as const);
    const valid = canPlace(world.board, dragging.shape, hoverCell.row, hoverCell.col);
    return { cells, valid };
  }, [dragging, hoverCell, world.board]);

  const [primaryColour, secondaryColour] = colourForLevel(world.level);

  return (
    <main className="app">
      <header className="head">
        <div>
          <h1 style={{ color: primaryColour }}>Block Drop</h1>
          <p className="muted small">
            {mode === 'daily' ? `Daily · ${todayKey().slice(5)}` : 'Endless'} · L{world.level} · {world.score} pts
            {world.combo > 1 ? <span className="combo-chip">×{world.combo}</span> : null}
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
        <button type="button" className={mode === 'endless' ? 'tab active' : 'tab'} onClick={() => startGame('endless')}>Endless</button>
        <button type="button" className={mode === 'daily' ? 'tab active' : 'tab'} onClick={() => startGame('daily')}>Daily</button>
      </section>

      <div
        ref={boardRef}
        className={`board${shake ? ' shake-once' : ''}`}
        key={`shake-${shake}`}
        style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gridTemplateRows: `repeat(${SIZE}, 1fr)` }}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
      >
        <canvas ref={particlesCanvasRef} className="fx-canvas" aria-hidden />
        {world.board.flatMap((row, r) =>
          row.map((v, c) => {
            const isGhost = ghostCells?.cells.some(([gr, gc]) => gr === r && gc === c);
            const ghostValid = ghostCells?.valid;
            return (
              <span
                key={`${r}-${c}`}
                className={`cell${v === 1 ? ' filled' : ''}${isGhost ? (ghostValid ? ' ghost-valid' : ' ghost-invalid') : ''}`}
                style={v === 1 ? { background: primaryColour, boxShadow: `inset 0 -3px 0 rgba(0,0,0,0.18), inset 0 1px 0 ${secondaryColour}` } : undefined}
              />
            );
          })
        )}
      </div>

      <section className="bag">
        {world.bag.map((s, i) => (
          <button
            key={i}
            type="button"
            className={`bag-tile${dragging?.bagIndex === i ? ' picked' : ''}${!s ? ' empty' : ''}`}
            onPointerDown={(e) => pickFromBag(i as 0 | 1 | 2, e)}
            disabled={!s}
            aria-label={`Shape slot ${i + 1}`}
          >
            {s ? <ShapePreview shape={s} colour={primaryColour} /> : null}
          </button>
        ))}
      </section>

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.flavour}`}>{t.text}</div>
        ))}
      </div>

      {world.state === 'over' ? (
        <section className="overlay">
          <p className="finish-line">Out of moves · {world.score} pts</p>
          <p className="muted small">Best: {stored.bestScore} pts</p>
          <button type="button" className="primary" onClick={() => startGame(mode)}>Play again</button>
        </section>
      ) : null}

      <Confetti trigger={confettiTrigger} />
    </main>
  );
}

function ShapePreview({ shape, colour }: { shape: Shape; colour: string }) {
  const maxR = Math.max(...shape.map((c) => c[0])) + 1;
  const maxC = Math.max(...shape.map((c) => c[1])) + 1;
  return (
    <span
      className="shape-preview"
      style={{
        gridTemplateColumns: `repeat(${maxC}, 1fr)`,
        gridTemplateRows: `repeat(${maxR}, 1fr)`,
      }}
    >
      {Array.from({ length: maxR }).map((_, r) =>
        Array.from({ length: maxC }).map((_, c) => {
          const filled = shape.some(([sr, sc]) => sr === r && sc === c);
          return <span key={`${r}-${c}`} className="shape-cell" style={{ background: filled ? colour : 'transparent' }} />;
        })
      )}
    </span>
  );
}
