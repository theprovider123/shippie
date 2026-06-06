import { describe, it, expect } from "vitest";
import { tribeStats } from "./tribe";
import type { Prediction } from "./types";

function pred(champ?: string, outsideBet?: string): Prediction {
  return {
    v: 1,
    groups: {},
    knockout: champ ? { "F-0": champ } : {},
    outsideBet,
    createdAt: 0,
  };
}

describe("tribeStats", () => {
  it("reports the share of the lot backing your champion", () => {
    const mine = pred("BRA", "KSA");
    const field = [mine, pred("BRA"), pred("ARG", "KSA"), pred("ARG", "FRA")];
    const stats = tribeStats(mine, field);
    const champ = stats.find((s) => s.label.includes("Brazil"));
    expect(champ).toBeDefined();
    expect(champ!.pct).toBe(50);
  });

  it("counts how many others share your outside bet", () => {
    const mine = pred("BRA", "KSA");
    const field = [mine, pred("BRA"), pred("ARG", "KSA"), pred("ARG", "FRA")];
    const stats = tribeStats(mine, field);
    const ob = stats.find((s) => s.label.includes("Saudi Arabia"));
    expect(ob).toBeDefined();
    // 1 other person (of 4) also called KSA → 50% of the field, 1 other believer
    expect(ob!.pct).toBe(50);
    expect(ob!.label).toContain("1 other");
  });

  it("flags a contrarian outside bet nobody else called", () => {
    const mine = pred("BRA", "QAT");
    const field = [mine, pred("BRA"), pred("ARG")];
    const stats = tribeStats(mine, field);
    const ob = stats.find((s) => s.label.includes("Qatar"));
    expect(ob).toBeDefined();
    expect(ob!.label.toLowerCase()).toContain("only you");
  });

  it("returns no champion stat when no champion is picked", () => {
    const mine = pred(undefined, "KSA");
    const field = [mine, pred("BRA")];
    const stats = tribeStats(mine, field);
    expect(stats.some((s) => s.label.toLowerCase().includes("win it"))).toBe(false);
  });
});
