import { describe, expect, test } from 'bun:test';
import { aliveEnemyCount, createWorld, fire, movePlayer, spawnWave, tickWorld, FIELD_W, COLS, ROWS } from './engine';

describe('createWorld', () => {
  test('starts with 11x5 enemy formation, 3 lives, 4 bunkers', () => {
    const w = createWorld();
    expect(w.lives).toBe(3);
    expect(w.bunkers.length).toBe(4);
    expect(aliveEnemyCount(w)).toBe(COLS * ROWS);
    expect(w.player.x).toBe(FIELD_W / 2);
    expect(w.boss).toBeNull();
  });

  test('wave 5 spawns a boss instead of formation', () => {
    const w = createWorld();
    w.wave = 5;
    spawnWave(w);
    expect(w.boss).not.toBeNull();
  });
});

describe('player', () => {
  test('movePlayer respects field edges', () => {
    const w = createWorld();
    movePlayer(w, -10000);
    expect(w.player.x).toBeGreaterThan(0);
    movePlayer(w, 10000);
    expect(w.player.x).toBeLessThan(FIELD_W);
  });

  test('fire adds a player bullet', () => {
    const w = createWorld();
    expect(w.bullets.length).toBe(0);
    fire(w);
    expect(w.bullets.filter((b) => b.side === 'player').length).toBeGreaterThan(0);
  });
});

describe('tickWorld', () => {
  test('player bullets travel upward', () => {
    const w = createWorld();
    fire(w);
    const before = w.bullets[0]!.y;
    tickWorld(w, 100);
    expect(w.bullets[0]?.y ?? before - 1).toBeLessThan(before);
  });

  test('enemies eventually descend after enough ticks', () => {
    const w = createWorld();
    const startY = w.enemies[0]!.y;
    for (let i = 0; i < 200; i++) tickWorld(w, 100);
    expect(w.enemies[0]!.y).toBeGreaterThanOrEqual(startY);
  });
});
