import { describe, it, expect } from "vitest";
import {
  goalsAgainst,
  resolveDuel,
  encodeDuel,
  decodeDuel,
  duelUrl,
  readDuelFromHash,
  type Zone,
  type DuelSide,
} from "./duel";

const Z = (s: string): Zone[] => [...s].map((c) => (c === "L" ? -1 : c === "R" ? 1 : 0));

describe("goalsAgainst", () => {
  it("scores when the shot avoids the keeper's dive", () => {
    // shots L M R L R  vs dives L L L L L → goals when zone differs: M,R,_,R = 3
    expect(goalsAgainst(Z("LMRLR"), Z("LLLLL"))).toBe(3);
    expect(goalsAgainst(Z("LMRLR"), Z("LMRLR"))).toBe(0); // keeper reads everything
  });
});

describe("resolveDuel", () => {
  const a: DuelSide = { name: "A", shots: Z("LLLLL"), dives: Z("MMMMM") };
  const b: DuelSide = { name: "B", shots: Z("LLLLL"), dives: Z("RRRRR") };
  it("a shoots vs b dives, b shoots vs a dives", () => {
    // a shots L vs b dives R → all 5 goals; b shots L vs a dives M → all 5 goals → draw
    const r = resolveDuel(a, b);
    expect(r.aGoals).toBe(5);
    expect(r.bGoals).toBe(5);
    expect(r.outcome).toBe("draw");
  });
  it("names a winner", () => {
    const sharp: DuelSide = { name: "Keeper", shots: Z("LLLLL"), dives: Z("LLLLL") };
    // a shots L vs sharp dives L → 0; sharp shots L vs a dives M → 5 → b wins
    expect(resolveDuel(a, sharp).outcome).toBe("b");
  });
});

describe("codec", () => {
  const duel = {
    a: { name: "Sam", shots: Z("LMRLM"), dives: Z("RRLMM") },
    b: { name: "Mo", shots: Z("MMLRL"), dives: Z("LLRRM") },
  };
  it("round-trips a two-leg duel", () => {
    expect(decodeDuel(encodeDuel(duel))).toEqual(duel);
  });
  it("round-trips a one-leg (challenge) duel", () => {
    const oneLeg = { a: duel.a };
    expect(decodeDuel(encodeDuel(oneLeg))).toEqual(oneLeg);
  });
  it("reads from a hash + rejects others", () => {
    const url = duelUrl(duel, "https://x/");
    expect(readDuelFromHash(url.slice(url.indexOf("#")))?.a.name).toBe("Sam");
    expect(readDuelFromHash("#pk=ABC~Sam~ggsmg")).toBeNull();
    expect(decodeDuel("rubbish")).toBeNull();
  });
});
