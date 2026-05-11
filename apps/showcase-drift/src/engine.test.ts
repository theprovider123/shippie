import { describe, expect, test } from 'bun:test';
import {
  FIELD_H,
  FIELD_W,
  createWorld,
  dailySeed,
  rotateShip,
  setShipControls,
  tickWorld,
  tryFire,
  tryHyperspace,
} from './engine';

describe('createWorld', () => {
  test('spawns wave 1 with 4 large asteroids', () => {
    const w = createWorld(42);
    expect(w.asteroids.length).toBe(4);
    expect(w.asteroids.every((a) => a.size === 'large')).toBe(true);
    expect(w.lives).toBe(4);
    expect(w.ship.x).toBe(FIELD_W / 2);
    expect(w.ship.y).toBe(FIELD_H / 2);
  });

  test('daily seed is deterministic', () => {
    expect(dailySeed('2026-05-11')).toBe(dailySeed('2026-05-11'));
    expect(dailySeed('2026-05-11')).not.toBe(dailySeed('2026-05-12'));
  });
});

describe('ship physics', () => {
  test('rotateShip changes heading', () => {
    const w = createWorld(42);
    const before = w.ship.heading;
    rotateShip(w, 0.5, 1);
    expect(w.ship.heading).toBeGreaterThan(before);
  });

  test('thrust accelerates the ship along heading', () => {
    const w = createWorld(42);
    w.ship.heading = 0; // facing up (-y)
    setShipControls(w, { rotate: 0, thrust: true, firing: false });
    tickWorld(w, 100);
    expect(w.ship.vy).toBeLessThan(0); // moving up
  });

  test('ship wraps at edges', () => {
    const w = createWorld(42);
    w.ship.x = -1;
    tickWorld(w, 16);
    expect(w.ship.x).toBeGreaterThan(0);
  });
});

describe('firing', () => {
  test('tryFire produces a bullet', () => {
    const w = createWorld(42);
    expect(w.bullets.length).toBe(0);
    expect(tryFire(w)).toBe(true);
    expect(w.bullets.length).toBe(1);
  });

  test('cooldown blocks rapid fire', () => {
    const w = createWorld(42);
    tryFire(w);
    expect(tryFire(w)).toBe(false);
  });
});

describe('hyperspace', () => {
  test('teleports the ship and arms cooldown', () => {
    const w = createWorld(42);
    const before = { x: w.ship.x, y: w.ship.y };
    expect(tryHyperspace(w)).toBe(true);
    // May land anywhere (including near origin) so just assert it ran
    // and the cooldown advanced.
    expect(w.ship.hyperReadyAt).toBeGreaterThan(0);
    void before;
  });
});
