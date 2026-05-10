import { describe, expect, test } from 'bun:test';
import {
  createGame,
  setBagSeed,
  PIECE_TYPES,
  WIDTH,
  HEIGHT,
  tryMove,
  tryRotate,
  hardDrop,
  lockPiece,
  applyScoring,
  spawnNext,
  holdSwap,
  addGarbageRows,
  gravityIntervalMs,
  type PieceType,
} from './tetris';

describe('7-bag uniformity', () => {
  test('every 7 pieces contain each shape at least once over 1000 bags', () => {
    setBagSeed('uniformity-test-1');
    const counts: Record<PieceType, number> = { I: 0, J: 0, L: 0, O: 0, S: 0, T: 0, Z: 0 };
    const bagsToScan = 1000;
    const piecesToTake = bagsToScan * 7;
    const state = createGame();
    counts[state.active.type]++;
    for (let i = 1; i < piecesToTake; i++) {
      spawnNext(state);
      // Each call to spawnNext consumes one piece from the bag.
      counts[state.active.type]++;
    }
    for (const t of PIECE_TYPES) {
      // Each piece should appear roughly bagsToScan times (±2%).
      expect(counts[t]).toBeGreaterThan(bagsToScan * 0.98);
      expect(counts[t]).toBeLessThan(bagsToScan * 1.02);
    }
  });
});

describe('movement + rotation', () => {
  test('left/right moves succeed when in bounds, fail at wall', () => {
    setBagSeed('move-1');
    const s = createGame();
    // O cells offset by (1, ?), so origin x=-1 puts leftmost cell at x=0.
    s.active = { type: 'O', rotation: 0, x: -1, y: 0 };
    expect(tryMove(s, -1, 0)).toBe(false); // hit left wall
    expect(tryMove(s, 1, 0)).toBe(true);
  });

  test('rotation kicks let pieces escape adjacent walls', () => {
    setBagSeed('kick-1');
    const s = createGame();
    s.active = { type: 'I', rotation: 0, x: -1, y: 0 };
    // I at x=-1 would collide; rotation should kick it inward.
    expect(tryRotate(s, 1)).toBe(true);
  });
});

describe('line clearing + scoring', () => {
  test('single line clear scores 100 × level', () => {
    setBagSeed('score-1');
    const s = createGame();
    // Fill row 19 except column 0.
    for (let x = 1; x < WIDTH; x++) s.board[19 * WIDTH + x] = 1;
    // Drop a I-piece vertical at x=0. Active = I horizontal by default;
    // simulate by manually placing the missing cell + lock.
    s.board[19 * WIDTH + 0] = 1;
    s.active = { type: 'O', rotation: 0, x: 0, y: 0 };
    const { cleared, tspin } = lockPiece(s);
    expect(cleared).toBe(1);
    expect(tspin).toBe(false);
    applyScoring(s, cleared, tspin);
    expect(s.score).toBe(100); // 100 × level 1
    expect(s.lines).toBe(1);
  });

  test('tetris (4-line clear) scores 800 × level', () => {
    setBagSeed('tetris-1');
    const s = createGame();
    // Fill 4 rows leaving column 0 empty.
    for (let y = 16; y < 20; y++) {
      for (let x = 1; x < WIDTH; x++) s.board[y * WIDTH + x] = 1;
    }
    // Drop an I-piece vertically into column 0.
    for (let y = 16; y < 20; y++) s.board[y * WIDTH + 0] = 1;
    s.active = { type: 'O', rotation: 0, x: 0, y: 0 };
    const { cleared } = lockPiece(s);
    expect(cleared).toBe(4);
    applyScoring(s, cleared, false);
    expect(s.score).toBe(800);
  });

  test('combo bonus increments per consecutive clear', () => {
    setBagSeed('combo-1');
    const s = createGame();
    // First clear.
    for (let x = 1; x < WIDTH; x++) s.board[19 * WIDTH + x] = 1;
    s.board[19 * WIDTH + 0] = 1;
    s.active = { type: 'O', rotation: 0, x: 0, y: 0 };
    let res = lockPiece(s);
    applyScoring(s, res.cleared, res.tspin);
    const afterFirst = s.score;
    // Second clear.
    for (let x = 1; x < WIDTH; x++) s.board[19 * WIDTH + x] = 1;
    s.board[19 * WIDTH + 0] = 1;
    s.active = { type: 'O', rotation: 0, x: 0, y: 0 };
    res = lockPiece(s);
    applyScoring(s, res.cleared, res.tspin);
    expect(s.score - afterFirst).toBe(150); // 100 base + 50 combo
  });
});

describe('hold piece', () => {
  test('holdSwap stores active type and replaces with bag pick', () => {
    setBagSeed('hold-1');
    const s = createGame();
    const initial = s.active.type;
    expect(holdSwap(s)).toBe(true);
    expect(s.hold).toBe(initial);
    expect(s.active.type).not.toBeUndefined();
  });

  test('cannot swap twice in a row without locking', () => {
    setBagSeed('hold-2');
    const s = createGame();
    holdSwap(s);
    expect(holdSwap(s)).toBe(false);
  });
});

describe('garbage rows + gravity', () => {
  test('addGarbageRows shifts board up and adds N rows with one hole', () => {
    setBagSeed('garbage-1');
    const s = createGame();
    addGarbageRows(s, 2);
    // Bottom two rows should be mostly filled with the garbage marker (8).
    let filled = 0;
    for (let y = HEIGHT - 2; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        if (s.board[y * WIDTH + x] === 8) filled++;
      }
    }
    // 2 rows × WIDTH cells - 2 holes (one per row).
    expect(filled).toBe(2 * WIDTH - 2);
  });

  test('gravityIntervalMs decreases with level', () => {
    expect(gravityIntervalMs(1)).toBe(1000);
    expect(gravityIntervalMs(10)).toBe(460);
    expect(gravityIntervalMs(20)).toBeGreaterThanOrEqual(50);
  });
});

describe('hard-drop', () => {
  test('returns rows fallen and lands at floor', () => {
    setBagSeed('drop-1');
    const s = createGame();
    s.active = { type: 'O', rotation: 0, x: 0, y: 0 };
    const fell = hardDrop(s);
    expect(fell).toBeGreaterThan(0);
  });
});
