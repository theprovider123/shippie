import { useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { TARGET, puzzleForDate, shareGrid, todayKey } from './puzzle';
import { generatePuzzle, isValidPlacement, type Board, type Difficulty } from './sudoku';

type Mode = 'trail' | 'sudoku' | 'memory-grid' | 'reaction';

interface Completion {
  mode: Mode;
  date: string;
  score: string;
  at: string;
}

interface Store {
  completions: Record<string, Completion>;
  lastMode?: Mode;
}

interface TrailResult {
  puzzle_id: string;
  date: string;
  duration_ms: number;
}

interface DayBest {
  date: string;
  bestMs: number;
  attempts: number;
  recent?: number[];
}

interface MemoryBest {
  pairs: number;
  moves: number;
  ms: number;
  at: string;
}

const STORE_KEY = 'shippie:daily-puzzle:v2';
const LEGACY_TRAIL_KEY = 'shippie:daily-puzzle:v1';
const LEGACY_REACTION_KEY = 'shippie:reaction:v1';
const LEGACY_MEMORY_KEY = 'shippie:memory-grid:v1';
const MEMORY_PACK_KEY = 'shippie:memory-grid:pack:v1';

const MODES: ReadonlyArray<{ id: Mode; label: string; short: string }> = [
  { id: 'trail', label: 'Number Trail', short: 'Trail' },
  { id: 'sudoku', label: 'Sudoku', short: 'Sudoku' },
  { id: 'memory-grid', label: 'Memory Grid', short: 'Memory' },
  { id: 'reaction', label: 'Reaction', short: 'Reaction' },
];

const sdk = createShippieIframeSdk({ appId: 'app_daily_puzzle' });
const observations = createObservationClient(sdk);

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function completionKey(mode: Mode, date: string): string {
  return `${mode}:${date}`;
}

function parseMode(value: string | null | undefined): Mode | null {
  return MODES.some((mode) => mode.id === value) ? (value as Mode) : null;
}

function loadJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T;
  } catch {
    return fallback;
  }
}

function loadStore(): Store {
  const stored = loadJson<Store>(STORE_KEY, { completions: {} });
  const completions = { ...(stored.completions ?? {}) };

  const trail = loadJson<Record<string, TrailResult>>(LEGACY_TRAIL_KEY, {});
  for (const result of Object.values(trail)) {
    completions[completionKey('trail', result.date)] ??= {
      mode: 'trail',
      date: result.date,
      score: `${(result.duration_ms / 1000).toFixed(1)}s`,
      at: `${result.date}T12:00:00.000Z`,
    };
  }

  const reaction = loadJson<Record<string, DayBest>>(LEGACY_REACTION_KEY, {});
  for (const result of Object.values(reaction)) {
    completions[completionKey('reaction', result.date)] ??= {
      mode: 'reaction',
      date: result.date,
      score: `${result.bestMs}ms`,
      at: `${result.date}T12:00:00.000Z`,
    };
  }

  const memory = loadJson<Record<string, MemoryBest>>(LEGACY_MEMORY_KEY, {});
  for (const result of Object.values(memory)) {
    const date = formatDate(new Date(result.at));
    completions[completionKey('memory-grid', date)] ??= {
      mode: 'memory-grid',
      date,
      score: `${result.pairs}p/${result.moves}m`,
      at: result.at,
    };
  }

  return { completions, lastMode: parseMode(stored.lastMode) ?? undefined };
}

function saveStore(store: Store): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* best-effort */
  }
}

