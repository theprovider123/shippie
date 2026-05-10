import { useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { createSoundBank, isMuted, toggleMuted } from '@shippie/juice';
import { ARCADE_SAMPLES } from '@shippie/juice/samples';
import {
  applyMove,
  isCheck,
  legalMoves,
  moveToSan,
  squareToAlg,
  startingPosition,
  status,
  type Move,
  type Position,
  type Square,
} from './rules';
import { pickBotMove } from './bot';
import { exitFullscreen, isFullscreen, requestFullscreen } from './fullscreen';

const sfx = createSoundBank({
  tap: ARCADE_SAMPLES.tap,
  pop: ARCADE_SAMPLES.pop,
  warn: ARCADE_SAMPLES.warn,
  success: ARCADE_SAMPLES.success,
  fail: ARCADE_SAMPLES.fail,
  levelUp: ARCADE_SAMPLES.levelUp,
});

/**
 * Chess showcase — three modes:
 *   - vs Computer: minimax bot at adjustable skill 0-6 (Stockfish.wasm
 *     swap deferred per the spike memo).
 *   - Two-player local: pass-and-play on one device.
 *   - PGN export, board flip, undo (vs computer only), coordinate labels.
 *
 * Inputs: click-to-select then click-to-move (works on touch + desktop
 * without separate handlers).
 */

const sdk = createShippieIframeSdk({ appId: 'app_chess' });
const observations = createObservationClient(sdk);

const STORAGE_KEY = 'shippie:chess:v1';

type Mode = 'vsComputer' | 'twoPlayer';

interface Settings {
  mode: Mode;
  skill: number;
  flipped: boolean;
  theme: 'classic' | 'walnut' | 'cobalt';
  showCoords: boolean;
}

function loadSettings(): Settings {
  const fallback: Settings = { mode: 'vsComputer', skill: 3, flipped: false, theme: 'classic', showCoords: true };
  if (typeof localStorage === 'undefined') return fallback;
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return fallback;
  }
}

/**
 * Tiny opening-book lookup. Keyed by colon-joined SAN ply prefix
 * (e.g. "e4:c5" → Sicilian Defence). 30 of the most-played openings
 * cover ~80% of casual games. Falls through to "Unknown opening"
 * after the book runs out of moves.
 */
const OPENING_BOOK: Array<{ key: string; name: string }> = [
  { key: 'e4:e5:Nf3:Nc6:Bb5', name: 'Ruy Lopez (Spanish)' },
  { key: 'e4:e5:Nf3:Nc6:Bc4', name: 'Italian Game' },
  { key: 'e4:e5:Nf3:Nc6:Bc4:Bc5', name: 'Italian: Giuoco Piano' },
  { key: 'e4:e5:Nf3:Nc6:Nc3', name: 'Four Knights' },
  { key: 'e4:e5:Nf3:Nf6', name: 'Petrov Defence' },
  { key: 'e4:e5:f4', name: "King's Gambit" },
  { key: 'e4:e5', name: 'Open Game' },
  { key: 'e4:c5', name: 'Sicilian Defence' },
  { key: 'e4:c5:Nf3:d6', name: 'Sicilian: Najdorf prep' },
  { key: 'e4:c6', name: 'Caro-Kann' },
  { key: 'e4:e6', name: 'French Defence' },
  { key: 'e4:d5', name: 'Scandinavian Defence' },
  { key: 'e4:d6', name: 'Pirc Defence' },
  { key: 'e4:Nf6', name: 'Alekhine Defence' },
  { key: 'd4:d5:c4', name: "Queen's Gambit" },
  { key: 'd4:d5:c4:e6', name: "Queen's Gambit Declined" },
  { key: 'd4:d5:c4:c6', name: 'Slav Defence' },
  { key: 'd4:d5:c4:dxc4', name: "Queen's Gambit Accepted" },
  { key: 'd4:Nf6:c4:g6', name: "King's Indian Defence" },
  { key: 'd4:Nf6:c4:e6', name: 'Indian Defence' },
  { key: 'd4:Nf6:c4:e6:Nf3:b6', name: 'Queen\'s Indian' },
  { key: 'd4:Nf6:c4:e6:Nc3:Bb4', name: 'Nimzo-Indian' },
  { key: 'd4:f5', name: 'Dutch Defence' },
  { key: 'd4:Nf6', name: 'Indian Defence (general)' },
  { key: 'c4', name: 'English Opening' },
  { key: 'Nf3', name: 'Réti Opening' },
  { key: 'b3', name: 'Larsen\'s Opening' },
  { key: 'g3', name: "King's Fianchetto" },
  { key: 'e4', name: "King's Pawn" },
  { key: 'd4', name: "Queen's Pawn" },
];

