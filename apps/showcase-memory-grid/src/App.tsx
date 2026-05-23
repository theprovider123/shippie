import { useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';

/**
 * Memory Grid — flip cards to find pairs. Grid grows with skill.
 *
 * Round 1: 4 pairs (2×4 grid). Each clear bumps to a larger grid up to
 * 8 pairs (4×4). Tracks best moves-to-clear per grid size in
 * localStorage.
 */

const STORAGE_KEY = 'shippie:memory-grid:v1';

const sdk = createShippieIframeSdk({ appId: 'app_memory_grid' });
const observations = createObservationClient(sdk);

interface Card {
  id: number;
  symbol: string;
  flipped: boolean;
  matched: boolean;
}

interface PersonalBest {
  // `pairs` lives in the parent record key (Record<number, PersonalBest>);
  // duplicating it inside the row caused drift if either side updated.
  moves: number;
  ms: number;
  at: string;
}

const PAIR_COUNTS = [4, 6, 8] as const;
type PairCount = typeof PAIR_COUNTS[number];

type Pack = 'shapes' | 'animals' | 'food' | 'space';
const PACKS: Record<Pack, string[]> = {
  shapes:  ['◯', '△', '☐', '✦', '✕', '◇', '✚', '◐'],
  animals: ['🐱', '🐶', '🦊', '🐼', '🦁', '🐢', '🐙', '🦋'],
  food:    ['🍎', '🍕', '🥑', '🍣', '🍩', '🍓', '🥕', '🍇'],
  space:   ['🚀', '🛰', '🪐', '☄', '🌑', '🌟', '🛸', '👽'],
};
const PACK_LABELS: Record<Pack, string> = { shapes: 'Shapes', animals: 'Animals', food: 'Food', space: 'Space' };

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

function newDeck(pairs: PairCount, pack: Pack = 'shapes'): Card[] {
  const symbols = PACKS[pack].slice(0, pairs);
  const all = [...symbols, ...symbols];
  return shuffle(all).map((symbol, idx) => ({
    id: idx,
    symbol,
    flipped: false,
    matched: false,
  }));
}

function loadBests(): Record<number, PersonalBest> {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {}; }
  catch { return {}; }
}
function saveBests(rows: Record<number, PersonalBest>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); } catch {/**/}
}

