import { describe, expect, test } from 'bun:test';
import { canPlace, createWorld, place, refillBag, SHAPES, SIZE, isPerfectClear } from './engine';

describe('createWorld', () => {
  test('starts empty with 3 shapes in the bag', () => {
    const w = createWorld(42);
    expect(w.score).toBe(0);
    expect(w.bag.filter((s) => s !== null).length).toBe(3);
    expect(w.board.length).toBe(SIZE);
    expect(w.board[0]!.length).toBe(SIZE);
    expect(w.board.every((r) => r.every((v) => v === 0))).toBe(true);
  });

  test('seeded bag is deterministic', () => {
    const a = createWorld(99);
    const b = createWorld(99);
    expect(a.bag.map((s) => s?.length ?? -1)).toEqual(b.bag.map((s) => s?.length ?? -1));
  });
});

describe('canPlace', () => {
  test('rejects placement out of bounds', () => {
    const w = createWorld(7);
    expect(canPlace(w.board, SHAPES[3]!, 0, SIZE - 1)).toBe(false);
  });

  test('accepts placement in empty board', () => {
    const w = createWorld(7);
    expect(canPlace(w.board, SHAPES[0]!, 0, 0)).toBe(true);
  });
});

describe('place + clearing', () => {
  test('placing a single tile awards 1 + marks the cell', () => {
    const w = createWorld(123);
    // Force shape 0 (single) into bag slot 0.
    w.bag[0] = SHAPES[0]!;
    const r = place(w, 0, 4, 4);
    expect(r?.cleared).toBe(0);
    expect(r?.earned).toBe(1);
    expect(w.board[4]![4]).toBe(1);
  });

  test('full row clears and awards combo bonus', () => {
    const w = createWorld(123);
    // Manually fill row 0 except for the last cell.
    for (let c = 0; c < SIZE - 1; c++) w.board[0]![c] = 1;
    w.bag[0] = SHAPES[0]!; // single
    const r = place(w, 0, 0, SIZE - 1);
    expect(r?.rowsCleared).toBe(1);
    expect(r?.cleared).toBe(SIZE);
  });

  test('isPerfectClear true on empty board', () => {
    const w = createWorld(11);
    expect(isPerfectClear(w)).toBe(true);
  });
});

describe('refillBag', () => {
  test('refills 3 shapes', () => {
    const w = createWorld(5);
    w.bag = [null, null, null];
    refillBag(w);
    expect(w.bag.filter((s) => s !== null).length).toBe(3);
  });
});
