import { describe, expect, test } from 'bun:test';
import {
  BRICK_COLS,
  BRICK_ROWS,
  FIELD_W,
  PADDLE_W,
  aliveBrickCount,
  createWorld,
  dailySeed,
  launchBall,
  movePaddleTo,
  tickWorld,
} from './engine';

describe('createWorld', () => {
  test('starts with bricks + a ball attached to paddle', () => {
    const w = createWorld(1, 42);
    expect(w.bricks.length).toBeGreaterThan(0);
    expect(w.bricks.length).toBeLessThanOrEqual(BRICK_COLS * BRICK_ROWS);
    expect(w.balls.length).toBe(1);
    expect(w.balls[0]!.attached).toBe(true);
    expect(w.lives).toBe(3);
  });

  test('higher levels have variable layouts', () => {
    const easy = createWorld(1, 42);
    const hard = createWorld(8, 42);
    // Hard levels skip some cells.
    expect(hard.bricks.length).toBeLessThanOrEqual(easy.bricks.length);
  });
});

describe('paddle', () => {
  test('movePaddleTo clamps to field', () => {
    const w = createWorld(1, 42);
    movePaddleTo(w, -100);
    expect(w.paddle.x).toBeGreaterThan(0);
    movePaddleTo(w, FIELD_W + 100);
    expect(w.paddle.x).toBeLessThan(FIELD_W);
  });

  test('sticky ball follows paddle', () => {
    const w = createWorld(1, 42);
    movePaddleTo(w, 100);
    expect(w.balls[0]!.x).toBe(100);
  });
});

describe('launchBall + tickWorld', () => {
  test('launchBall releases all attached balls with negative vy', () => {
    const w = createWorld(1, 42);
    launchBall(w);
    expect(w.balls[0]!.attached).toBe(false);
    expect(w.balls[0]!.vy).toBeLessThan(0);
  });

  test('ball travels upward over a few ticks', () => {
    const w = createWorld(1, 42);
    launchBall(w);
    const yBefore = w.balls[0]!.y;
    for (let i = 0; i < 5; i++) tickWorld(w, 16);
    expect(w.balls[0]!.y).toBeLessThan(yBefore);
  });

  test('alive brick count decreases as bricks are destroyed', () => {
    const w = createWorld(1, 42);
    const before = aliveBrickCount(w);
    // Hand-break one brick.
    w.bricks[0]!.hp = 0;
    expect(aliveBrickCount(w)).toBe(before - 1);
  });
});

describe('dailySeed', () => {
  test('deterministic per date', () => {
    expect(dailySeed('2026-05-11')).toBe(dailySeed('2026-05-11'));
  });
});
