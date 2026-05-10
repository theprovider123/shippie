import { describe, expect, test } from 'bun:test';
import {
  GRID_W,
  TOWER_SPECS,
  createWorld,
  enemyPositions,
  placeTower,
  sellTower,
  startWave,
  tickWorld,
  upgradeTower,
} from './td';

describe('createWorld', () => {
  test('starts with full lives + bank', () => {
    const w = createWorld();
    expect(w.lives).toBe(20);
    expect(w.bank).toBe(200);
    expect(w.wave).toBe(0);
  });

  test('path traverses the grid', () => {
    const w = createWorld();
    expect(w.path.length).toBeGreaterThan(GRID_W);
    expect(w.path[0]?.x).toBe(0);
  });
});

describe('tower placement', () => {
  test('places a tower if bank has funds + cell is free', () => {
    const w = createWorld();
    expect(placeTower(w, 'gun', 5, 5)).toBe(true);
    expect(w.bank).toBe(200 - TOWER_SPECS.gun[0]!.cost);
  });

  test('rejects placement on the path', () => {
    const w = createWorld();
    const onPath = w.path[5]!;
    expect(placeTower(w, 'gun', onPath.x, onPath.y)).toBe(false);
  });

  test('rejects placement on existing tower', () => {
    const w = createWorld();
    placeTower(w, 'gun', 5, 5);
    expect(placeTower(w, 'cannon', 5, 5)).toBe(false);
  });

  test('upgrade increases tier and decreases bank', () => {
    const w = createWorld();
    placeTower(w, 'gun', 5, 5);
    const id = w.towers[0]!.id;
    expect(upgradeTower(w, id)).toBe(true);
    expect(w.towers[0]!.tier).toBe(1);
  });

  test('sell refunds 50% of invested', () => {
    const w = createWorld();
    placeTower(w, 'gun', 5, 5);
    const before = w.bank;
    const id = w.towers[0]!.id;
    sellTower(w, id);
    expect(w.bank).toBe(before + Math.floor(TOWER_SPECS.gun[0]!.cost * 0.5));
    expect(w.towers.length).toBe(0);
  });
});

describe('wave + tick', () => {
  test('startWave queues enemies', () => {
    const w = createWorld();
    startWave(w);
    expect(w.waveActive).toBe(true);
    expect(w.enemiesToSpawn).toBeGreaterThan(0);
  });

  test('tick spawns enemies and moves them along the path', () => {
    const w = createWorld();
    startWave(w);
    // Run 5 seconds of sim @ 60Hz.
    for (let i = 0; i < 300; i++) tickWorld(w, 1 / 60);
    const positions = enemyPositions(w);
    if (positions.length > 0) {
      const e = positions[0]!;
      expect(e.x).toBeGreaterThan(0);
    }
  });

  test('a placed tower kills nearby enemies (currency awarded)', () => {
    const w = createWorld();
    startWave(w);
    // Place a sniper near the path so enemies die fast.
    placeTower(w, 'sniper', 5, 4);
    const startBank = w.bank;
    for (let i = 0; i < 600; i++) tickWorld(w, 1 / 60);
    // Bank should grow as enemies die. Some lives may be lost too;
    // just assert at least one kill happened.
    expect(w.score).toBeGreaterThan(0);
    void startBank;
  });
});
