import { describe, it, expect } from "vitest";
import { rankEntries, tagFor, mostWrong } from "./receipts";
import type { PoolEntry, Prediction, Results } from "./types";

function pred(groupsA: string[] | null, knockout: Record<string, string> = {}): Prediction {
  return {
    v: 1,
    groups: groupsA ? { A: groupsA } : {},
    knockout,
    createdAt: 0,
  };
}
function entry(uid: string, name: string, p: Prediction): PoolEntry {
  return { uid, name, prediction: p, importedAt: 0 };
}

// Results: Group A finishes BRA (1st), ARG (2nd), ENG, FRA.
const RESULTS: Results = { groups: { A: ["BRA", "ARG", "ENG", "FRA"] }, knockout: {} };
const NO_RESULTS: Results = { groups: {}, knockout: {} };

describe("receipts", () => {
  it("ranks entries by points, highest first, with positions", () => {
    const marcus = entry("m", "Marcus", pred(["BRA", "ARG", "ENG", "FRA"])); // 5+3 = 8
    const jordan = entry("j", "Jordan", pred(["JPN", "ENG", "BRA", "FRA"])); // 0
    const ranked = rankEntries([jordan, marcus], RESULTS);
    expect(ranked.map((r) => r.entry.name)).toEqual(["Marcus", "Jordan"]);
    expect(ranked[0].pos).toBe(1);
    expect(ranked[0].pts).toBe(8);
    expect(ranked[1].pos).toBe(2);
  });

  it("tags an un-tipped entry as Silent", () => {
    const e = entry("s", "Steph", pred(null));
    const ranked = rankEntries([e], RESULTS);
    expect(tagFor(ranked[0], ranked, RESULTS)?.label).toBe("Silent");
  });

  it("tags the leader 'Called it' and the bottom 'Bottled It 💀' once scored", () => {
    const marcus = entry("m", "Marcus", pred(["BRA", "ARG", "ENG", "FRA"]));
    const jordan = entry("j", "Jordan", pred(["JPN", "ENG", "BRA", "FRA"]));
    const ranked = rankEntries([marcus, jordan], RESULTS);
    expect(tagFor(ranked[0], ranked, RESULTS)).toEqual({ label: "Called it", tone: "good" });
    expect(tagFor(ranked[1], ranked, RESULTS)).toEqual({ label: "Bottled It 💀", tone: "bad" });
  });

  it("does not crow before any results exist", () => {
    const marcus = entry("m", "Marcus", pred(["BRA", "ARG", "ENG", "FRA"]));
    const jordan = entry("j", "Jordan", pred(["JPN", "ENG", "BRA", "FRA"]));
    const ranked = rankEntries([marcus, jordan], NO_RESULTS);
    expect(tagFor(ranked[0], ranked, NO_RESULTS)).toBeNull();
  });

  it("names the most-wrong with a specific wrong group-winner callout", () => {
    const marcus = entry("m", "Marcus", pred(["BRA", "ARG", "ENG", "FRA"]));
    const jordan = entry("j", "Jordan", pred(["JPN", "ENG", "BRA", "FRA"]));
    const mw = mostWrong([marcus, jordan], RESULTS);
    expect(mw).not.toBeNull();
    expect(mw!.name).toBe("Jordan");
    expect(mw!.line).toContain("Jordan");
    expect(mw!.line).toContain("Japan");
    expect(mw!.line).toContain("Group A");
  });

  it("returns no receipts with fewer than two entries or no results", () => {
    const marcus = entry("m", "Marcus", pred(["BRA", "ARG", "ENG", "FRA"]));
    expect(mostWrong([marcus], RESULTS)).toBeNull();
    expect(mostWrong([marcus, entry("j", "Jordan", pred(null))], NO_RESULTS)).toBeNull();
  });
});
