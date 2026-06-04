import { useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { generatePuzzle, isValidPlacement, type Board, type Difficulty } from './sudoku';
import {
  dailySeed,
  loadSave,
  mulberry32,
  puzzleId,
  rollStreak,
  shareResult,
  todayKeyUTC,
  writeSave,
} from './daily';

/**
 * Sudoku — algorithmic, infinite content, now with a daily board.
 *
 * Daily mode plays the same UTC-seeded puzzle for everyone, saves/resumes
 * in-progress state across reloads, and tracks a streak. Free mode keeps the
 * infinite random generator. No ads, no IAP, no nags.
 */

const sdk = createShippieIframeSdk({ appId: 'app_sudoku' });
const observations = createObservationClient(sdk);

type Mode = 'daily' | 'free';
const DAILY_DIFF: Difficulty = 'medium';
const SAVE_KEY = 'sudoku.daily.v1';
const STREAK_KEY = 'sudoku.streak.v1';

type Pencils = Record<number, Set<number>>;
interface DailyPayload {
  board: Board;
  pencils: Record<number, number[]>;
  hintsLeft: number;
  startedAt: number;
  hintsUsed: number;
}
interface StreakStore {
  completedDates: string[];
  best: number;
}

interface Round {
  puzzle: Board;
  solution: Board;
  given: boolean[];
}
interface Setup {
  round: Round;
  board: Board;
  pencils: Pencils;
  hintsLeft: number;
  hintsUsed: number;
  startedAt: number;
  pid: string | null;
}

function serializePencils(p: Pencils): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (const [k, v] of Object.entries(p)) out[+k] = [...v];
  return out;
}
function deserializePencils(p: Record<number, number[]>): Pencils {
  const out: Pencils = {};
  for (const [k, v] of Object.entries(p)) out[+k] = new Set(v);
  return out;
}

function buildSetup(mode: Mode, diff: Difficulty): Setup {
  if (mode === 'daily') {
    const date = todayKeyUTC();
    const pid = puzzleId('sudoku', date);
    const { puzzle, solution } = generatePuzzle(DAILY_DIFF, mulberry32(dailySeed('sudoku', date)));
    const given = puzzle.map((v) => v !== 0);
    const saved = loadSave<DailyPayload>(SAVE_KEY);
    if (saved && saved.puzzleId === pid && Array.isArray(saved.payload.board) && saved.payload.board.length === 81) {
      const p = saved.payload;
      return {
        round: { puzzle, solution, given },
        board: p.board,
        pencils: deserializePencils(p.pencils ?? {}),
        hintsLeft: p.hintsLeft ?? 3,
        hintsUsed: p.hintsUsed ?? 0,
        startedAt: p.startedAt ?? Date.now(),
        pid,
      };
    }
    return { round: { puzzle, solution, given }, board: puzzle, pencils: {}, hintsLeft: 3, hintsUsed: 0, startedAt: Date.now(), pid };
  }
  const { puzzle, solution } = generatePuzzle(diff);
  const given = puzzle.map((v) => v !== 0);
  return { round: { puzzle, solution, given }, board: puzzle, pencils: {}, hintsLeft: 3, hintsUsed: 0, startedAt: Date.now(), pid: null };
}

function loadStreak(): StreakStore {
  const s = loadSave<StreakStore>(STREAK_KEY);
  // streak is stored under the same DailySave envelope for reuse; payload holds the store
  if (s && Array.isArray(s.payload?.completedDates)) return s.payload;
  return { completedDates: [], best: 0 };
}

