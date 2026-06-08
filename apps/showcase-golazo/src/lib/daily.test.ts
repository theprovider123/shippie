import { describe, expect, it } from "vitest";
import { dailySeed, seededRng, dailyKey } from "./daily";

describe("dailySeed / dailyKey", () => {
  it("is stable for the same calendar day", () => {
    const a = new Date(2026, 5, 8, 9, 0, 0);
    const b = new Date(2026, 5, 8, 23, 30, 0);
    expect(dailySeed(a)).toBe(dailySeed(b));
    expect(dailyKey(a)).toBe(dailyKey(b));
  });

  it("differs across days", () => {
    expect(dailySeed(new Date(2026, 5, 8))).not.toBe(dailySeed(new Date(2026, 5, 9)));
  });

  it("dailyKey is a readable yyyy-mm-dd", () => {
    expect(dailyKey(new Date(2026, 5, 8))).toBe("2026-06-08");
  });
});

describe("seededRng", () => {
  it("is deterministic for a given seed", () => {
    const a = seededRng(123);
    const b = seededRng(123);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0,1)", () => {
    const r = seededRng(999);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds diverge", () => {
    const a = seededRng(1), b = seededRng(2);
    expect(a()).not.toBe(b());
  });
});