function computeModeStreak(completions: Record<string, Completion>, mode: Mode): number {
  const dates = new Set(Object.values(completions).filter((c) => c.mode === mode).map((c) => c.date));
  const d = new Date();
  let streak = 0;
  if (!dates.has(formatDate(d))) d.setDate(d.getDate() - 1);
  while (dates.has(formatDate(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function longestCombinedStreak(completions: Record<string, Completion>): number {
  const dates = [...new Set(Object.values(completions).map((c) => c.date))].sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const key of dates) {
    const date = new Date(`${key}T00:00:00`);
    const expected = prev ? new Date(prev) : null;
    if (expected) expected.setDate(expected.getDate() + 1);
    run = expected && formatDate(expected) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

function modeFromUrlOrStore(store: Store): Mode {
  if (typeof window !== 'undefined') {
    const fromUrl = parseMode(new URLSearchParams(window.location.search).get('mode'));
    if (fromUrl) return fromUrl;
  }
  const today = todayKey();
  if (store.lastMode && store.completions[completionKey(store.lastMode, today)]) {
    return store.lastMode;
  }
  return store.lastMode ?? 'trail';
}

export function App() {
  // Load once and reuse for the initial mode resolution — calling
  // loadStore() twice walks every legacy key twice on mount.
  const [store, setStore] = useState<Store>(() => loadStore());
  const [mode, setMode] = useState<Mode>(() => modeFromUrlOrStore(store));
  const streak = computeModeStreak(store.completions, mode);
  const combined = longestCombinedStreak(store.completions);

  useEffect(() => saveStore(store), [store]);

  function complete(modeId: Mode, score: string, result: string | number): void {
    const today = todayKey();
    setStore((prev) => ({
      completions: {
        ...prev.completions,
        [completionKey(modeId, today)]: {
          mode: modeId,
          date: today,
          score,
          at: new Date().toISOString(),
        },
      },
      lastMode: modeId,
    }));
    observations.emit({
      kind: 'game.completed',
      game: modeId === 'trail' ? 'daily-puzzle' : modeId,
      result,
      at: new Date().toISOString(),
    });
  }

  function changeMode(next: Mode): void {
    setMode(next);
    setStore((prev) => ({ ...prev, lastMode: next }));
  }

  return (
    <main className="app">
      <header className="head">
        <div>
          <h1>Daily Puzzle</h1>
          <p className="muted small">
            {MODES.find((item) => item.id === mode)?.label} · {todayKey()}
            {streak > 0 ? <span className="streak"> · streak {streak}</span> : null}
          </p>
        </div>
        <div className="combined">Longest {combined}</div>
      </header>

      <section className="mode-row" aria-label="Puzzle modes">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === mode ? 'mode active' : 'mode'}
            onClick={() => changeMode(item.id)}
            title={item.label}
            aria-label={item.label}
          >
            {item.short}
          </button>
        ))}
      </section>

      {mode === 'trail' ? <TrailMode onComplete={complete} /> : null}
      {mode === 'reaction' ? <ReactionMode onComplete={complete} /> : null}
      {mode === 'memory-grid' ? <MemoryMode onComplete={complete} /> : null}
      {mode === 'sudoku' ? <SudokuMode onComplete={complete} /> : null}
    </main>
  );
}

function TrailMode({ onComplete }: { onComplete: (mode: Mode, score: string, result: string | number) => void }) {
  const [legacyResults, setLegacyResults] = useState<Record<string, TrailResult>>(() =>
    loadJson<Record<string, TrailResult>>(LEGACY_TRAIL_KEY, {}),
  );
  const [next, setNext] = useState(1);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [wrong, setWrong] = useState<number | null>(null);
  const today = todayKey();
  const puzzle = useMemo(() => puzzleForDate(today), [today]);
  const todayResult = legacyResults[puzzle.puzzle_id];
  const done = next > TARGET;

  useEffect(() => {
    try {
      localStorage.setItem(LEGACY_TRAIL_KEY, JSON.stringify(legacyResults));
    } catch {
      /* best-effort */
    }
  }, [legacyResults]);

  useEffect(() => {
    if (!startedAt || done) return;
    // 200ms is fast enough for tenth-of-a-second display without the
    // jitter of 100ms re-renders on lower-end hardware.
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [startedAt, done]);

  function tap(value: number): void {
    if (done) return;
    if (value !== next) {
      haptic('error');
      setWrong(value);
      window.setTimeout(() => setWrong(null), 250);
      return;
    }
    haptic('tap');
    if (next === 1) setStartedAt(Date.now());
    if (next === TARGET) {
      const duration = Date.now() - (startedAt ?? Date.now());
      const result = { puzzle_id: puzzle.puzzle_id, date: today, duration_ms: duration };
      setLegacyResults((prev) => ({ ...prev, [puzzle.puzzle_id]: result }));
      onComplete('trail', `${(duration / 1000).toFixed(1)}s`, duration);
      haptic('success');
    }
    setNext((n) => n + 1);
  }

  async function share(): Promise<void> {
    if (!todayResult) return;
    const text = shareGrid(puzzle, todayResult.duration_ms);
    const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
    try {
      if (typeof nav.share === 'function') await nav.share({ text });
      else await navigator.clipboard.writeText(text);
      setShareNote(typeof nav.share === 'function' ? 'Shared' : 'Copied');
    } catch {
      setShareNote('Share unavailable');
    }
    window.setTimeout(() => setShareNote(null), 2000);
  }

  const elapsed = startedAt ? (done ? todayResult?.duration_ms ?? now - startedAt : now - startedAt) : 0;

  return (
    <>
      <div className="timer" aria-live="polite">{startedAt ? `${(elapsed / 1000).toFixed(1)}s` : 'Tap 1 to start'}</div>
      <section className="number-grid" aria-label="Number trail grid">
        {puzzle.grid.map((value, idx) => (
          <button
            key={idx}
            type="button"
            className={`number-cell${value < next ? ' found' : ''}${value === next && !done ? ' hint' : ''}${wrong === value ? ' wrong' : ''}`}
            onClick={() => tap(value)}
            disabled={done}
          >
            {value}
          </button>
        ))}
      </section>
      {done && todayResult ? (
        <section className="done">
          <p className="finish-line">Done in <strong>{(todayResult.duration_ms / 1000).toFixed(1)}s</strong>.</p>
          <div className="row-actions">
            <button type="button" className="primary" onClick={share}>Share</button>
            <button type="button" className="ghost" onClick={() => { setNext(1); setStartedAt(null); setNow(Date.now()); }}>Try again</button>
          </div>
          {shareNote ? <p className="muted small">{shareNote}</p> : null}
        </section>
      ) : null}
    </>
  );
}

type Phase = 'idle' | 'waiting' | 'go' | 'result' | 'too-early';

function ReactionMode({ onComplete }: { onComplete: (mode: Mode, score: string, result: string | number) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [history, setHistory] = useState<Record<string, DayBest>>(() => loadJson<Record<string, DayBest>>(LEGACY_REACTION_KEY, {}));
  const goAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const today = todayKey();
  const todayBest = history[today]?.bestMs ?? null;

  useEffect(() => {
    try {
      localStorage.setItem(LEGACY_REACTION_KEY, JSON.stringify(history));
    } catch {
      /* best-effort */
    }
  }, [history]);

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  function start(): void {
    setLastMs(null);
    setPhase('waiting');
    timerRef.current = window.setTimeout(() => {
      goAtRef.current = performance.now();
      setPhase('go');
      haptic('success');
    }, 800 + Math.random() * 1600);
  }

  function onPress(): void {
    if (phase === 'idle' || phase === 'result' || phase === 'too-early') {
      start();
      return;
    }
    if (phase === 'waiting') {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setPhase('too-early');
      haptic('error');
      return;
    }
    if (phase === 'go' && goAtRef.current !== null) {
      const ms = Math.round(performance.now() - goAtRef.current);
      const recent = [ms, ...(history[today]?.recent ?? [])].slice(0, 5);
      setLastMs(ms);
      setPhase('result');
      setHistory((prev) => ({
        ...prev,
        [today]: {
          date: today,
          bestMs: Math.min(prev[today]?.bestMs ?? ms, ms),
          attempts: (prev[today]?.attempts ?? 0) + 1,
          recent,
        },
      }));
      onComplete('reaction', `${ms}ms`, ms);
      haptic('tap');
    }
  }

  return (
    <>
      <section className={`reaction-stage stage-${phase}`} onPointerDown={onPress} role="button" tabIndex={0}>
        {phase === 'idle' ? <p>Tap to start</p> : null}
        {phase === 'waiting' ? <p>Wait...</p> : null}
        {phase === 'go' ? <p>TAP</p> : null}
        {phase === 'result' && lastMs !== null ? <p className="ms">{lastMs}<span>ms</span></p> : null}
        {phase === 'too-early' ? <><p>Too early</p><p className="muted small">Tap to try again</p></> : null}
      </section>
      <p className="muted small">{todayBest ? `Today best ${todayBest}ms` : 'Best time saves for today.'}</p>
    </>
  );
}

interface Card {
  id: number;
  symbol: string;
  flipped: boolean;
  matched: boolean;
}

const PAIR_COUNTS = [4, 6, 8] as const;
type PairCount = typeof PAIR_COUNTS[number];
type Pack = 'shapes' | 'animals' | 'food' | 'space';
const PACKS: Record<Pack, string[]> = {
  shapes: ['○', '△', '□', '✦', '×', '◇', '+', '◐'],
  animals: ['Cat', 'Dog', 'Fox', 'Panda', 'Lion', 'Turtle', 'Octo', 'Moth'],
  food: ['Apple', 'Pizza', 'Avo', 'Sushi', 'Donut', 'Berry', 'Carrot', 'Grape'],
  space: ['Rocket', 'Orbit', 'Planet', 'Comet', 'Moon', 'Star', 'Saucer', 'Alien'],
};

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

function newDeck(pairs: PairCount, pack: Pack): Card[] {
  return shuffle([...PACKS[pack].slice(0, pairs), ...PACKS[pack].slice(0, pairs)]).map((symbol, id) => ({
    id,
    symbol,
    flipped: false,
    matched: false,
  }));
}

function MemoryMode({ onComplete }: { onComplete: (mode: Mode, score: string, result: string | number) => void }) {
  const [pairs, setPairs] = useState<PairCount>(4);
  const [pack, setPack] = useState<Pack>(() => parsePack(typeof localStorage === 'undefined' ? null : localStorage.getItem(MEMORY_PACK_KEY)));
  const [deck, setDeck] = useState<Card[]>(() => newDeck(4, pack));
  const [moves, setMoves] = useState(0);
  const [bests, setBests] = useState<Record<number, MemoryBest>>(() => loadJson<Record<number, MemoryBest>>(LEGACY_MEMORY_KEY, {}));
  const startedRef = useRef<number | null>(null);
  const lockRef = useRef(false);
  const allMatched = deck.every((card) => card.matched);
  const flipped = deck.filter((card) => card.flipped && !card.matched);

  useEffect(() => {
    try {
      localStorage.setItem(LEGACY_MEMORY_KEY, JSON.stringify(bests));
      localStorage.setItem(MEMORY_PACK_KEY, pack);
    } catch {
      /* best-effort */
    }
  }, [bests, pack]);

  useEffect(() => {
    if (!allMatched || startedRef.current === null) return;
    const ms = Math.round(performance.now() - startedRef.current);
    const result = { pairs, moves, ms, at: new Date().toISOString() };
    setBests((prev) => {
      const old = prev[pairs];
      return !old || moves < old.moves || (moves === old.moves && ms < old.ms) ? { ...prev, [pairs]: result } : prev;
    });
    onComplete('memory-grid', `${pairs}p/${moves}m`, `${pairs}p/${moves}m/${ms}ms`);
    haptic('success');
    startedRef.current = null;
  }, [allMatched]);

  useEffect(() => {
    if (flipped.length !== 2 || lockRef.current) return;
    lockRef.current = true;
    const [a, b] = flipped;
    const id = window.setTimeout(() => {
      setDeck((cards) =>
        cards.map((card) =>
          a && b && card.flipped && !card.matched
            ? a.symbol === b.symbol
              ? { ...card, matched: true }
              : { ...card, flipped: false }
            : card,
        ),
      );
      lockRef.current = false;
    }, a && b && a.symbol === b.symbol ? 250 : 700);
    return () => window.clearTimeout(id);
  }, [flipped]);

  function startRound(nextPairs = pairs, nextPack = pack): void {
    setPairs(nextPairs);
    setPack(nextPack);
    setDeck(newDeck(nextPairs, nextPack));
    setMoves(0);
    startedRef.current = null;
    lockRef.current = false;
  }

  function flip(card: Card): void {
    if (card.flipped || card.matched || lockRef.current) return;
    if (startedRef.current === null) startedRef.current = performance.now();
    haptic('tap');
    setDeck((cards) => cards.map((c) => c.id === card.id ? { ...c, flipped: true } : c));
    setMoves((m) => m + 1);
  }

  return (
    <>
      <section className="compact-row">
        {PAIR_COUNTS.map((count) => (
          <button key={count} type="button" className={pairs === count ? 'chip active' : 'chip'} onClick={() => startRound(count)}>
            {count} pairs
          </button>
        ))}
      </section>
      <section className="compact-row">
        {(Object.keys(PACKS) as Pack[]).map((item) => (
          <button key={item} type="button" className={pack === item ? 'chip active' : 'chip'} onClick={() => startRound(pairs, item)}>
            {item}
          </button>
        ))}
      </section>
      <p className="muted small">{moves} moves{bests[pairs] ? ` · best ${bests[pairs]!.moves}` : ''}</p>
      <section className="memory-grid" aria-label="Memory grid">
        {deck.map((card) => (
          <button key={card.id} type="button" className={`memory-card${card.flipped ? ' flipped' : ''}`} onClick={() => flip(card)}>
            {card.flipped || card.matched ? card.symbol : ''}
          </button>
        ))}
      </section>
      {allMatched ? <button type="button" className="primary" onClick={() => startRound()}>Play again</button> : null}
    </>
  );
}

function parsePack(value: string | null): Pack {
  return value === 'animals' || value === 'food' || value === 'space' ? value : 'shapes';
}

function SudokuMode({ onComplete }: { onComplete: (mode: Mode, score: string, result: string | number) => void }) {
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [{ puzzle, solution, given }, setRound] = useState(() => initRound('medium'));
  const [board, setBoard] = useState<Board>(() => puzzle);
  const [selected, setSelected] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [done, setDone] = useState(false);

  const conflicts = useMemo(() => {
    const out = new Set<number>();
    for (let i = 0; i < board.length; i++) {
      const value = board[i]!;
      if (value !== 0 && !isValidPlacement(board, i, value)) out.add(i);
    }
    return out;
  }, [board]);
  const solved = board.every((value) => value !== 0) && conflicts.size === 0;

  useEffect(() => {
    if (!solved || done) return;
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    setDone(true);
    onComplete('sudoku', `${diff}/${seconds}s`, `${diff}/${seconds}s`);
    haptic('success');
  }, [done, solved, diff, onComplete, startedAt]);

  function newGame(nextDiff = diff): void {
    setDiff(nextDiff);
    const next = initRound(nextDiff);
    setRound(next);
    setBoard(next.puzzle);
    setSelected(null);
    setStartedAt(Date.now());
    setDone(false);
  }

  function place(value: number): void {
    if (selected === null || given[selected] || done) return;
    haptic('tap');
    setBoard((prev) => prev.map((cell, idx) => idx === selected ? value : cell));
  }

  return (
    <>
      <section className="compact-row">
        {(['easy', 'medium', 'hard'] as const).map((item) => (
          <button key={item} type="button" className={diff === item ? 'chip active' : 'chip'} onClick={() => newGame(item)}>
            {item}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => newGame()}>new</button>
      </section>
      <section className="sudoku-board" aria-label="Sudoku board">
        {board.map((value, idx) => {
          const row = Math.floor(idx / 9);
          const col = idx % 9;
          return (
            <button
              key={idx}
              type="button"
              className={[
                'sudoku-cell',
                given[idx] ? 'given' : '',
                selected === idx ? 'selected' : '',
                conflicts.has(idx) ? 'conflict' : '',
                (col + 1) % 3 === 0 && col !== 8 ? 'thick-r' : '',
                (row + 1) % 3 === 0 && row !== 8 ? 'thick-b' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setSelected(idx)}
            >
              {value || ''}
            </button>
          );
        })}
      </section>
      <section className="number-pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => (
          <button key={value} type="button" onClick={() => place(value)} disabled={selected === null || given[selected]}>
            {value}
          </button>
        ))}
        <button type="button" onClick={() => place(0)} disabled={selected === null || given[selected]}>×</button>
      </section>
      {done ? <button type="button" className="primary" onClick={() => newGame()}>Another</button> : null}
    </>
  );
}

function initRound(diff: Difficulty) {
  const { puzzle, solution } = generatePuzzle(diff);
  return { puzzle, solution, given: puzzle.map((value) => value !== 0) };
}
