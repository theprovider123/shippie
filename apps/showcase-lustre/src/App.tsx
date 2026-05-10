import { useCallback, useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
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

  useEffect(() => { saveProgress(progress); }, [progress]);

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
          // Stable — return to idle.
          setStep('idle');
          // Check win/lose conditions.
          const newScore = score; // already updated in the previous cycles
          if (mode === 'campaign' && newScore >= target.scoreTarget) {
            setDone('win');
            haptic('success');
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
          }
          return next;
        }
        // Promote specials.
        const promotions = promoteSpecials(matches, null);
        // Score additions.
        let added = 0;
        for (const g of matches) added += scoreClear(g);
        setScore((s) => s + added);
        haptic('tap');
        // Clear matched cells (but skip cells that become specials).
        const promotionSet = new Set(promotions.map((p) => `${p.r},${p.c}`));
        const toClear: Array<{ r: number; c: number }> = [];
        for (const g of matches) {
          for (const cell of g.cells) {
            if (!promotionSet.has(`${cell.r},${cell.c}`)) toClear.push(cell);
          }
        }
        clearCells(next, toClear);
        // Apply special promotions on top of remaining cells.
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
      // Triggering a special — clear its expansion + cascade.
      const next = cloneBoard(board);
      swap(next, selected, { r, c });
      const origin = next[r]![c]!.special !== 'none' ? { r, c } : selected;
      const blasted = expandSpecial(next, origin);
      clearCells(next, blasted);
      let added = blasted.length * 15;
      setScore((s) => s + added);
      applyGravity(next);
      refillBoard(next);
      setBoard(next);
      setMovesLeft((m) => m - 1);
      setSelected(null);
      setStep('cascading');
      haptic('success');
      return;
    }
    const candidate = cloneBoard(board);
    swap(candidate, selected, { r, c });
    const matches = findMatches(candidate);
    if (matches.length === 0) {
      // Reverse — invalid swap.
      haptic('error');
      setSelected(null);
      return;
    }
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

      <section className="grid" aria-label="Match-3 grid">
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
      </section>

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
