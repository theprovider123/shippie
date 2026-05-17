import { describe, expect, test } from 'bun:test';
import {
  applyMove,
  isCheck,
  legalMoves,
  startingPosition,
  status,
} from './rules';

describe('startingPosition', () => {
  test('white moves first', () => {
    expect(startingPosition().turn).toBe('w');
  });

  test('20 legal moves at starting position', () => {
    const p = startingPosition();
    const moves = legalMoves(p);
    // 16 pawn moves (8 single + 8 double) + 4 knight moves.
    expect(moves.length).toBe(20);
  });
});

describe('move legality', () => {
  test('pawn double-move sets en passant target', () => {
    const p = startingPosition();
    const e2e4 = legalMoves(p).find((m) => m.from[0] === 4 && m.from[1] === 1 && m.to[0] === 4 && m.to[1] === 3);
    expect(e2e4).toBeDefined();
    const next = applyMove(p, e2e4!);
    expect(next.enPassant).toEqual([4, 2]);
  });

  test('knight move is legal', () => {
    const p = startingPosition();
    const ng1f3 = legalMoves(p).find((m) => m.from[0] === 6 && m.from[1] === 0 && m.to[0] === 5 && m.to[1] === 2);
    expect(ng1f3).toBeDefined();
  });
});

describe('check + mate', () => {
  test('Fool\'s mate detection', () => {
    let p = startingPosition();
    // f3 (white pawn f2-f3)
    const f2f3 = legalMoves(p).find((m) => m.from[0] === 5 && m.from[1] === 1 && m.to[0] === 5 && m.to[1] === 2);
    expect(f2f3).toBeDefined();
    p = applyMove(p, f2f3!);
    // e5 (black pawn e7-e5)
    const e7e5 = legalMoves(p).find((m) => m.from[0] === 4 && m.from[1] === 6 && m.to[0] === 4 && m.to[1] === 4);
    expect(e7e5).toBeDefined();
    p = applyMove(p, e7e5!);
    // g4 (white pawn g2-g4)
    const g2g4 = legalMoves(p).find((m) => m.from[0] === 6 && m.from[1] === 1 && m.to[0] === 6 && m.to[1] === 3);
    expect(g2g4).toBeDefined();
    p = applyMove(p, g2g4!);
    // Qh4# (queen d8-h4)
    const qh4 = legalMoves(p).find((m) => m.from[0] === 3 && m.from[1] === 7 && m.to[0] === 7 && m.to[1] === 3);
    expect(qh4).toBeDefined();
    p = applyMove(p, qh4!);
    expect(isCheck(p, 'w')).toBe(true);
    const s = status(p);
    expect(s.kind).toBe('checkmate');
    if (s.kind === 'checkmate') expect(s.winner).toBe('b');
  });
});

describe('castling', () => {
  test('king-side castle is legal once squares clear', () => {
    let p = startingPosition();
    // Clear g1 and f1 by moving the knight + bishop + pawn out of the way.
    // Quick path: e4, Nf3, Bc4, then O-O is legal.
    const moves = ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f1c4', 'f8c5'];
    for (const m of moves) {
      const ff = m.charCodeAt(0) - 97;
      const fr = parseInt(m[1]!, 10) - 1;
      const tf = m.charCodeAt(2) - 97;
      const tr = parseInt(m[3]!, 10) - 1;
      const found = legalMoves(p).find(
        (mv) => mv.from[0] === ff && mv.from[1] === fr && mv.to[0] === tf && mv.to[1] === tr,
      );
      expect(found).toBeDefined();
      p = applyMove(p, found!);
    }
    const castle = legalMoves(p).find((mv) => mv.isCastle === 'k');
    expect(castle).toBeDefined();
  });
});

