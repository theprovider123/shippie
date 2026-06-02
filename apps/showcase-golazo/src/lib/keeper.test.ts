import { describe, it, expect } from "vitest";
import { keeperConfig, saved, rampedDifficulty, Keeper } from "./keeper";

describe("keeperConfig", () => {
  it("a harder keeper has more reach and less error", () => {
    const easy = keeperConfig(0.2);
    const hard = keeperConfig(0.85);
    expect(hard.reach).toBeGreaterThan(easy.reach);
    expect(hard.error).toBeLessThan(easy.error);
    expect(hard.speed).toBeGreaterThan(easy.speed);
  });
  it("clamps out-of-range difficulty", () => {
    expect(keeperConfig(-5)).toEqual(keeperConfig(0));
    expect(keeperConfig(9)).toEqual(keeperConfig(1));
  });
});

describe("saved", () => {
  it("saves when the keeper is within reach + ball radius", () => {
    expect(saved(100, 110, 12, 6)).toBe(true); // 10 apart, reach+r = 18
    expect(saved(100, 140, 12, 6)).toBe(false); // 40 apart
  });
});

describe("rampedDifficulty", () => {
  it("rises with score and caps", () => {
    expect(rampedDifficulty(0.3, 0)).toBeCloseTo(0.3);
    expect(rampedDifficulty(0.3, 4)).toBeCloseTo(0.5);
    expect(rampedDifficulty(0.3, 100)).toBeLessThanOrEqual(0.92);
  });
});

describe("Keeper", () => {
  it("commits within the goal and reduces error as difficulty rises", () => {
    const easy = new Keeper(0, 100, keeperConfig(0.2));
    const hard = new Keeper(0, 100, keeperConfig(0.9));
    // deterministic rng at the error extreme
    easy.commit(50, () => 1);
    hard.commit(50, () => 1);
    expect(easy.target).toBeGreaterThanOrEqual(0);
    expect(easy.target).toBeLessThanOrEqual(100);
    // hard keeper's worst-case guess is closer to the true cross (50)
    expect(Math.abs(hard.target - 50)).toBeLessThan(Math.abs(easy.target - 50));
  });
  it("dives toward its target over frames", () => {
    const k = new Keeper(0, 100, keeperConfig(0.6));
    k.commit(90, () => 0.5); // no error
    const before = k.x;
    for (let i = 0; i < 30; i++) k.update();
    expect(k.x).toBeGreaterThan(before);
    expect(k.x).toBeCloseTo(90, 0);
  });
  it("patrols the line when idle", () => {
    const k = new Keeper(0, 100, keeperConfig(0.5));
    const start = k.x;
    k.update(3);
    expect(k.x).not.toBe(start);
    expect(k.diving).toBe(false);
  });
});
