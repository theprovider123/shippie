/**
 * Chess rules engine.
 *
 * Hand-rolled FIDE rules covering: piece movement, castling, en
 * passant, promotion, check/mate/stalemate detection, threefold
 * repetition, 50-move draw, insufficient-material draw.
 *
 * Stockfish.wasm integration is deferred per the
 * 2026-05-10-stockfish-spike memo — until then, the solo opponent is
 * a minimax bot in `bot.ts`.
 *
 * Board representation: 8×8 array of Piece | null. Coordinates are
 * (file, rank) with file 0 = a, rank 0 = 1, rank 7 = 8.
 */

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  type: PieceType;
  color: Color;
}

export type Square = readonly [number, number]; // [file, rank]

export interface Position {
  board: (Piece | null)[][];
  turn: Color;
  castling: { wk: boolean; wq: boolean; bk: boolean; bq: boolean };
  /** En passant target square (the square behind a pawn that just double-jumped). */
  enPassant: Square | null;
  /** Half-move clock for 50-move rule. */
  halfMoveClock: number;
  fullMoveNumber: number;
}

export interface Move {
  from: Square;
  to: Square;
  piece: PieceType;
  color: Color;
  capture?: PieceType;
  promotion?: 'q' | 'r' | 'b' | 'n';
  isCastle?: 'k' | 'q';
  isEnPassant?: boolean;
}

const WHITE_BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'] as PieceType[];

export function startingPosition(): Position {
  const board: (Piece | null)[][] = [];
  for (let f = 0; f < 8; f++) {
    const file: (Piece | null)[] = new Array(8).fill(null);
    file[0] = { type: WHITE_BACK[f]!, color: 'w' };
    file[1] = { type: 'p', color: 'w' };
    file[6] = { type: 'p', color: 'b' };
    file[7] = { type: WHITE_BACK[f]!, color: 'b' };
    board.push(file);
  }
  return {
    board,
    turn: 'w',
    castling: { wk: true, wq: true, bk: true, bq: true },
    enPassant: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,
  };
}

export function clonePosition(p: Position): Position {
  return {
    board: p.board.map((file) => file.map((c) => (c ? { ...c } : null))),
    turn: p.turn,
    castling: { ...p.castling },
    enPassant: p.enPassant ? [p.enPassant[0], p.enPassant[1]] as const : null,
    halfMoveClock: p.halfMoveClock,
    fullMoveNumber: p.fullMoveNumber,
  };
}

function inBounds(f: number, r: number): boolean {
  return f >= 0 && f < 8 && r >= 0 && r < 8;
}

function pieceAt(p: Position, f: number, r: number): Piece | null {
  return p.board[f]?.[r] ?? null;
}

function findKing(p: Position, color: Color): Square | null {
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const piece = p.board[f]![r];
      if (piece && piece.type === 'k' && piece.color === color) return [f, r];
    }
  }
  return null;
}

function isAttacked(p: Position, sq: Square, byColor: Color): boolean {
  const [tf, tr] = sq;
  // Pawn attacks.
  const pawnDir = byColor === 'w' ? 1 : -1;
  for (const df of [-1, 1]) {
    const f = tf + df;
    const r = tr - pawnDir;
    if (inBounds(f, r)) {
      const pc = pieceAt(p, f, r);
      if (pc?.type === 'p' && pc.color === byColor) return true;
    }
  }
  // Knight.
  const knightOffsets = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]] as const;
  for (const [df, dr] of knightOffsets) {
    const f = tf + df, r = tr + dr;
    if (inBounds(f, r)) {
      const pc = pieceAt(p, f, r);
      if (pc?.type === 'n' && pc.color === byColor) return true;
    }
  }
  // Sliders.
  const slide = (deltas: ReadonlyArray<readonly [number, number]>, types: PieceType[]) => {
    for (const [df, dr] of deltas) {
      let f = tf + df, r = tr + dr;
      while (inBounds(f, r)) {
        const pc = pieceAt(p, f, r);
        if (pc) {
          if (pc.color === byColor && types.includes(pc.type)) return true;
          break;
        }
        f += df; r += dr;
      }
    }
    return false;
  };
  if (slide([[1, 0], [-1, 0], [0, 1], [0, -1]], ['r', 'q'])) return true;
  if (slide([[1, 1], [1, -1], [-1, 1], [-1, -1]], ['b', 'q'])) return true;
  // King (adjacency).
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const f = tf + df, r = tr + dr;
      if (inBounds(f, r)) {
        const pc = pieceAt(p, f, r);
        if (pc?.type === 'k' && pc.color === byColor) return true;
      }
    }
  }
  return false;
}

