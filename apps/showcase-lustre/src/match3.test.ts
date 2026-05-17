import { describe, expect, test } from 'bun:test';
import {
  SIZE,
  adjacent,
  applyGravity,
  clearCells,
  cloneBoard,
  findMatches,
  levelTarget,
  makeBoard,
  promoteSpecials,
  refillBoard,
  scoreClear,
  setBoardSeed,
  swap,
  type Board,
  type Cell,
  type Color,
} from './match3';

function fixture(rows: number[][]): Board {
  return rows.map((row) => row.map((c) => ({ color: c as Color, special: 'none' as const }))) as Board;
}

describe('makeBoard', () => {
  test('produces an 8×8 board with no initial matches', () => {
    setBoardSeed('lustre-test-1');
    const b = makeBoard();
    expect(b.length).toBe(SIZE);
    expect(b[0]!.length).toBe(SIZE);
    expect(findMatches(b)).toEqual([]);
  });

  test('deterministic with same seed', () => {
    setBoardSeed('repeat-1');
    const a = makeBoard();
    setBoardSeed('repeat-1');
    const b = makeBoard();
    expect(a).toEqual(b);
  });
});

describe('findMatches', () => {
  test('finds a single horizontal match', () => {
    const b = fixture([
      [0, 0, 0, 1, 2, 3, 4, 5],
      [1, 2, 3, 4, 5, 0, 1, 2],
      [2, 3, 4, 5, 0, 1, 2, 3],
      [3, 4, 5, 0, 1, 2, 3, 4],
      [4, 5, 0, 1, 2, 3, 4, 5],
      [5, 0, 1, 2, 3, 4, 5, 0],
      [0, 1, 2, 3, 4, 5, 0, 1],
      [1, 2, 3, 4, 5, 0, 1, 2],
    ]);
    const matches = findMatches(b);
    expect(matches.length).toBe(1);
    expect(matches[0]?.length).toBe(3);
    expect(matches[0]?.axis).toBe('row');
  });

  test('finds a vertical 4-match', () => {
    const b = fixture([
      [0, 1, 2, 3, 4, 5, 0, 1],
      [0, 2, 3, 4, 5, 0, 1, 2],
      [0, 3, 4, 5, 0, 1, 2, 3],
      [0, 4, 5, 0, 1, 2, 3, 4],
      [4, 5, 0, 1, 2, 3, 4, 5],
      [5, 0, 1, 2, 3, 4, 5, 0],
      [0, 1, 2, 3, 4, 5, 0, 1],
      [1, 2, 3, 4, 5, 0, 1, 2],
    ]);
    const matches = findMatches(b);
    const vertical = matches.find((m) => m.axis === 'col' && m.length === 4);
    expect(vertical).toBeDefined();
  });
});

describe('promoteSpecials', () => {
  test('4-match → bomb', () => {
    const groups = [
      {
        cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }],
        axis: 'row' as const,
        length: 4,
      },
    ];
    const out = promoteSpecials(groups, null);
    expect(out.length).toBe(1);
    expect(out[0]?.special).toBe('bomb');
  });

  test('5-match → rainbow', () => {
    const groups = [
      {
        cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }, { r: 0, c: 4 }],
        axis: 'row' as const,
        length: 5,
      },
    ];
    const out = promoteSpecials(groups, null);
    expect(out[0]?.special).toBe('rainbow');
  });
});

describe('cascade ops', () => {
  test('clearCells + applyGravity drops surviving cells down', () => {
    const b = fixture([
      [0, 1, 2, 3, 4, 5, 0, 1],
      [1, 2, 3, 4, 5, 0, 1, 2],
      [2, 3, 4, 5, 0, 1, 2, 3],
      [3, 4, 5, 0, 1, 2, 3, 4],
      [4, 5, 0, 1, 2, 3, 4, 5],
      [5, 0, 1, 2, 3, 4, 5, 0],
      [0, 1, 2, 3, 4, 5, 0, 1],
      [1, 2, 3, 4, 5, 0, 1, 2],
    ]);
    clearCells(b, [{ r: 7, c: 0 }, { r: 6, c: 0 }, { r: 5, c: 0 }]);
    applyGravity(b);
    // Original column 0 top→bottom: [0,1,2,3,4,5,0,1].
    // Cleared rows 5/6/7 leave [0,1,2,3,4] which fall to rows 3-7.
    expect(b[7]![0]!.color).toBe(4);
    expect(b[5]![0]!.color).toBe(2);
    expect(b[3]![0]!.color).toBe(0);
    // Top three should be marked empty (color = -1 sentinel).
    expect(b[0]![0]!.color).toBe(-1);
    expect(b[1]![0]!.color).toBe(-1);
    expect(b[2]![0]!.color).toBe(-1);
  });

  test('refillBoard fills empty cells', () => {
    setBoardSeed('refill-1');
    const b = makeBoard();
    clearCells(b, [{ r: 0, c: 0 }, { r: 1, c: 0 }]);
    applyGravity(b);
    refillBoard(b);
    expect(b[0]![0]!.color).not.toBe(-1);
    expect(b[1]![0]!.color).not.toBe(-1);
  });
});

describe('swap + adjacent', () => {
  test('adjacent rejects non-cardinal pairs', () => {
    expect(adjacent({ r: 0, c: 0 }, { r: 0, c: 1 })).toBe(true);
    expect(adjacent({ r: 0, c: 0 }, { r: 1, c: 0 })).toBe(true);
    expect(adjacent({ r: 0, c: 0 }, { r: 1, c: 1 })).toBe(false);
    expect(adjacent({ r: 0, c: 0 }, { r: 0, c: 0 })).toBe(false);
  });

  test('swap is symmetric', () => {
    setBoardSeed('swap-1');
    const b = makeBoard();
    const original = cloneBoard(b);
    swap(b, { r: 0, c: 0 }, { r: 0, c: 1 });
    swap(b, { r: 0, c: 0 }, { r: 0, c: 1 });
    expect(b).toEqual(original);
  });
});

describe('scoring', () => {
  test('3-match scores 30 (10×3 ×1.0)', () => {
    expect(scoreClear({
      cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }],
      axis: 'row',
      length: 3,
    })).toBe(30);
  });

  test('4-match scores 60 (10×4 ×1.5)', () => {
    expect(scoreClear({
      cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }],
      axis: 'row',
      length: 4,
    })).toBe(60);
  });

  test('5+ match scores 100 (10×5 ×2.0)', () => {
    expect(scoreClear({
      cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }, { r: 0, c: 4 }],
      axis: 'row',
      length: 5,
    })).toBe(100);
  });
});

describe('level targets', () => {
  test('targets scale with level', () => {
    expect(levelTarget(1).scoreTarget).toBeLessThan(levelTarget(20).scoreTarget);
    expect(levelTarget(1).movesAllowed).toBeGreaterThan(levelTarget(20).movesAllowed);
  });
});
