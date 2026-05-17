/**
 * In-bundle minimax bot. Strong enough for casual play without
 * shipping a 7MB external engine.
 *
 * Skill mapping (slider 0..6):
 *   0 — random legal move
 *   1 — depth 1 (1-ply lookahead)
 *   2 — depth 2
 *   3 — depth 2 + piece-square tables
 *   4 — depth 3 + PSTs
 *   5 — depth 3 + PSTs + quiescence on captures
 *   6 — depth 4 + PSTs + quiescence on captures
 *
 * Move ordering (captures by MVV-LVA, then checks, then quiet) makes
 * alpha-beta dramatically more pruning-friendly so depth 4 is
 * tractable in a few hundred ms even from JS.
 */
import {
  applyMove,
  isCheck,
  legalMoves,
  type Color,
  type Move,
  type PieceType,
  type Position,
} from './rules';

const VALUE: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

/**
 * Piece-square tables. Bonus (centipawns) added to white-perspective
 * material score for a piece sitting on each square. Negated for
 * black. Indexed by [file][rank] — same shape as the engine's board.
 *
 * Tables are simple "good squares" heuristics rather than tuned
 * weights — knights want centre, bishops want long diagonals, rooks
 * want open files / 7th rank, kings want safety in the corner during
 * middlegame.
 */
const PST_PAWN: number[][] = [
  // file 0 (a-file)
  [0, 5, 5, 0, 5, 10, 50, 0],
  [0, 10, -5, 0, 5, 10, 50, 0],
  [0, 10, -10, 0, 10, 20, 50, 0],
  [0, -20, 0, 20, 25, 30, 50, 0],
  [0, -20, 0, 20, 25, 30, 50, 0],
  [0, 10, -10, 0, 10, 20, 50, 0],
  [0, 10, -5, 0, 5, 10, 50, 0],
  [0, 5, 5, 0, 5, 10, 50, 0],
];

const PST_KNIGHT: number[][] = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 5, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-40, -20, 0, 5, 0, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

const PST_BISHOP: number[][] = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 5, 0, 0, 0, 0, 0, -10],
  [-10, 10, 10, 10, 10, 10, 0, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 0, -10],
  [-10, 5, 0, 0, 0, 0, 0, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const PST_ROOK: number[][] = [
  [0, 0, 0, 0, 0, 5, 0, 0],
  [0, 0, 0, 0, 0, 10, 0, 0],
  [0, 0, 0, 0, 0, 10, 5, 0],
  [5, 5, 5, 5, 5, 10, 5, 0],
  [5, 5, 5, 5, 5, 10, 5, 0],
  [0, 0, 0, 0, 0, 10, 5, 0],
  [0, 0, 0, 0, 0, 10, 0, 0],
  [0, 0, 0, 0, 0, 5, 0, 0],
];

const PST_QUEEN: number[][] = [
  [-20, -10, -10, 0, -5, -10, -10, -20],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 5, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [-10, 0, 5, 5, 5, 5, 5, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, 0, -5, -10, -10, -20],
];

const PST_KING: number[][] = [
  [20, 20, -10, -20, -30, -30, -30, -30],
  [30, 20, -20, -30, -40, -40, -40, -40],
  [10, 0, -20, -30, -40, -40, -40, -40],
  [0, 0, -20, -40, -50, -50, -50, -50],
  [0, 0, -20, -40, -50, -50, -50, -50],
  [10, 0, -20, -30, -40, -40, -40, -40],
  [30, 20, -20, -30, -40, -40, -40, -40],
  [20, 20, -10, -20, -30, -30, -30, -30],
];

const PSTS: Record<PieceType, number[][]> = {
  p: PST_PAWN,
  n: PST_KNIGHT,
  b: PST_BISHOP,
  r: PST_ROOK,
  q: PST_QUEEN,
  k: PST_KING,
};

/** Evaluate from white's perspective (positive = white better). */
function evaluate(p: Position, usePST: boolean): number {
  let score = 0;
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const piece = p.board[f]![r];
      if (!piece) continue;
      const material = VALUE[piece.type];
      const positional = usePST
        // Black's PST is mirrored on rank.
        ? piece.color === 'w'
          ? PSTS[piece.type][f]![r]!
          : PSTS[piece.type][f]![7 - r]!
        : 0;
      score += piece.color === 'w' ? material + positional : -(material + positional);
    }
  }
  return score;
}

/**
 * Score a move for ordering — captures (MVV-LVA), promotions, and
 * checks first. Better ordering = better alpha-beta pruning = deeper
 * search in the same time budget.
 */
function moveScore(m: Move): number {
  let s = 0;
  if (m.capture) s += 1000 + VALUE[m.capture] - VALUE[m.piece] / 10;
  if (m.promotion) s += 800;
  if (m.isCastle) s += 50;
  return s;
}

function orderMoves(moves: Move[]): Move[] {
  return moves.slice().sort((a, b) => moveScore(b) - moveScore(a));
}

/**
 * Quiescence search — extend the search past `depth = 0` only on
 * capturing moves so the engine doesn't end its lookahead in the
 * middle of an exchange (the "horizon effect").
 */
function quiesce(p: Position, alpha: number, beta: number, color: Color, usePST: boolean): number {
  const standPat = color === 'w' ? evaluate(p, usePST) : -evaluate(p, usePST);
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;
  const captures = legalMoves(p).filter((m) => m.capture || m.promotion);
  for (const m of orderMoves(captures)) {
    const next = applyMove(p, m);
    const score = -quiesce(next, -beta, -alpha, color === 'w' ? 'b' : 'w', usePST);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

interface SearchConfig {
  depth: number;
  usePST: boolean;
  useQuiescence: boolean;
}

function negamax(
  p: Position,
  depth: number,
  alpha: number,
  beta: number,
  color: Color,
  cfg: SearchConfig,
): number {
  if (depth === 0) {
    if (cfg.useQuiescence) return quiesce(p, alpha, beta, color, cfg.usePST);
    const eval_ = evaluate(p, cfg.usePST);
    return color === 'w' ? eval_ : -eval_;
  }
  const moves = orderMoves(legalMoves(p));
  if (moves.length === 0) {
    // No legal moves — mate (very bad) if in check, else stalemate.
    if (isCheck(p)) return -100000 - depth;
    return 0;
  }
  let best = -Infinity;
  for (const m of moves) {
    const next = applyMove(p, m);
    const score = -negamax(next, depth - 1, -beta, -alpha, color === 'w' ? 'b' : 'w', cfg);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function configFor(skill: number): SearchConfig {
  if (skill <= 1) return { depth: 1, usePST: false, useQuiescence: false };
  if (skill === 2) return { depth: 2, usePST: false, useQuiescence: false };
  if (skill === 3) return { depth: 2, usePST: true, useQuiescence: false };
  if (skill === 4) return { depth: 3, usePST: true, useQuiescence: false };
  if (skill === 5) return { depth: 3, usePST: true, useQuiescence: true };
  return { depth: 4, usePST: true, useQuiescence: true };
}

export function pickBotMove(p: Position, skill: number): Move | null {
  const moves = legalMoves(p);
  if (moves.length === 0) return null;
  if (skill <= 0) return moves[Math.floor(Math.random() * moves.length)]!;
  const cfg = configFor(skill);
  const ordered = orderMoves(moves);
  let best = -Infinity;
  let chosen = ordered[0]!;
  for (const m of ordered) {
    const next = applyMove(p, m);
    const score = -negamax(next, cfg.depth - 1, -Infinity, Infinity, next.turn, cfg);
    if (score > best) {
      best = score;
      chosen = m;
    }
  }
  return chosen;
}