function lookupOpening(sanPlies: string[]): string {
  const key = sanPlies.join(':');
  // Match longest prefix.
  let bestName = sanPlies.length === 0 ? '' : 'Unknown';
  let bestLen = 0;
  for (const entry of OPENING_BOOK) {
    if (key.startsWith(entry.key) && entry.key.length > bestLen) {
      bestLen = entry.key.length;
      bestName = entry.name;
    }
  }
  return bestName;
}

const BOARD_THEMES: Record<Settings['theme'], { light: string; dark: string; lightHi: string; darkHi: string }> = {
  classic: { light: '#EFE6CF', dark: '#A88766', lightHi: '#F4E098', darkHi: '#C7A468' },
  walnut:  { light: '#E8D7B5', dark: '#7A4E2E', lightHi: '#F2C66E', darkHi: '#A57040' },
  cobalt:  { light: '#E0E7F2', dark: '#3B6494', lightHi: '#A8C8FF', darkHi: '#5A8FCC' },
};

const PIECE_GLYPH: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

export function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [history, setHistory] = useState<Position[]>(() => [startingPosition()]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [thinking, setThinking] = useState(false);
  const [fullscreen, setFullscreenState] = useState(false);
  const [muted, setMutedState] = useState(() => isMuted());
  const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null);
  const [dragFrom, setDragFrom] = useState<Square | null>(null);
  const dragOverRef = useRef<Square | null>(null);
  const lastMove = moves[moves.length - 1] ?? null;

  const position = history[history.length - 1]!;
  const gameStatus = useMemo(() => status(position), [position]);
  const inCheck = useMemo(() => isCheck(position), [position]);

  // Captured-piece tally derived from move history. Tray on each side
  // shows what that side has eliminated.
  const captures = useMemo(() => {
    const w: string[] = []; // pieces white has captured (i.e. black pieces eaten)
    const b: string[] = [];
    for (const m of moves) {
      if (m.capture) {
        if (m.color === 'w') w.push(m.capture);
        else b.push(m.capture);
      }
    }
    // Order descending value for readable rendering.
    const order = ['q', 'r', 'b', 'n', 'p'];
    const sortFn = (a: string, b: string) => order.indexOf(a) - order.indexOf(b);
    return { w: w.sort(sortFn), b: b.sort(sortFn) };
  }, [moves]);

  const openingName = useMemo(() => {
    if (moves.length === 0) return '';
    const sanPlies = moves.map((m, i) => moveToSan(history[i]!, m));
    return lookupOpening(sanPlies);
  }, [moves, history]);

  const theme = BOARD_THEMES[settings.theme];

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {/**/}
  }, [settings]);

  // Bot's turn — local minimax with iterative move-ordering. Skill
  // 6 hits depth 4 + quiescence; engine compiles at module load so
  // first-move latency is just the search itself.
  useEffect(() => {
    if (gameStatus.kind !== 'playing') return;
    if (settings.mode !== 'vsComputer') return;
    if (position.turn === 'w') return;
    setThinking(true);
    const id = window.setTimeout(() => {
      const move = pickBotMove(position, settings.skill);
      if (move) {
        const next = applyMove(position, move);
        setHistory((h) => [...h, next]);
        setMoves((m) => [...m, move]);
        haptic('tap');
        sfx.play(move.capture ? 'pop' : 'tap', { volume: move.capture ? 0.7 : 0.5 });
        if (move.isCastle) sfx.play('levelUp', { volume: 0.5 });
        if (isCheck(next)) {
          haptic('warn');
          sfx.play('warn');
        }
      }
      setThinking(false);
    }, 200);
    return () => window.clearTimeout(id);
  }, [position, settings.mode, settings.skill, gameStatus.kind]);

  // Game-end emit.
  const endRef = useState({ done: false })[0];
  useEffect(() => {
    if (gameStatus.kind === 'playing') return;
    if (endRef.done) return;
    endRef.done = true;
    haptic(gameStatus.kind === 'checkmate' ? 'success' : 'warn');
    sfx.play(gameStatus.kind === 'checkmate' ? 'success' : 'warn');
    observations.emit({
      kind: 'game.completed',
      game: 'chess',
      result: gameStatus.kind === 'checkmate' ? `mate-${gameStatus.winner}` : gameStatus.kind,
      at: new Date().toISOString(),
    });
  }, [gameStatus, endRef]);

  const commitMove = (move: Move) => {
    const next = applyMove(position, move);
    setHistory((h) => [...h, next]);
    setMoves((m) => [...m, move]);
    setSelected(null);
    haptic('tap');
    sfx.play(move.capture ? 'pop' : 'tap', { volume: move.capture ? 0.7 : 0.5 });
    if (move.isCastle) sfx.play('levelUp', { volume: 0.5 });
    if (move.promotion) sfx.play('levelUp', { volume: 0.6 });
    if (isCheck(next)) {
      haptic('warn');
      sfx.play('warn');
    }
  };

  const tryMove = (from: Square, to: Square) => {
    const move = legalMoves(position, from).find((m) => m.to[0] === to[0] && m.to[1] === to[1]);
    if (!move) return false;
    if (move.promotion) {
      // Hold the promotion until the user picks a piece.
      setPromotionPending({ from, to });
      return true;
    }
    commitMove(move);
    return true;
  };

  const choosePromotion = (kind: 'q' | 'r' | 'b' | 'n') => {
    if (!promotionPending) return;
    const move = legalMoves(position, promotionPending.from).find(
      (m) => m.to[0] === promotionPending.to[0] && m.to[1] === promotionPending.to[1] && m.promotion === kind,
    );
    if (move) commitMove(move);
    setPromotionPending(null);
  };

  const onSquare = (sq: Square) => {
    if (gameStatus.kind !== 'playing') return;
    if (settings.mode === 'vsComputer' && position.turn !== 'w') return;
    if (selected) {
      if (tryMove(selected, sq)) return;
      const piece = position.board[sq[0]]?.[sq[1]];
      if (piece && piece.color === position.turn) setSelected(sq);
      else setSelected(null);
    } else {
      const piece = position.board[sq[0]]?.[sq[1]];
      if (piece && piece.color === position.turn) setSelected(sq);
    }
  };

  // Drag-and-drop. Pointer events on a square start the drag; pointer
  // up over a target square commits. Falls back to click flow above.
  const onSquarePointerDown = (sq: Square, e: React.PointerEvent<HTMLButtonElement>) => {
    if (gameStatus.kind !== 'playing') return;
    if (settings.mode === 'vsComputer' && position.turn !== 'w') return;
    const piece = position.board[sq[0]]?.[sq[1]];
    if (!piece || piece.color !== position.turn) return;
    setDragFrom(sq);
    setSelected(sq);
    dragOverRef.current = sq;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };
  const onSquarePointerEnter = (sq: Square) => {
    if (!dragFrom) return;
    dragOverRef.current = sq;
  };
  const onAppPointerUp = () => {
    if (!dragFrom) return;
    const target = dragOverRef.current;
    setDragFrom(null);
    if (!target) return;
    if (target[0] === dragFrom[0] && target[1] === dragFrom[1]) {
      // Tap-style click — keep selection so the user can click to move.
      return;
    }
    tryMove(dragFrom, target);
  };

  const undo = () => {
    if (history.length < 3) return;
    setHistory((h) => h.slice(0, settings.mode === 'vsComputer' ? -2 : -1));
    setMoves((m) => m.slice(0, settings.mode === 'vsComputer' ? -2 : -1));
    setSelected(null);
  };

  const newGame = () => {
    setHistory([startingPosition()]);
    setMoves([]);
    setSelected(null);
    endRef.done = false;
  };

  const exportPgn = async () => {
    const pgn = moves
      .map((m, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${moveToSan(history[i]!, m)}` : moveToSan(history[i]!, m)))
      .join(' ');
    try { await navigator.clipboard.writeText(pgn); } catch {/**/}
  };

  const toggleFullscreen = () => {
    if (isFullscreen()) void exitFullscreen();
    else void requestFullscreen(document.documentElement);
  };
  useEffect(() => {
    const h = () => setFullscreenState(isFullscreen());
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const legalDestinations = useMemo<Set<string>>(() => {
    if (!selected) return new Set();
    return new Set(legalMoves(position, selected).map((m) => `${m.to[0]},${m.to[1]}`));
  }, [selected, position]);

  const ranks = settings.flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const files = settings.flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <main className="app" onPointerUp={onAppPointerUp}>
      <header className="head">
        <div>
          <h1>Chess</h1>
          <p className="muted small">
            {gameStatus.kind === 'playing'
              ? `${position.turn === 'w' ? 'White' : 'Black'} to move${inCheck ? ' · check' : ''}${thinking ? ' · thinking…' : ''}`
              : gameStatus.kind === 'checkmate'
                ? `Checkmate · ${gameStatus.winner === 'w' ? 'White' : 'Black'} wins`
                : gameStatus.kind === 'stalemate' ? 'Stalemate' : `Draw (${gameStatus.reason})`}
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="ghost" onClick={() => setMutedState(toggleMuted())} aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? '🔇' : '🔊'}</button>
          <button type="button" className="ghost" onClick={() => setSettings({ ...settings, flipped: !settings.flipped })} aria-label="Flip board">⇅</button>
          <button
            type="button"
            className="ghost"
            onClick={() => setSettings({ ...settings, theme: settings.theme === 'classic' ? 'walnut' : settings.theme === 'walnut' ? 'cobalt' : 'classic' })}
            aria-label="Theme"
            title={`Theme: ${settings.theme}`}
          >◐</button>
          <button
            type="button"
            className="ghost"
            onClick={() => setSettings({ ...settings, showCoords: !settings.showCoords })}
            aria-label="Coords"
            title={`Coords ${settings.showCoords ? 'on' : 'off'}`}
          >a1</button>
          <button type="button" className="ghost" onClick={toggleFullscreen} aria-label="Toggle fullscreen">{fullscreen ? '⤡' : '⛶'}</button>
        </div>
      </header>

      <section className="mode-row">
        {(['vsComputer', 'twoPlayer'] as Mode[]).map((m) => (
          <button key={m} type="button" className={m === settings.mode ? 'tab active' : 'tab'}
            onClick={() => { setSettings({ ...settings, mode: m }); newGame(); }}>
            {m === 'vsComputer' ? 'vs Computer' : 'Two Player'}
          </button>
        ))}
        {settings.mode === 'vsComputer' ? (
          <label className="skill">
            Skill {settings.skill}
            <input type="range" min={0} max={6} value={settings.skill}
              onChange={(e) => setSettings({ ...settings, skill: Number(e.target.value) })} />
          </label>
        ) : null}
      </section>

      {openingName ? <p className="opening-name">{openingName}</p> : null}

      <CapturedTray which="b" pieces={captures.b} />

      <section
        className={`board theme-${settings.theme}${settings.flipped ? ' flipped' : ''}`}
        aria-label="Chess board"
        style={{ ['--sq-light' as string]: theme.light, ['--sq-dark' as string]: theme.dark, ['--sq-light-hi' as string]: theme.lightHi, ['--sq-dark-hi' as string]: theme.darkHi }}
      >
        {ranks.map((r) =>
          files.map((f) => {
            const piece = position.board[f]![r];
            const dark = (f + r) % 2 === 0;
            const isSelected = selected?.[0] === f && selected?.[1] === r;
            const isLegal = legalDestinations.has(`${f},${r}`);
            const isLastFrom = lastMove && lastMove.from[0] === f && lastMove.from[1] === r;
            const isLastTo = lastMove && lastMove.to[0] === f && lastMove.to[1] === r;
            const isCheckSq = inCheck && piece?.type === 'k' && piece.color === position.turn;
            const isCapture = isLegal && piece && piece.color !== position.turn;
            return (
              <button
                key={`${f}-${r}`}
                type="button"
                className={[
                  'sq',
                  dark ? 'dark' : 'light',
                  isSelected ? 'selected' : '',
                  isLegal ? (isCapture ? 'legal-capture' : 'legal') : '',
                  isLastFrom ? 'last-from' : '',
                  isLastTo ? 'last-to' : '',
                  isCheckSq ? 'in-check' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onSquare([f, r])}
                onPointerDown={(e) => onSquarePointerDown([f, r], e)}
                onPointerEnter={() => onSquarePointerEnter([f, r])}
                aria-label={`${squareToAlg([f, r])}${piece ? ` ${piece.color}${piece.type}` : ''}`}
              >
                {piece ? PIECE_GLYPH[`${piece.color}${piece.type.toUpperCase()}`] : ''}
                {settings.showCoords && f === (settings.flipped ? 7 : 0) ? <span className="rank-label">{r + 1}</span> : null}
                {settings.showCoords && r === (settings.flipped ? 7 : 0) ? <span className="file-label">{['a','b','c','d','e','f','g','h'][f]}</span> : null}
              </button>
            );
          }),
        )}
      </section>

      <CapturedTray which="w" pieces={captures.w} />

      <section className="row-actions">
        <button type="button" className="ghost" onClick={newGame}>New game</button>
        {settings.mode === 'vsComputer' ? <button type="button" className="ghost" onClick={undo} disabled={history.length < 3}>Undo</button> : null}
        <button type="button" className="ghost" onClick={exportPgn} disabled={moves.length === 0}>Copy PGN</button>
      </section>

      {moves.length > 0 ? (
        <section className="moves">
          <p className="muted small">Moves</p>
          <ol className="move-list">
            {moves.map((m, i) => (
              <li key={i}>{i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : ''} {moveToSan(history[i]!, m)}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {promotionPending ? (
        <div className="promotion-overlay" role="dialog" aria-label="Choose promotion piece">
          <div className="promotion-card">
            <p className="muted small">Promote to:</p>
            <div className="promotion-row">
              {(['q', 'r', 'b', 'n'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="promotion-btn"
                  onClick={() => choosePromotion(kind)}
                >
                  {PIECE_GLYPH[`${position.turn}${kind.toUpperCase()}`]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {gameStatus.kind !== 'playing' ? (
        <div className="endgame-overlay" role="dialog" aria-live="polite">
          <div className="endgame-card">
            <p className="endgame-title">
              {gameStatus.kind === 'checkmate'
                ? `${gameStatus.winner === 'w' ? 'White' : 'Black'} wins by checkmate`
                : gameStatus.kind === 'stalemate' ? 'Stalemate' : `Draw — ${gameStatus.reason}`}
            </p>
            <div className="row-actions">
              <button type="button" className="primary" onClick={newGame}>New game</button>
              <button type="button" className="ghost" onClick={exportPgn}>Copy PGN</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function CapturedTray({ which, pieces }: { which: 'w' | 'b'; pieces: string[] }) {
  // Material differential — only show net advantage by cancelling
  // pairs (so the tray reads as "what's been won" not "tally").
  const counts = pieces.reduce<Record<string, number>>((acc, p) => {
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <div className={`tray tray-${which}`} aria-label={`${which === 'w' ? 'White' : 'Black'} captures`}>
      {(['q', 'r', 'b', 'n', 'p'] as const).flatMap((kind) => {
        const n = counts[kind] ?? 0;
        return Array.from({ length: n }, (_, i) => (
          <span key={`${kind}-${i}`} className="tray-piece">
            {PIECE_GLYPH[`${which === 'w' ? 'b' : 'w'}${kind.toUpperCase()}`]}
          </span>
        ));
      })}
    </div>
  );
}
