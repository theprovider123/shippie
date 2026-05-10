import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { createSoundBank, isMuted, toggleMuted, Particles } from '@shippie/juice';
import { ARCADE_SAMPLES } from '@shippie/juice/samples';
import {
  CAMPAIGN_LEVELS,
  COLORS_HEX,
  SIZE,
  adjacent,
  applyGravity,
  cloneBoard,
  clearCells,
  dailySeed,
  expandSpecial,
  findMatches,
  levelTarget,
  makeBoard,
  promoteSpecials,
  refillBoard,
  scoreClear,
  setBoardSeed,
  swap,
  todayKey,
  type Board,
  type Special,
} from './match3';

const sfx = createSoundBank({
  tap: ARCADE_SAMPLES.tap,
  pop: ARCADE_SAMPLES.pop,
  whoosh: ARCADE_SAMPLES.whoosh,
  bing: ARCADE_SAMPLES.bing,
  success: ARCADE_SAMPLES.success,
  fail: ARCADE_SAMPLES.fail,
  levelUp: ARCADE_SAMPLES.levelUp,
});

interface ScoreFloat { id: number; r: number; c: number; value: number; }

/**
 * Lustre — match-3 with cascade physics.
 *
 * Three modes:
 *   - Campaign: 60 hand-tuned levels with score targets + move limits.
 *   - Endless: free play, no limits.
 *   - Daily: deterministic seeded board for today's date, single
 *     attempt per day, share-your-score (no leaderboard).
 *
 * Cascade FSM:
 *   IDLE → SWAPPING → MATCHING → CLEARING → DROPPING → REFILLING
 *      ↑________________________________________________________|
 *   The App schedules each step on a setTimeout so the player sees
 *   the cascade progress (otherwise everything would resolve in one
 *   render frame and feel cheap).
 */

const sdk = createShippieIframeSdk({ appId: 'app_lustre' });
const observations = createObservationClient(sdk);

const STORAGE_KEY = 'shippie:lustre:v1';

type Mode = 'campaign' | 'endless' | 'daily';

interface Progress {
  campaignLevel: number;
  bestScore: number;
  totalRuns: number;
  dailyDone: string | null; // YYYY-MM-DD of last completed daily
  dailyScore: number;
}

function loadProgress(): Progress {
  if (typeof localStorage === 'undefined')
    return { campaignLevel: 1, bestScore: 0, totalRuns: 0, dailyDone: null, dailyScore: 0 };
  try {
    return { campaignLevel: 1, bestScore: 0, totalRuns: 0, dailyDone: null, dailyScore: 0, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return { campaignLevel: 1, bestScore: 0, totalRuns: 0, dailyDone: null, dailyScore: 0 };
  }
}
function saveProgress(p: Progress) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {/**/}
}

type Step = 'idle' | 'swapping' | 'cascading';
const STEP_DELAY_MS = 220;

