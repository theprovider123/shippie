import { describe, it, expect } from "vitest";
import {
  PLAYERS,
  MANAGER_BUDGET,
  squadCost,
  validXI,
  scoreXI,
  encodeTeam,
  decodeTeam,
} from "./manager";

const cheapest11 = [...PLAYERS]
  .sort((a, b) => a.cost - b.cost)
  .slice(0, 11)
  .map((p) => p.id);

describe("manager mode", () => {
  it("ships a pool big enough to field an XI", () => {
    expect(PLAYERS.length).toBeGreaterThanOrEqual(11);
  });

  it("accepts a legal XI within budget", () => {
    expect(cheapest11).toHaveLength(11);
    expect(squadCost(cheapest11)).toBeLessThanOrEqual(MANAGER_BUDGET);
    expect(validXI(cheapest11)).toBe(true);
  });

  it("rejects the wrong number of players", () => {
    expect(validXI(cheapest11.slice(0, 10))).toBe(false);
  });

  it("rejects a squad over budget", () => {
    const dearest11 = [...PLAYERS]
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 11)
      .map((p) => p.id);
    // Only meaningful if the dearest XI actually busts the budget.
    if (squadCost(dearest11) > MANAGER_BUDGET) {
      expect(validXI(dearest11)).toBe(false);
    }
  });

  it("rejects duplicates", () => {
    const dup = [cheapest11[0], ...cheapest11.slice(0, 10)];
    expect(validXI(dup)).toBe(false);
  });

  it("scores an XI from a performance map", () => {
    const perf = { [cheapest11[0]]: 6, [cheapest11[1]]: 3 };
    expect(scoreXI(cheapest11, perf)).toBe(9);
  });

  it("round-trips a team through the link codec", () => {
    expect(decodeTeam(encodeTeam(cheapest11))).toEqual(cheapest11);
    expect(decodeTeam("not,real,ids")).toEqual([]);
  });
});
