import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { generatePuzzle, isValidPlacement, type Board, type Difficulty } from './sudoku';

/**
 * Sudoku — algorithmic, infinite content. Tap a cell, tap a digit.
 *
 * No ads, no IAP, no nags. Source visible via the link in the footer.
 * The on-board solver handles uniqueness when generating; the in-game
 * "valid" check uses the row/col/box rule directly so wrong moves are
 * flagged as you place them.
 */

const sdk = createShippieIframeSdk({ appId: 'app_sudoku' });
const observations = createObservationClient(sdk);

export function App() {
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [{ puzzle, solution, given }, setRound] = useState(() => initRound(diff));
  const [board, setBoard] = useState<Board>(() => puzzle);
  const [selected, setSelected] = useState<number | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [doneAt, setDoneAt] = useState<number | null>(null);
  // Pencil marks: per cell a Set of candidate digits (1-9). Toggled
  // by long-press / pencil-mode + digit pad.
  const [pencilMode, setPencilMode] = useState(false);
  const [pencils, setPencils] = useState<Record<number, Set<number>>>({});
  const [hintsLeft, setHintsLeft] = useState(3);
  const [history, setHistory] = useState<Array<{ board: Board; pencils: Record<number, Set<number>> }>>([]);

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

  useEffect(() => {
    if (solved && doneAt === null) {
      const dur = Date.now() - startedAt;
      setDoneAt(Date.now());
      haptic('success');
      observations.emit({
        kind: 'game.completed',
        game: 'sudoku',
        result: `${diff}/${Math.round(dur / 1000)}s`,
        at: new Date().toISOString(),
      });
    }
  }, [solved, doneAt, diff, startedAt]);

  function newGame(d: Difficulty = diff) {
    setDiff(d);
    const round = initRound(d);
    setRound(round);
    setBoard(round.puzzle);
    setSelected(null);
    setDoneAt(null);
    setPencils({});
    setHintsLeft(3);
    setHistory([]);
  }

  function place(value: number) {
    if (selected === null) return;
    if (given[selected]) return;
    haptic('tap');
    // Snapshot for undo before mutating.
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
      setBoard((b) => b.map((v, i) => i === selected ? value : v));
      // Clear pencil marks for this cell when committing a number.
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
    setBoard((b) => b.map((v, i) => i === selected ? correct : v));
    setPencils((p) => {
      if (!p[selected!]) return p;
      const next = clonePencils(p);
      delete next[selected!];
      return next;
    });
    setHintsLeft((n) => n - 1);
    haptic('success');
  }

  return (
    <main className="app">
      <header className="head">
        <div>
          <h1>Sudoku</h1>
          <p className="muted small">{diff} · no ads, no IAP, ever</p>
        </div>
        <button type="button" className="ghost" onClick={() => newGame()}>New</button>
      </header>

      <section className="diff-row">
        {(['easy', 'medium', 'hard'] as const).map((d) => (
          <button
            key={d}
            type="button"
            className={d === diff ? 'tab active' : 'tab'}
            onClick={() => newGame(d)}
          >
            {d}
          </button>
        ))}
      </section>

      <section className="board">
        {board.map((value, idx) => {
          const isGiven = given[idx];
          const isSelected = selected === idx;
          const inConflict = conflicts.has(idx);
          const row = Math.floor(idx / 9);
          const col = idx % 9;
          const thickRight = (col + 1) % 3 === 0 && col !== 8;
          const thickBottom = (row + 1) % 3 === 0 && row !== 8;
          // Highlight cells in the same row/col/box as selected.
          const sameAxis = selected !== null && (Math.floor(selected / 9) === row || (selected % 9) === col || (Math.floor(selected / 27) === Math.floor(row / 3) && Math.floor((selected % 9) / 3) === Math.floor(col / 3)));
          const sameValue = selected !== null && value !== 0 && board[selected] === value;
          const cellPencils = pencils[idx];
          return (
            <button
              key={idx}
              type="button"
              className={[
                'cell',
                isGiven ? 'given' : 'editable',
                isSelected ? 'selected' : '',
                sameAxis && !isSelected ? 'same-axis' : '',
                sameValue && !isSelected ? 'same-value' : '',
                inConflict ? 'conflict' : '',
                thickRight ? 'thick-r' : '',
                thickBottom ? 'thick-b' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setSelected(idx)}
              aria-label={`Row ${row + 1} col ${col + 1}, ${value === 0 ? 'empty' : value}`}
            >
              {value !== 0 ? value : cellPencils && cellPencils.size > 0 ? (
                <span className="pencils">
                  {[1,2,3,4,5,6,7,8,9].map((n) => (
                    <span key={n} className="pencil-cell">{cellPencils.has(n) ? n : ''}</span>
                  ))}
                </span>
              ) : ''}
            </button>
          );
        })}
      </section>

      <section className="actions-row">
        <button
          type="button"
          className={`tab${pencilMode ? ' active' : ''}`}
          onClick={() => setPencilMode((p) => !p)}
          aria-pressed={pencilMode}
        >✏ Pencil</button>
        <button
          type="button"
          className="tab"
          onClick={undo}
          disabled={history.length === 0}
        >↶ Undo</button>
        <button
          type="button"
          className="tab"
          onClick={useHint}
          disabled={selected === null || given[selected] || hintsLeft <= 0}
        >💡 Hint ({hintsLeft})</button>
      </section>

      <section className="pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            type="button"
            className="pad-btn"
            onClick={() => place(n)}
            disabled={selected === null || given[selected]}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          className="pad-btn erase"
          onClick={() => place(0)}
          disabled={selected === null || given[selected]}
        >
          ×
        </button>
      </section>

      {solved ? (
        <section className="done" aria-live="polite">
          <p className="finish-line">Solved.</p>
          <button type="button" className="primary" onClick={() => newGame()}>Another</button>
        </section>
      ) : null}

      <footer className="footer">
        <a className="muted small" href="https://github.com/devanteprov/shippie/tree/main/apps/showcase-sudoku" target="_blank" rel="noreferrer">Source</a>
        <span className="muted small">solution {solution[0]}…</span>
      </footer>
    </main>
  );
}

function initRound(diff: Difficulty) {
  const { puzzle, solution } = generatePuzzle(diff);
  const given = puzzle.map((v) => v !== 0);
  return { puzzle, solution, given };
}

function clonePencils(p: Record<number, Set<number>>): Record<number, Set<number>> {
  const out: Record<number, Set<number>> = {};
  for (const [k, v] of Object.entries(p)) out[+k] = new Set(v);
  return out;
}