export function App() {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [mode, setMode] = useState<Mode>('campaign');
  const [levelN, setLevelN] = useState(1);
  const [board, setBoard] = useState<Board>(() => {
    setBoardSeed(`lustre-init-${Date.now()}`);
    return makeBoard();
  });
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [score, setScore] = useState(0);
  const [movesLeft, setMovesLeft] = useState(35);
  const [step, setStep] = useState<Step>('idle');
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [done, setDone] = useState<'win' | 'lose' | null>(null);
  const [muted, setMutedState] = useState(() => isMuted());
  const [scoreFloats, setScoreFloats] = useState<ScoreFloat[]>([]);
  const [comboBanner, setComboBanner] = useState<{ id: number; n: number } | null>(null);
  const [announce, setAnnounce] = useState<{ id: number; text: string } | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const cascadeDepthRef = useRef(0);
  const floatIdRef = useRef(0);
  const particlesRef = useRef<Particles | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { saveProgress(progress); }, [progress]);

  // Mount the canvas particle system once.
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

  const burstAt = (r: number, c: number, color: string) => {
    const grid = gridRef.current;
    const canvas = fxCanvasRef.current;
    if (!grid || !canvas || !particlesRef.current) return;
    const gridRect = grid.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const cellW = gridRect.width / SIZE;
    const cellH = gridRect.height / SIZE;
    const x = gridRect.left - canvasRect.left + cellW * c + cellW / 2;
    const y = gridRect.top - canvasRect.top + cellH * r + cellH / 2;
    particlesRef.current.emit({ x, y, count: 10, colour: color, kind: 'burst', speed: 1.2, lifetimeMs: 700 });
  };

  const pushScoreFloat = (r: number, c: number, value: number) => {
    const id = ++floatIdRef.current;
    setScoreFloats((prev) => [...prev, { id, r, c, value }]);
    window.setTimeout(() => setScoreFloats((prev) => prev.filter((f) => f.id !== id)), 700);
  };

  const target = useMemo(() => mode === 'campaign' ? levelTarget(levelN) : { scoreTarget: Number.MAX_SAFE_INTEGER, movesAllowed: 0 }, [mode, levelN]);

  const newRun = useCallback((m: Mode, lvl = 1) => {
    if (m === 'daily') {
      setBoardSeed(dailySeed(todayKey()));
    } else if (m === 'campaign') {
      setBoardSeed(`lustre-l${lvl}-v1`);
    } else {
      setBoardSeed(`lustre-endless-${Date.now()}`);
    }
    const fresh = makeBoard();
    setBoard(fresh);
    setMode(m);
    setLevelN(lvl);
    setScore(0);
    setMovesLeft(m === 'campaign' ? levelTarget(lvl).movesAllowed : m === 'daily' ? 30 : Number.MAX_SAFE_INTEGER);
    setStep('idle');
    setDone(null);
    setSelected(null);
  }, []);

  // Cascade ticker — runs whenever step is 'cascading'.
  useEffect(() => {
    if (step !== 'cascading') return;
    const id = window.setTimeout(() => {
      setBoard((prev) => {
        const next = cloneBoard(prev);
        const matches = findMatches(next);
        if (matches.length === 0) {
          setStep('idle');
          cascadeDepthRef.current = 0;
          const newScore = score;
          if (mode === 'campaign' && newScore >= target.scoreTarget) {
            setDone('win');
            haptic('success');
            sfx.play('levelUp');
            const nextLvl = Math.min(CAMPAIGN_LEVELS, levelN + 1);
            setProgress((p) => ({ ...p, campaignLevel: Math.max(p.campaignLevel, nextLvl), bestScore: Math.max(p.bestScore, newScore), totalRuns: p.totalRuns + 1 }));
            observations.emit({
              kind: 'game.completed',
              game: 'lustre',
              result: `campaign-l${levelN}/${newScore}`,
              at: new Date().toISOString(),
            });
          } else if (movesLeft <= 0 && mode === 'campaign') {
            setDone('lose');
            haptic('error');
            sfx.play('fail');
          }
          return next;
        }
        cascadeDepthRef.current += 1;
        const depth = cascadeDepthRef.current;
        const promotions = promoteSpecials(matches, null);
        let added = 0;
        for (const g of matches) added += scoreClear(g);
        setScore((s) => s + added);
        haptic('tap');
        // Audio + visual juice per match group.
        for (const g of matches) {
          const baseValue = scoreClear(g);
          // Slightly higher pitch each cascade level for the "rising"
          // feel of a match-3 chain.
          const pitch = Math.min(1.6, 0.95 + depth * 0.08);
          sfx.play(g.length >= 4 ? 'bing' : 'pop', { pitch, volume: 0.6 });
          // Particle burst at each cleared cell, scaled-up by length.
          for (const cell of g.cells) {
            const colour = COLORS_HEX[next[cell.r]![cell.c]!.color] ?? '#fff';
            burstAt(cell.r, cell.c, colour);
          }
          // One float per group, anchored at its centre.
          const centre = g.cells[Math.floor(g.cells.length / 2)]!;
          pushScoreFloat(centre.r, centre.c, baseValue);
        }
        if (depth >= 2) {
          const banner = { id: ++floatIdRef.current, n: depth };
          setComboBanner(banner);
          window.setTimeout(() => setComboBanner((b) => (b?.id === banner.id ? null : b)), 1000);
        }
        // Cascade announcer + screen-shake on big chains.
        if (depth === 2) setAnnounce({ id: ++floatIdRef.current, text: 'Sweet!' });
        else if (depth === 3) setAnnounce({ id: ++floatIdRef.current, text: 'Delicious!' });
        else if (depth === 4) setAnnounce({ id: ++floatIdRef.current, text: 'Tasty!' });
        else if (depth >= 5) setAnnounce({ id: ++floatIdRef.current, text: depth >= 7 ? 'Divine!' : 'Outstanding!' });
        if (depth >= 3) setShakeKey((n) => n + 1);
        const promotionSet = new Set(promotions.map((p) => `${p.r},${p.c}`));
        const toClear: Array<{ r: number; c: number }> = [];
        for (const g of matches) {
          for (const cell of g.cells) {
            if (!promotionSet.has(`${cell.r},${cell.c}`)) toClear.push(cell);
          }
        }
        clearCells(next, toClear);
        for (const p of promotions) {
          if (next[p.r]?.[p.c]) {
            next[p.r]![p.c] = { ...next[p.r]![p.c]!, special: p.special as Special };
          }
        }
        applyGravity(next);
        refillBoard(next);
        return next;
      });
    }, STEP_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [step, mode, target, levelN, score, movesLeft]);

  const tap = (r: number, c: number) => {
    if (step !== 'idle' || done) return;
    if (!selected) {
      setSelected({ r, c });
      return;
    }
    if (selected.r === r && selected.c === c) {
      setSelected(null);
      return;
    }
    if (!adjacent(selected, { r, c })) {
      setSelected({ r, c });
      return;
    }
    // Try the swap.
    const cell = board[r]![c]!;
    if (cell.special !== 'none' || board[selected.r]![selected.c]!.special !== 'none') {
      const next = cloneBoard(board);
      swap(next, selected, { r, c });
      const origin = next[r]![c]!.special !== 'none' ? { r, c } : selected;
      const blasted = expandSpecial(next, origin);
      // Particle burst per blasted cell BEFORE clearing.
      for (const cell of blasted) {
        const colour = COLORS_HEX[next[cell.r]![cell.c]!.color] ?? '#fff';
        burstAt(cell.r, cell.c, colour);
      }
      clearCells(next, blasted);
      const added = blasted.length * 15;
      setScore((s) => s + added);
      pushScoreFloat(origin.r, origin.c, added);
      applyGravity(next);
      refillBoard(next);
      setBoard(next);
      setMovesLeft((m) => m - 1);
      setSelected(null);
      setStep('cascading');
      haptic('success');
      sfx.play('whoosh');
      return;
    }
    const candidate = cloneBoard(board);
    swap(candidate, selected, { r, c });
    const matches = findMatches(candidate);
    if (matches.length === 0) {
      haptic('error');
      sfx.play('fail', { volume: 0.5 });
      setSelected(null);
      return;
    }
    sfx.play('tap', { pitch: 1.2 });
    setBoard(candidate);
    setMovesLeft((m) => m - 1);
    setSelected(null);
    setStep('cascading');
  };

  const share = async () => {
    const text = `Lustre · ${mode === 'campaign' ? `level ${levelN}` : mode} · ${score} pts\nshippie.app/run/lustre/`;
    const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
    try {
      if (typeof nav.share === 'function') await nav.share({ text });
      else await navigator.clipboard.writeText(text);
      setShareNote('Shared');
    } catch {
      try { await navigator.clipboard.writeText(text); setShareNote('Copied'); }
      catch { setShareNote('Share unavailable'); }
    }
    window.setTimeout(() => setShareNote(null), 2000);
  };

  return (
    <main className="app">
      <header className="head">
        <div>
          <h1>Lustre</h1>
          <p className="muted small">
            {mode === 'campaign' ? `Level ${levelN} · target ${target.scoreTarget}` : mode === 'daily' ? `Daily · ${todayKey()}` : 'Endless'}
            {' · '}{score} pts · {movesLeft === Number.MAX_SAFE_INTEGER ? '∞' : movesLeft} moves
          </p>
        </div>
        <button type="button" className="ghost" onClick={() => setMutedState(toggleMuted())} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? '🔇' : '🔊'}
        </button>
      </header>

      <section className="mode-row">
        {(['campaign', 'endless', 'daily'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={m === mode ? 'tab active' : 'tab'}
            onClick={() => newRun(m, m === 'campaign' ? progress.campaignLevel : 1)}
          >
            {m}
          </button>
        ))}
      </section>

      <div className={`grid-wrap${shakeKey ? ' shake-once' : ''}`} key={`shake-${shakeKey}`}>
        <canvas ref={fxCanvasRef} className="fx-canvas" aria-hidden />
        <section className="grid" aria-label="Match-3 grid" ref={gridRef}>
          {board.map((row, r) =>
            row.map((cell, c) => {
              const isSelected = selected?.r === r && selected?.c === c;
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  className={`gem${isSelected ? ' selected' : ''}${cell.special !== 'none' ? ` special special-${cell.special}` : ''}`}
                  style={{ background: cell.color === -1 ? 'transparent' : COLORS_HEX[cell.color] }}
                  onClick={() => tap(r, c)}
                  aria-label={`Gem at ${r},${c}`}
                >
                  {cell.special === 'bomb' ? '✦' : cell.special === 'rainbow' ? '✺' : cell.special === 'flame' ? '◆' : ''}
                </button>
              );
            }),
          )}
          {scoreFloats.map((f) => (
            <span
              key={f.id}
              className="score-float"
              style={{
                left: `${(f.c / SIZE) * 100}%`,
                top: `${(f.r / SIZE) * 100}%`,
                width: `${100 / SIZE}%`,
                height: `${100 / SIZE}%`,
              }}
            >
              +{f.value}
            </span>
          ))}
        </section>

        {comboBanner ? (
          <div key={comboBanner.id} className="combo-banner" aria-live="polite">
            Combo ×{comboBanner.n}!
          </div>
        ) : null}
        {announce ? (
          <div key={announce.id} className="cascade-announce" aria-live="polite">{announce.text}</div>
        ) : null}
      </div>

      {done ? (
        <section className="overlay" aria-live="polite">
          <p className="finish-line">{done === 'win' ? `🎉 Cleared! ${score} pts` : `Out of moves · ${score} pts`}</p>
          <div className="row-actions">
            <button type="button" className="primary" onClick={() => newRun(mode, mode === 'campaign' ? Math.min(CAMPAIGN_LEVELS, levelN + (done === 'win' ? 1 : 0)) : 1)}>
              {done === 'win' ? (mode === 'campaign' ? 'Next level' : 'Play again') : 'Try again'}
            </button>
            <button type="button" className="ghost" onClick={share}>Share</button>
          </div>
          {shareNote ? <p className="muted small">{shareNote}</p> : null}
        </section>
      ) : null}

      <footer className="footer">
        <span className="muted small">Best {progress.bestScore} pts · campaign reached lvl {progress.campaignLevel}</span>
      </footer>
    </main>
  );
}
