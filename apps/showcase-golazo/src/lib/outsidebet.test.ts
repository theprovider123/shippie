import { describe, it, expect } from "vitest";
import { spinNation, landed } from "./outsidebet";
import type { Results } from "./types";

const FIELD = ["BRA", "ARG", "ENG", "KSA", "JPN", "GHA"];

describe("outside bet roulette", () => {
  it("always lands on a nation from the field", () => {
    for (let s = 0; s < 50; s++) {
      expect(FIELD).toContain(spinNation(s, FIELD));
    }
  });

  it("is deterministic for a given seed", () => {
    expect(spinNation(7, FIELD)).toBe(spinNation(7, FIELD));
  });

  it("can produce different nations across seeds", () => {
    const seen = new Set(Array.from({ length: 20 }, (_, s) => spinNation(s, FIELD)));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("landed", () => {
  const results: Results = {
    groups: { A: ["KSA", "BRA", "ENG", "JPN"] }, // KSA tops the group
    knockout: { "R32-0": "GHA" }, // GHA won an R32 tie
  };

  it("is true when your nation finished top-two of a group", () => {
    expect(landed("KSA", results)).toBe(true);
    expect(landed("BRA", results)).toBe(true);
  });

  it("is true when your nation won a knockout tie", () => {
    expect(landed("GHA", results)).toBe(true);
  });

  it("is false when your nation went out / no result", () => {
    expect(landed("ENG", results)).toBe(false); // 3rd in the group
    expect(landed("ARG", results)).toBe(false); // not in any result
  });
});
