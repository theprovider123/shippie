import { describe, expect, test } from 'bun:test';
import { COLS, ROWS, generateLevel, hitsObstacle, laneObstacles } from './levels';

describe('generateLevel', () => {
  test('produces 13 lanes (start + 5 road + median + 5 river + goal)', () => {
    const lvl = generateLevel(1);
    expect(lvl.lanes.length).toBe(ROWS);
    expect(lvl.lanes[0]?.kind).toBe('safe');
    expect(lvl.lanes[6]?.kind).toBe('safe');
    expect(lvl.lanes[12]?.kind).toBe('safe');
    expect(lvl.lanes[1]?.kind).toBe('road');
    expect(lvl.lanes[7]?.kind).toBe('river');
  });

  test('higher level → faster lanes', () => {
    const easy = generateLevel(1);
    const hard = generateLevel(20);
    const easySpeed = Math.abs(easy.lanes[1]?.speed ?? 0);
    const hardSpeed = Math.abs(hard.lanes[1]?.speed ?? 0);
    expect(hardSpeed).toBeGreaterThan(easySpeed);
  });

  test('deterministic per (level, salt)', () => {
    const a = generateLevel(5, 0);
    const b = generateLevel(5, 0);
    expect(a).toEqual(b);
  });

  test('different salts produce different layouts', () => {
    const a = generateLevel(5, 0);
    const b = generateLevel(5, 1234);
    // Lane seeds should differ even though the kind/speed don't.
    expect(a.lanes[1]?.seed).not.toEqual(b.lanes[1]?.seed);
  });

  test('COLS is the playfield width', () => {
    expect(COLS).toBeGreaterThanOrEqual(7); // plausible playfield
  });
});

describe('lane physics', () => {
  test('safe lane has no obstacles + no collision', () => {
    const lvl = generateLevel(1);
    const safe = lvl.lanes[0]!;
    expect(laneObstacles(safe, 0)).toEqual([]);
    expect(hitsObstacle(safe, 0, 5)).toBe(false);
  });

  test('road lane obstacles move with time', () => {
    const lvl = generateLevel(5);
    const road = lvl.lanes[1]!;
    const t0 = laneObstacles(road, 0);
    const t1 = laneObstacles(road, 1);
    // The set of obstacles should differ as the lane scrolls.
    expect(JSON.stringify(t0)).not.toEqual(JSON.stringify(t1));
  });
});