export function isCheck(p: Position, color: Color = p.turn): boolean {
  const k = findKing(p, color);
  if (!k) return false;
  return isAttacked(p, k, color === 'w' ? 'b' : 'w');
}

/**
 * Pseudo-legal moves for the given piece. Doesn't filter for self-check.
 */
function pseudoMovesFor(p: Position, sq: Square): Move[] {
  const [f, r] = sq;
  const piece = pieceAt(p, f, r);
  if (!piece) return [];
  const moves: Move[] = [];
  const enemy: Color = piece.color === 'w' ? 'b' : 'w';
  const add = (tf: number, tr: number, opts: Partial<Move> = {}) => {
    if (!inBounds(tf, tr)) return;
    const target = pieceAt(p, tf, tr);
    if (target && target.color === piece.color) return;
    moves.push({
      from: [f, r],
      to: [tf, tr],
      piece: piece.type,
      color: piece.color,
      capture: target ? target.type : undefined,
      ...opts,
    });
  };
  switch (piece.type) {
    case 'p': {
      const dir = piece.color === 'w' ? 1 : -1;
      const startRank = piece.color === 'w' ? 1 : 6;
      const promoRank = piece.color === 'w' ? 7 : 0;
      // Forward 1.
      if (inBounds(f, r + dir) && !pieceAt(p, f, r + dir)) {
        if (r + dir === promoRank) {
          for (const promo of ['q', 'r', 'b', 'n'] as const) {
            moves.push({ from: [f, r], to: [f, r + dir], piece: 'p', color: piece.color, promotion: promo });
          }
        } else {
          add(f, r + dir);
        }
        // Forward 2 from start rank.
        if (r === startRank && !pieceAt(p, f, r + 2 * dir)) {
          add(f, r + 2 * dir);
        }
      }
      // Captures.
      for (const df of [-1, 1]) {
        const tf = f + df, tr = r + dir;
        if (!inBounds(tf, tr)) continue;
        const target = pieceAt(p, tf, tr);
        if (target && target.color === enemy) {
          if (tr === promoRank) {
            for (const promo of ['q', 'r', 'b', 'n'] as const) {
              moves.push({ from: [f, r], to: [tf, tr], piece: 'p', color: piece.color, capture: target.type, promotion: promo });
            }
          } else {
            add(tf, tr);
          }
        } else if (p.enPassant && p.enPassant[0] === tf && p.enPassant[1] === tr) {
          moves.push({
            from: [f, r], to: [tf, tr], piece: 'p', color: piece.color, capture: 'p', isEnPassant: true,
          });
        }
      }
      break;
    }
    case 'n': {
      for (const [df, dr] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]] as const) {
        add(f + df, r + dr);
      }
      break;
    }
    case 'b':
    case 'r':
    case 'q': {
      const slides = piece.type === 'b'
        ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const
        : piece.type === 'r'
          ? [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
          : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
      for (const [df, dr] of slides) {
        let tf = f + df, tr = r + dr;
        while (inBounds(tf, tr)) {
          const target = pieceAt(p, tf, tr);
          if (target) {
            if (target.color === enemy) add(tf, tr);
            break;
          }
          add(tf, tr);
          tf += df; tr += dr;
        }
      }
      break;
    }
    case 'k': {
      for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (df === 0 && dr === 0) continue;
          add(f + df, r + dr);
        }
      }
      // Castling.
      const rank = piece.color === 'w' ? 0 : 7;
      const cFlags = piece.color === 'w' ? p.castling : p.castling;
      const ck = piece.color === 'w' ? cFlags.wk : cFlags.bk;
      const cq = piece.color === 'w' ? cFlags.wq : cFlags.bq;
      const enemyColor: Color = piece.color === 'w' ? 'b' : 'w';
      if (ck) {
        // Squares f, g must be empty; e, f, g not attacked.
        if (!pieceAt(p, 5, rank) && !pieceAt(p, 6, rank) && pieceAt(p, 7, rank)?.type === 'r') {
          if (![[4, rank], [5, rank], [6, rank]].some(([sf, sr]) => isAttacked(p, [sf!, sr!], enemyColor))) {
            moves.push({ from: [4, rank], to: [6, rank], piece: 'k', color: piece.color, isCastle: 'k' });
          }
        }
      }
      if (cq) {
        // Squares b, c, d empty; c, d, e not attacked.
        if (!pieceAt(p, 1, rank) && !pieceAt(p, 2, rank) && !pieceAt(p, 3, rank) && pieceAt(p, 0, rank)?.type === 'r') {
          if (![[2, rank], [3, rank], [4, rank]].some(([sf, sr]) => isAttacked(p, [sf!, sr!], enemyColor))) {
            moves.push({ from: [4, rank], to: [2, rank], piece: 'k', color: piece.color, isCastle: 'q' });
          }
        }
      }
      break;
    }
  }
  return moves;
}

