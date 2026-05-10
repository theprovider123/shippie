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
}

function loadSettings(): Settings {
  if (typeof localStorage === 'undefined') return { mode: 'vsComputer', skill: 3, flipped: false };
  try {
    return { mode: 'vsComputer', skill: 3, flipped: false, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return { mode: 'vsComputer', skill: 3, flipped: false };
  }
}

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

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {/**/}
  }, [settings]);

  // Bot's turn.
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

      <section className="board" aria-label="Chess board">
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
                {f === (settings.flipped ? 7 : 0) ? <span className="rank-label">{r + 1}</span> : null}
                {r === (settings.flipped ? 7 : 0) ? <span className="file-label">{['a','b','c','d','e','f','g','h'][f]}</span> : null}
              </button>
            );
          }),
        )}
      </section>

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
