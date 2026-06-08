import { describe, expect, it } from "vitest";
import { Hitstop } from "./juice";

describe("Hitstop", () => {
  it("returns full speed (1) when idle", () => {
    const h = new Hitstop();
    expect(h.scale()).toBe(1);
    expect(h.active).toBe(false);
  });

  it("hard-freezes for the hold frames after a kick", () => {
    const h = new Hitstop();
    h.kick(1, 3);
    const a = h.scale();
    const b = h.scale();
    const c = h.scale();
    expect(a).toBeLessThan(0.2);
    expect(b).toBeLessThan(0.2);
    expect(c).toBeLessThan(0.2);
    expect(h.active).toBe(true);
  });

  it("ramps back toward full speed and then settles exactly at 1", () => {
    const h = new Hitstop();
    h.kick(1, 1);
    h.scale(); // consume the hold frame
    let prev = h.scale();
    for (let i = 0; i < 60; i++) {
      const s = h.scale();
      expect(s).toBeGreaterThanOrEqual(prev - 1e-9); // monotonic recovery
      prev = s;
    }
    expect(h.scale()).toBe(1);
    expect(h.active).toBe(false);
  });

  it("never returns a scale above 1 or below 0", () => {
    const h = new Hitstop();
    h.kick(5, 2); // out of range strength
    for (let i = 0; i < 40; i++) {
      const s = h.scale();
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("a stronger kick takes longer to recover", () => {
    const soft = new Hitstop();
    const hard = new Hitstop();
    soft.kick(0.3, 0);
    hard.kick(1, 0);
    let softFrames = 0, hardFrames = 0;
    while (soft.active && softFrames < 200) { soft.scale(); softFrames++; }
    while (hard.active && hardFrames < 200) { hard.scale(); hardFrames++; }
    expect(hardFrames).toBeGreaterThan(softFrames);
  });
});