export function App() {
  const [mode, setMode] = useState<Mode>('daily');
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [setup, setSetup] = useState<Setup>(() => buildSetup('daily', 'medium'));
  const { round, pid } = setup;
  const { puzzle, solution, given } = round;

  const [board, setBoard] = useState<Board>(() => setup.board);
  const [selected, setSelected] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number>(() => setup.startedAt);
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const [pencilMode, setPencilMode] = useState(false);
  const [pencils, setPencils] = useState<Pencils>(() => setup.pencils);
  const [hintsLeft, setHintsLeft] = useState(() => setup.hintsLeft);
  const [hintsUsed, setHintsUsed] = useState(() => setup.hintsUsed);
  const [history, setHistory] = useState<Array<{ board: Board; pencils: Pencils }>>([]);
  const [streak, setStreak] = useState<StreakStore>(() => loadStreak());
  const [shared, setShared] = useState(false);
  const streakView = useMemo(() => rollStreak(streak.completedDates, todayKeyUTC()), [streak]);

  const conflicts = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < board.length; i++) {
      const v = board[i]!;
      if (v === 0) continue;
      if (!isValidPlacement(board, i, v)) set.add(i);
    }
    return set;
  }, [board]);

  const filled = useMemo(() => board.every((v) => v !== 0), [board]);
  const solved = filled && conflicts.size === 0;

  // Persist in-progress daily state on every change so a reload resumes.
  const restoring = useRef(true);
  useEffect(() => {
    if (restoring.current) { restoring.current = false; return; }
    if (mode !== 'daily' || pid === null || doneAt !== null) return;
    writeSave<DailyPayload>(SAVE_KEY, {
      puzzleId: pid,
      payloadVersion: 1,
      payload: { board, pencils: serializePencils(pencils), hintsLeft, hintsUsed, startedAt },
    });
  }, [board, pencils, hintsLeft, hintsUsed, startedAt, mode, pid, doneAt]);

  useEffect(() => {
    if (solved && doneAt === null) {
      const dur = Date.now() - startedAt;
      setDoneAt(Date.now());
      haptic('success');
      const isDaily = mode === 'daily' && pid !== null;
      observations.emit({
        kind: 'game.completed',
        game: 'sudoku',
        result: isDaily ? `daily/${Math.round(dur / 1000)}s` : `${diff}/${Math.round(dur / 1000)}s`,
        puzzleId: isDaily ? pid : undefined,
        at: new Date().toISOString(),
      });
      if (isDaily) {
        const today = todayKeyUTC();
        setStreak((prev) => {
          if (prev.completedDates.includes(today)) return prev;
          const completedDates = [...prev.completedDates, today].slice(-400);
          const rolled = rollStreak(completedDates, today);
          const next = { completedDates, best: Math.max(prev.best, rolled.best) };
          writeSave<StreakStore>(STREAK_KEY, { puzzleId: STREAK_KEY, payloadVersion: 1, payload: next });
          return next;
        });
      }
    }
  }, [solved, doneAt, diff, startedAt, mode, pid]);

  function applySetup(next: Setup, nextMode: Mode) {
    restoring.current = true;
    setSetup(next);
    setBoard(next.board);
    setSelected(null);
    setStartedAt(next.startedAt);
    setDoneAt(null);
    setPencils(next.pencils);
    setHintsLeft(next.hintsLeft);
    setHintsUsed(next.hintsUsed);
    setHistory([]);
    setShared(false);
    setMode(nextMode);
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    haptic('tap');
    applySetup(buildSetup(next, diff), next);
  }

  function newGame(d: Difficulty = diff) {
    // Only meaningful in free play; daily always shows today's puzzle.
    setDiff(d);
    applySetup(buildSetup('free', d), 'free');
  }

  function place(value: number) {
    if (selected === null) return;
    if (given[selected]) return;
    haptic('tap');
    setHistory((h) => [...h, { board: [...board], pencils: clonePencils(pencils) }].slice(-30));
    if (pencilMode && value !== 0) {
      setPencils((p) => {
        const next = clonePencils(p);
        const set = next[selected!] ?? new Set<number>();
        if (set.has(value)) set.delete(value); else set.add(value);
        next[selected!] = set;
        return next;
      });
    } else {
      setBoard((b) => b.map((v, i) => (i === selected ? value : v)));
      setPencils((p) => {
        if (!p[selected!]) return p;
        const next = clonePencils(p);
        delete next[selected!];
        return next;
      });
    }
  }

  function undo() {
    setHistory((h) => {
      const last = h[h.length - 1];
      if (!last) return h;
      setBoard(last.board);
      setPencils(last.pencils);
      return h.slice(0, -1);
    });
  }

  function useHint() {
    if (selected === null || hintsLeft <= 0) return;
    if (given[selected]) return;
    const correct = solution[selected]!;
    if (correct === 0) return;
    setHistory((h) => [...h, { board: [...board], pencils: clonePencils(pencils) }].slice(-30));
    setBoard((b) => b.map((v, i) => (i === selected ? correct : v)));
    setPencils((p) => {
      if (!p[selected!]) return p;
      const next = clonePencils(p);
      delete next[selected!];
      return next;
    });
    setHintsLeft((n) => n - 1);
    setHintsUsed((n) => n + 1);
    haptic('success');
  }

  async function share() {
    if (pid === null || doneAt === null) return;
    const text = shareResult({ puzzleId: pid, seconds: Math.round((doneAt - startedAt) / 1000), hintsUsed });
    try {
      if (typeof navigator !== 'undefined' && navigator.share) await navigator.share({ text });
      else if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(text);
      setShared(true);
    } catch {
      /* user dismissed share — no-op */
    }
  }

  return (
    <main className="app">
      <header className="head">
        <div>
          <h1>Sudoku</h1>
          <p className="muted small">{mode === 'daily' ? "today's puzzle · same for everyone" : `${diff} · no ads, no IAP, ever`}</p>
        </div>
        {streakView.current > 0 ? (
          <span className="streak" title={`Best ${streakView.best}`}>🔥 {streakView.current}</span>
        ) : null}
      </header>

      <section className="mode-row">
        <button type="button" className={mode === 'daily' ? 'tab active' : 'tab'} onClick={() => switchMode('daily')}>Daily</button>
        <button type="button" className={mode === 'free' ? 'tab active' : 'tab'} onClick={() => switchMode('free')}>Free play</button>
      </section>

      {mode === 'free' ? (
        <section className="diff-row">
          {(['easy', 'medium', 'hard'] as const).map((d) => (
            <button key={d} type="button" className={d === diff ? 'tab active' : 'tab'} onClick={() => newGame(d)}>{d}</button>
          ))}
        </section>
      ) : null}

      <section className="board">
        {board.map((value, idx) => {
          const isGiven = given[idx];
          const isSelected = selected === idx;
          const inConflict = conflicts.has(idx);
          const row = Math.floor(idx / 9);
          const col = idx % 9;
          const thickRight = (col + 1) % 3 === 0 && col !== 8;
          const thickBottom = (row + 1) % 3 === 0 && row !== 8;
          const sameAxis = selected !== null && (Math.floor(selected / 9) === row || (selected % 9) === col || (Math.floor(selected / 27) === Math.floor(row / 3) && Math.floor((selected % 9) / 3) === Math.floor(col / 3)));
          const sameValue = selected !== null && value !== 0 && board[selected] === value;
          const cellPencils = pencils[idx];
          return (
            <button
              key={idx}
              type="button"
              className={['cell', isGiven ? 'given' : 'editable', isSelected ? 'selected' : '', sameAxis && !isSelected ? 'same-axis' : '', sameValue && !isSelected ? 'same-value' : '', inConflict ? 'conflict' : '', thickRight ? 'thick-r' : '', thickBottom ? 'thick-b' : ''].filter(Boolean).join(' ')}
              onClick={() => setSelected(idx)}
              aria-label={`Row ${row + 1} col ${col + 1}, ${value === 0 ? 'empty' : value}`}
            >
              {value !== 0 ? value : cellPencils && cellPencils.size > 0 ? (
                <span className="pencils">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <span key={n} className="pencil-cell">{cellPencils.has(n) ? n : ''}</span>
                  ))}
                </span>
              ) : ''}
            </button>
          );
        })}
      </section>

      <section className="actions-row">
        <button type="button" className={`tab${pencilMode ? ' active' : ''}`} onClick={() => setPencilMode((p) => !p)} aria-pressed={pencilMode}>✏ Pencil</button>
        <button type="button" className="tab" onClick={undo} disabled={history.length === 0}>↶ Undo</button>
        <button type="button" className="tab" onClick={useHint} disabled={selected === null || given[selected] || hintsLeft <= 0}>💡 Hint ({hintsLeft})</button>
      </section>

      <section className="pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} type="button" className="pad-btn" onClick={() => place(n)} disabled={selected === null || given[selected]}>{n}</button>
        ))}
        <button type="button" className="pad-btn erase" onClick={() => place(0)} disabled={selected === null || given[selected]}>×</button>
      </section>

      {solved ? (
        <section className="done" aria-live="polite">
          <p className="finish-line">Solved{mode === 'daily' ? ` · 🔥 ${streakView.current} day streak` : ''}.</p>
          {mode === 'daily' ? (
            <button type="button" className="primary" onClick={share}>{shared ? 'Shared ✓' : 'Share result'}</button>
          ) : (
            <button type="button" className="primary" onClick={() => newGame()}>Another</button>
          )}
        </section>
      ) : null}

      <footer className="footer">
        <a className="muted small" href="https://github.com/devanteprov/shippie/tree/main/apps/showcase-sudoku" target="_blank" rel="noreferrer">Source</a>
        <span className="muted small">{mode === 'daily' ? todayKeyUTC() : `solution ${solution[0]}…`}</span>
      </footer>
    </main>
  );
}

function clonePencils(p: Pencils): Pencils {
  const out: Pencils = {};
  for (const [k, v] of Object.entries(p)) out[+k] = new Set(v);
  return out;
}