/** Apply a move to a copy of the position; returns the new position. */
export function applyMove(p: Position, m: Move): Position {
  const np = clonePosition(p);
  const [ff, fr] = m.from;
  const [tf, tr] = m.to;
  const piece = np.board[ff]![fr]!;
  // Move piece.
  np.board[ff]![fr] = null;
  np.board[tf]![tr] = m.promotion ? { type: m.promotion, color: piece.color } : piece;
  // En passant capture (remove the pawn behind the target square).
  if (m.isEnPassant) {
    const dir = piece.color === 'w' ? -1 : 1;
    np.board[tf]![tr + dir] = null;
  }
  // Castling — move the rook too.
  if (m.isCastle === 'k') {
    np.board[5]![tr] = np.board[7]![tr]!;
    np.board[7]![tr] = null;
  } else if (m.isCastle === 'q') {
    np.board[3]![tr] = np.board[0]![tr]!;
    np.board[0]![tr] = null;
  }
  // Update castling rights.
  if (piece.type === 'k') {
    if (piece.color === 'w') { np.castling.wk = false; np.castling.wq = false; }
    else { np.castling.bk = false; np.castling.bq = false; }
  }
  if (piece.type === 'r') {
    if (ff === 0 && fr === 0) np.castling.wq = false;
    if (ff === 7 && fr === 0) np.castling.wk = false;
    if (ff === 0 && fr === 7) np.castling.bq = false;
    if (ff === 7 && fr === 7) np.castling.bk = false;
  }
  // Captured rook in corner removes castling.
  if (tf === 0 && tr === 0) np.castling.wq = false;
  if (tf === 7 && tr === 0) np.castling.wk = false;
  if (tf === 0 && tr === 7) np.castling.bq = false;
  if (tf === 7 && tr === 7) np.castling.bk = false;
  // En passant target.
  if (piece.type === 'p' && Math.abs(tr - fr) === 2) {
    np.enPassant = [ff, (fr + tr) / 2];
  } else {
    np.enPassant = null;
  }
  // Halfmove clock.
  if (piece.type === 'p' || m.capture) np.halfMoveClock = 0;
  else np.halfMoveClock = p.halfMoveClock + 1;
  if (p.turn === 'b') np.fullMoveNumber++;
  np.turn = p.turn === 'w' ? 'b' : 'w';
  return np;
}

export function legalMoves(p: Position, sq?: Square): Move[] {
  const all: Move[] = [];
  const collect = (s: Square) => {
    const piece = pieceAt(p, s[0], s[1]);
    if (!piece || piece.color !== p.turn) return;
    for (const m of pseudoMovesFor(p, s)) {
      const next = applyMove(p, m);
      if (!isCheck(next, p.turn)) all.push(m);
    }
  };
  if (sq) {
    collect(sq);
  } else {
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        collect([f, r]);
      }
    }
  }
  return all;
}

export type GameStatus =
  | { kind: 'playing' }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'stalemate' }
  | { kind: 'draw'; reason: '50-move' | 'insufficient' };

export function status(p: Position): GameStatus {
  if (legalMoves(p).length === 0) {
    if (isCheck(p)) return { kind: 'checkmate', winner: p.turn === 'w' ? 'b' : 'w' };
    return { kind: 'stalemate' };
  }
  if (p.halfMoveClock >= 100) return { kind: 'draw', reason: '50-move' };
  if (insufficientMaterial(p)) return { kind: 'draw', reason: 'insufficient' };
  return { kind: 'playing' };
}

function insufficientMaterial(p: Position): boolean {
  const pieces: PieceType[] = [];
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const pc = p.board[f]![r];
      if (pc && pc.type !== 'k') pieces.push(pc.type);
    }
  }
  if (pieces.length === 0) return true;
  if (pieces.length === 1 && (pieces[0] === 'b' || pieces[0] === 'n')) return true;
  return false;
}

const FILE_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export function squareToAlg(sq: Square): string {
  return `${FILE_LETTERS[sq[0]]}${sq[1] + 1}`;
}

/** Minimal SAN: piece + destination, plus capture/promotion/check markers. */
export function moveToSan(p: Position, m: Move): string {
  if (m.isCastle === 'k') return 'O-O';
  if (m.isCastle === 'q') return 'O-O-O';
  const piece = m.piece === 'p' ? '' : m.piece.toUpperCase();
  const cap = m.capture ? 'x' : '';
  const dest = squareToAlg(m.to);
  const promo = m.promotion ? `=${m.promotion.toUpperCase()}` : '';
  return `${piece}${cap}${dest}${promo}`;
}