export function App() {
  const [pairs, setPairs] = useState<PairCount>(4);
  const [pack, setPack] = useState<Pack>(() => {
    if (typeof localStorage === 'undefined') return 'shapes';
    const v = localStorage.getItem('shippie:memory-grid:pack:v1');
    return v === 'animals' || v === 'food' || v === 'space' ? v : 'shapes';
  });
  const [deck, setDeck] = useState<Card[]>(() => newDeck(4, 'shapes'));
  const [moves, setMoves] = useState(0);
  const [bests, setBests] = useState<Record<number, PersonalBest>>(() => loadBests());
  const [tick, setTick] = useState(0); // drives live timer
  const startedRef = useRef<number | null>(null);
  const lockRef = useRef(false);

  useEffect(() => {
    try { localStorage.setItem('shippie:memory-grid:pack:v1', pack); } catch {/**/}
  }, [pack]);

  // Live timer tick at 5Hz while a round is in progress.
  useEffect(() => {
    if (startedRef.current === null) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 200);
    return () => window.clearInterval(id);
  }, [moves, deck]);

  const elapsedMs = startedRef.current === null ? 0 : Math.round(performance.now() - startedRef.current);
  void tick;

  const allMatched = useMemo(() => deck.every((c) => c.matched), [deck]);
  const flippedNotMatched = deck.filter((c) => c.flipped && !c.matched);

  useEffect(() => {
    if (allMatched && startedRef.current !== null) {
      const ms = Math.round(performance.now() - startedRef.current);
      const result: PersonalBest = { moves, ms, at: new Date().toISOString() };
      const prev = bests[pairs];
      const next = !prev || result.moves < prev.moves || (result.moves === prev.moves && result.ms < prev.ms)
        ? result
        : prev;
      const updated = { ...bests, [pairs]: next };
      setBests(updated);
      saveBests(updated);
      observations.emit({
        kind: 'game.completed',
        game: 'memory-grid',
        result: `${pairs}p/${moves}m/${ms}ms`,
        at: new Date().toISOString(),
      });
      haptic('success');
      startedRef.current = null;
    }
  }, [allMatched]);

  useEffect(() => {
    if (flippedNotMatched.length === 2 && !lockRef.current) {
      lockRef.current = true;
      const [a, b] = flippedNotMatched;
      if (a && b && a.symbol === b.symbol) {
        // Match — keep flipped, mark matched.
        const id = window.setTimeout(() => {
          setDeck((d) => d.map((c) => c.flipped && !c.matched ? { ...c, matched: true } : c));
          lockRef.current = false;
          haptic('tap');
        }, 250);
        return () => window.clearTimeout(id);
      }
      // Mismatch — flip back after a beat, with an error tick so the
      // body knows the pair failed even if their eyes were elsewhere.
      haptic('error');
      const id = window.setTimeout(() => {
        setDeck((d) => d.map((c) => c.matched ? c : { ...c, flipped: false }));
        lockRef.current = false;
      }, 700);
      return () => window.clearTimeout(id);
    }
  }, [flippedNotMatched]);

  function flip(card: Card) {
    if (card.flipped || card.matched || lockRef.current) return;
    if (startedRef.current === null) startedRef.current = performance.now();
    haptic('tap');
    setDeck((d) => d.map((c) => c.id === card.id ? { ...c, flipped: true } : c));
    if (flippedNotMatched.length < 2) setMoves((m) => m + 1);
  }

  function newRound(p: PairCount, nextPack: Pack = pack) {
    setPairs(p);
    setPack(nextPack);
    setDeck(newDeck(p, nextPack));
    setMoves(0);
    startedRef.current = null;
    lockRef.current = false;
  }

  // Grid columns: pairs=4→4 cols, 6→4 cols, 8→4 cols. Always 4 wide for
  // a phone-friendly layout; rows scale instead.
  const cols = 4;

  return (
    <main className="app">
      <header className="head">
        <div>
          <h1>Memory Grid</h1>
          <p className="muted small">
            Find every pair. {bests[pairs] ? `Best ${pairs}p: ${bests[pairs]!.moves}m / ${(bests[pairs]!.ms / 1000).toFixed(1)}s` : 'Set a best.'}
          </p>
        </div>
        <div className="moves">{moves} moves · {(elapsedMs / 1000).toFixed(1)}s</div>
      </header>

      <section className="size-row">
        {PAIR_COUNTS.map((p) => (
          <button
            key={p}
            type="button"
            className={p === pairs ? 'tab active' : 'tab'}
            onClick={() => newRound(p)}
          >
            {p} pairs{bests[p] ? ` · best ${bests[p]!.moves}` : ''}
          </button>
        ))}
      </section>

      <section className="size-row">
        {(Object.keys(PACKS) as Pack[]).map((p) => (
          <button
            key={p}
            type="button"
            className={p === pack ? 'tab active' : 'tab'}
            onClick={() => newRound(pairs, p)}
          >
            {PACK_LABELS[p]}
          </button>
        ))}
      </section>

      <section
        className="grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        aria-label="Memory grid"
      >
        {deck.map((card) => (
          <button
            key={card.id}
            type="button"
            className={`card${card.flipped ? ' flipped' : ''}${card.matched ? ' matched' : ''}`}
            onClick={() => flip(card)}
            aria-label={card.flipped ? card.symbol : 'face down'}
          >
            <span>{card.flipped ? card.symbol : '·'}</span>
          </button>
        ))}
      </section>

      {allMatched ? (
        <section className="done">
          <p className="finish-line">Cleared in <strong>{moves}</strong> moves.</p>
          <button type="button" className="primary" onClick={() => newRound(pairs)}>Play again</button>
        </section>
      ) : null}
    </main>
  );
}
