import { describe, it, expect } from "vitest";
import {
  goalsAgainst,
  resolveDuel,
  encodeDuel,
  decodeDuel,
  duelUrl,
  readDuelFromHash,
  penaltyShotSaved,
  penaltyShotSavedWithReach,
  readShooter,
  aiStrike,
  type Zone,
  type DuelSide,
} from "./duel";

const Z = (s: string): Zone[] => [...s].map((c) => (c === "L" ? -1 : c === "R" ? 1 : 0));
/** A deterministic rng that cycles through fixed values. */
const rngOf = (vals: number[]): (() => number) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe("goalsAgainst", () => {
  it("scores when the shot avoids the keeper's dive", () => {
    // shots L M R L R  vs dives L L L L L → goals when zone differs: M,R,_,R = 3
    expect(goalsAgainst(Z("LMRLR"), Z("LLLLL"))).toBe(3);
    expect(goalsAgainst(Z("LMRLR"), Z("LMRLR"))).toBe(0); // keeper reads everything
  });
  it("lets rich placement beat a same-side keeper with pace and height", () => {
    expect(penaltyShotSaved({ zone: 1, x: 0.92, y: 0.88, power: 0.98, bend: -0.4 }, 1)).toBe(false);
    expect(goalsAgainst(Z("R"), Z("R"), [{ zone: 1, x: 0.92, y: 0.88, power: 0.98, bend: -0.4 }])).toBe(1);
  });
  it("still saves tame rich shots in the keeper envelope", () => {
    expect(penaltyShotSaved({ zone: -1, x: 0.25, y: 0.44, power: 0.45, bend: 0 }, -1)).toBe(true);
    expect(goalsAgainst(Z("L"), Z("L"), [{ zone: -1, x: 0.25, y: 0.44, power: 0.45, bend: 0 }])).toBe(0);
  });
  it("blocks weak central shots even when the keeper has started to move", () => {
    expect(penaltyShotSaved({ zone: 0, x: 0.53, y: 0.3, power: 0.56, bend: 0 }, 1)).toBe(true);
  });
  it("lets harder keepers reach medium side shots without making perfect corners free", () => {
    expect(penaltyShotSavedWithReach({ zone: 1, x: 0.82, y: 0.58, power: 0.76, bend: 0.05 }, 1, 1.2)).toBe(true);
    expect(penaltyShotSavedWithReach({ zone: 1, x: 0.96, y: 0.94, power: 1, bend: -0.45 }, 1, 1.2)).toBe(false);
  });
  it("counts the keeper's whole body, not just an abstract glove bubble", () => {
    expect(penaltyShotSavedWithReach({ zone: 1, x: 0.73, y: 0.28, power: 0.98, bend: 0 }, 1, 1)).toBe(true);
    expect(penaltyShotSavedWithReach({ zone: -1, x: 0.27, y: 0.5, power: 0.95, bend: 0 }, -1, 1)).toBe(true);
    expect(penaltyShotSavedWithReach({ zone: 1, x: 0.82, y: 0.58, power: 0.9, bend: 0 }, -1, 1)).toBe(false);
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

describe("readShooter (AI keeper)", () => {
  it("guesses blind with no confidence on the first shot", () => {
    const r = readShooter([], rngOf([0.0]));
    expect(r.confidence).toBe(0);
    expect([-1, 0, 1]).toContain(r.dive);
  });
  it("reads a one-sided shooter and dives their favourite", () => {
    // history all Left → favourite is L; low rng falls in the read-chance branch.
    const r = readShooter(Z("LLLL"), rngOf([0.01]));
    expect(r.dive).toBe(-1);
    expect(r.confidence).toBeGreaterThan(0.8);
  });
  it("has low confidence on a balanced shooter", () => {
    const r = readShooter(Z("LMR"), rngOf([0.99, 0.0]));
    expect(r.confidence).toBeLessThan(0.2);
  });
});

describe("aiStrike (AI striker)", () => {
  it("targets the zone the human dives to least", () => {
    // human always dives Left → AI should avoid Left. force no-random, no-feint.
    const s = aiStrike(Z("LLLLL"), rngOf([0.99, 0.99]));
    expect(s.zone).not.toBe(-1);
    expect(s.feint).toBe(false);
    expect(s.tell).toBe(s.zone); // honest tell
  });
  it("can throw a feint where the tell lies", () => {
    // rng: first>0.35 (no random pick), second<0.3 (feint), third picks the lie index.
    const s = aiStrike(Z("MMMMM"), rngOf([0.99, 0.0, 0.0]));
    expect(s.feint).toBe(true);
    expect(s.tell).not.toBe(s.zone);
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
  it("round-trips optional placement for new penalty links", () => {
    const detailed = {
      a: {
        name: "Sam",
        shots: Z("R"),
        dives: Z("L"),
        shotDetails: [{ zone: 1 as Zone, x: 0.91, y: 0.83, power: 0.96, bend: -0.2 }],
      },
    };
    expect(decodeDuel(encodeDuel(detailed))).toEqual(detailed);
  });
  it("reads from a hash + rejects others", () => {
    const url = duelUrl(duel, "https://x/");
    expect(readDuelFromHash(url.slice(url.indexOf("#")))?.a.name).toBe("Sam");
    expect(readDuelFromHash("#pk=ABC~Sam~ggsmg")).toBeNull();
    expect(decodeDuel("rubbish")).toBeNull();
  });
});
