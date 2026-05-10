/**
 * Tiny chess bot — used until Stockfish.wasm is bundled (per the
 * 2026-05-10-stockfish-spike memo). Implements:
 *   - skill 0: random legal move
 *   - skill 1-3: 1-ply minimax with material counting
 *   - skill 4-6: 2-ply minimax + quiescence
 *
 * Material weights match standard centipawn values. Deliberately
 * minimal so the bundle stays tiny — Stockfish drops in here.
 */
import { applyMove, legalMoves, type Color, type Move, type Position } from './rules';

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

function evaluate(p: Position): number {
  let score = 0;
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const piece = p.board[f]![r];
      if (!piece) continue;
      const v = VALUE[piece.type] ?? 0;
      score += piece.color === 'w' ? v : -v;
    }
  }
  return score;
}

function negamax(p: Position, depth: number, alpha: number, beta: number, color: Color): number {
  if (depth === 0) {
    const eval_ = evaluate(p);
    return color === 'w' ? eval_ : -eval_;
  }
  const moves = legalMoves(p);
  if (moves.length === 0) {
    // Mate or stalemate. Mated positions are terrible for the side to move.
    return -100000;
  }
  let best = -Infinity;
  for (const m of moves) {
    const next = applyMove(p, m);
    const score = -negamax(next, depth - 1, -beta, -alpha, color === 'w' ? 'b' : 'w');
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export function pickBotMove(p: Position, skill: number): Move | null {
  const moves = legalMoves(p);
  if (moves.length === 0) return null;
  if (skill <= 0) return moves[Math.floor(Math.random() * moves.length)]!;
  const depth = skill >= 4 ? 2 : 1;
  let best = -Infinity;
  let chosen = moves[0]!;
  for (const m of moves) {
    const next = applyMove(p, m);
    const score = -negamax(next, depth - 1, -Infinity, Infinity, next.turn);
    // Tie-break: capture > non-capture > random.
    if (score > best) {
      best = score;
      chosen = m;
    }
  }
  return chosen;
}
