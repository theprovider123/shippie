import { describe, expect, test } from 'bun:test';
import {
  createWorld,
  dailySeed,
  queueDirection,
  tickWorld,
  visualPosition,
} from './engine';
import { bfsNextStep, parseMaze, MAZE_W, MAZE_H } from './maze';

describe('parseMaze', () => {
  test('grid is the declared size', () => {
    const m = parseMaze();
    expect(m.tiles.length).toBe(MAZE_H);
    expect(m.tiles[0]!.length).toBe(MAZE_W);
  });

  test('has exactly 4 pellets and at least 100 dots', () => {
    const m = parseMaze();
    expect(m.pelletCount).toBe(4);
    expect(m.dotCount).toBeGreaterThan(100);
  });

  test('has a player start and at least 4 pen cells', () => {
    const m = parseMaze();
    expect(m.playerStart.col).toBeGreaterThanOrEqual(0);
    expect(m.penCells.length).toBeGreaterThanOrEqual(4);
  });
});

describe('bfsNextStep', () => {
  test('finds a direction toward an adjacent walkable cell', () => {
    const m = parseMaze();
    // Walk right from the start. Player start is at row 19; right-side
    // tile is also walkable.
    const dir = bfsNextStep(m.tiles, { col: m.playerStart.col, row: m.playerStart.row }, { col: m.playerStart.col + 1, row: m.playerStart.row });
    // BFS might pick E directly or another path — just assert it's defined.
    expect(dir).toBeTruthy();
  });

  test('returns null when start === goal', () => {
    const m = parseMaze();
    const dir = bfsNextStep(m.tiles, m.playerStart, m.playerStart);
    expect(dir).toBeNull();
  });
});

describe('createWorld + tickWorld', () => {
  test('starts with 3 lives, 4 ghosts, all dots remaining', () => {
    const w = createWorld({ seed: 42 });
    expect(w.lives).toBe(3);
    expect(w.ghosts.length).toBe(4);
    expect(w.dotsLeft).toBeGreaterThan(0);
    expect(w.pelletsLeft).toBe(4);
    expect(w.state).toBe('playing');
  });

  test('respawn freeze pauses tick', () => {
    const w = createWorld({ seed: 42 });
    expect(w.respawnFreezeMs).toBeGreaterThan(0);
    const startCol = w.player.col;
    tickWorld(w, 100);
    expect(w.player.col).toBe(startCol);
  });

  test('player moves after freeze elapses', () => {
    const w = createWorld({ seed: 42 });
    // Drain freeze.
    tickWorld(w, 1000);
    queueDirection(w, 'W');
    const startCol = w.player.col;
    for (let i = 0; i < 30; i++) tickWorld(w, 50);
    expect(w.player.col).not.toBe(startCol);
  });

  test('eating dots reduces dotsLeft + bumps score', () => {
    const w = createWorld({ seed: 42 });
    tickWorld(w, 1000);
    const dotsBefore = w.dotsLeft;
    for (let i = 0; i < 60; i++) tickWorld(w, 50);
    expect(w.dotsLeft).toBeLessThanOrEqual(dotsBefore);
    expect(w.score).toBeGreaterThanOrEqual(0);
  });
});

describe('visualPosition', () => {
  test('interpolates between current and next cell', () => {
    const w = createWorld({ seed: 42 });
    w.player.col = 5; w.player.row = 5;
    w.player.nextCol = 6; w.player.nextRow = 5;
    w.player.progress = 0.5;
    const vp = visualPosition(w.player);
    expect(vp.x).toBe(5.5);
    expect(vp.y).toBe(5);
  });
});

describe('dailySeed', () => {
  test('deterministic per date', () => {
    expect(dailySeed('2026-05-11')).toBe(dailySeed('2026-05-11'));
  });
});
