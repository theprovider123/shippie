import { describe, expect, test } from 'bun:test';
import {
  createWorld,
  dailySeed,
  queueDirection,
  SIZE,
  stepIntervalMs,
  stepWorld,
} from './engine';

describe('createWorld', () => {
  test('starts with a 3-segment snake facing east', () => {
    const w = createWorld('classic', 42);
    expect(w.snake.length).toBe(3);
    expect(w.dir).toBe('E');
    expect(w.state).toBe('playing');
    expect(w.score).toBe(0);
  });

  test('daily-seeded world is deterministic', () => {
    const a = createWorld('daily', 99);
    const b = createWorld('daily', 99);
    expect(a.apple).toEqual(b.apple);
  });
});

describe('queueDirection', () => {
  test('queues a perpendicular direction', () => {
    const w = createWorld('classic', 7);
    queueDirection(w, 'N');
    expect(w.queuedDir).toBe('N');
  });

  test('ignores reverse-into-self', () => {
    const w = createWorld('classic', 7);
    queueDirection(w, 'W'); // opposite of E
    expect(w.queuedDir).toBeNull();
  });
});

describe('stepWorld', () => {
  test('moves head one cell in current direction', () => {
    const w = createWorld('classic', 5);
    const head = w.snake[0]!;
    stepWorld(w);
    expect(w.snake[0]!.c).toBe(head.c + 1);
  });

  test('wraps edges in loop mode', () => {
    const w = createWorld('loop', 5);
    // Move snake to right wall.
    w.snake = [{ c: SIZE - 1, r: 5 }, { c: SIZE - 2, r: 5 }, { c: SIZE - 3, r: 5 }];
    w.dir = 'E';
    stepWorld(w);
    expect(w.snake[0]!.c).toBe(0);
    expect(w.state).toBe('playing');
  });

  test('classic mode kills on wall hit', () => {
    const w = createWorld('classic', 5);
    w.snake = [{ c: SIZE - 1, r: 5 }, { c: SIZE - 2, r: 5 }, { c: SIZE - 3, r: 5 }];
    w.dir = 'E';
    stepWorld(w);
    expect(w.state).toBe('over');
  });

  test('eating apple grows snake + bumps score', () => {
    const w = createWorld('classic', 5);
    const head = w.snake[0]!;
    w.apple = { c: head.c + 1, r: head.r };
    const lengthBefore = w.snake.length;
    stepWorld(w);
    expect(w.snake.length).toBe(lengthBefore + 1);
    expect(w.score).toBe(10);
    expect(w.applesEaten).toBe(1);
  });
});

describe('stepIntervalMs', () => {
  test('starts at base speed', () => {
    const w = createWorld('classic', 5);
    expect(stepIntervalMs(w)).toBeCloseTo(160, 0);
  });

  test('speeds up after 5 apples', () => {
    const w = createWorld('classic', 5);
    w.applesEaten = 5;
    expect(stepIntervalMs(w)).toBeLessThan(160);
  });
});

describe('dailySeed', () => {
  test('produces the same number for the same date', () => {
    expect(dailySeed('2026-05-11')).toBe(dailySeed('2026-05-11'));
  });

  test('different dates produce different seeds', () => {
    expect(dailySeed('2026-05-11')).not.toBe(dailySeed('2026-05-12'));
  });
});
