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
  }

  function place(value: number) {
    if (selected === null) return;
    if (given[selected]) return;
    haptic('tap');
    setBoard((b) => b.map((v, i) => i === selected ? value : v));
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
          return (
            <button
              key={idx}
              type="button"
              className={[
                'cell',
                isGiven ? 'given' : 'editable',
                isSelected ? 'selected' : '',
                inConflict ? 'conflict' : '',
                thickRight ? 'thick-r' : '',
                thickBottom ? 'thick-b' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setSelected(idx)}
              aria-label={`Row ${row + 1} col ${col + 1}, ${value === 0 ? 'empty' : value}`}
            >
              {value === 0 ? '' : value}
            </button>
          );
        })}
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
