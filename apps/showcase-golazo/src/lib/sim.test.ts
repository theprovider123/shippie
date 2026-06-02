import { describe, it, expect } from "vitest";
import { simulateTournament } from "./sim";
import { GROUP_LETTERS } from "../data/tournament";

describe("simulateTournament", () => {
  it("produces a full, internally-consistent tournament", () => {
    const r = simulateTournament();
    // every group decided
    for (const l of GROUP_LETTERS) expect(r.groups[l]?.length).toBe(4);
    // a champion exists and it's the top scorer default
    expect(r.knockout["F-0"]).toBeTruthy();
    expect(r.topScorer).toBe(r.knockout["F-0"]);
    // the final's two semi-final winners feed it
    expect(r.knockout["SF-0"]).toBeTruthy();
    expect(r.knockout["SF-1"]).toBeTruthy();
  });
});
