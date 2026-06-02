import { describe, it, expect } from "vitest";
import type { Results } from "./types";
import { teamStage, isAlive } from "./progress";
import {
  scopePool,
  drawClassic,
  drawFor,
  classicOverflow,
  potTotal,
  sweepStandings,
  sweepWinners,
  isSettled,
  type Sweep,
} from "./sweeps";
import { encodeSweep, decodeSweep, sweepUrl, readSweepFromHash } from "./codec";

// A scenario: ARG champion, FRA runner-up, BRA out in semis, MEX qualified but
// lost R32, GHA played the group and went out, ZZZ never appears.
const results: Results = {
  groups: {
    A: ["MEX", "CRO", "ECU", "GHA"], // MEX 1st, CRO 2nd qualify; GHA 4th
  },
  knockout: {
    "QF-2": "BRA", // BRA won QF → reached SF
    "SF-0": "ARG", // ARG won SF → reached final
    "SF-1": "FRA", // FRA won SF → reached final
    "F-0": "ARG", // ARG won final → champion
  },
};

describe("teamStage", () => {
  it("reads each stage from results", () => {
    expect(teamStage("ARG", results)).toBe("champion");
    expect(teamStage("FRA", results)).toBe("F");
    expect(teamStage("BRA", results)).toBe("SF");
    expect(teamStage("MEX", results)).toBe("R32"); // qualified, no KO win
    expect(teamStage("GHA", results)).toBe("group"); // played, didn't qualify
    expect(teamStage("KSA", results)).toBe("out"); // never appears
    expect(teamStage(null, results)).toBe("out");
  });
  it("knows who is still alive once the final is decided", () => {
    expect(isAlive("ARG", results)).toBe(true); // champion
    expect(isAlive("FRA", results)).toBe(false); // final decided, not champ
  });
});

describe("scopePool", () => {
  it("slices the field by seed", () => {
    expect(scopePool("all48").length).toBe(48);
    expect(scopePool("top32").length).toBe(32);
    expect(scopePool("top16").length).toBe(16);
    // top16 is a subset of top32
    const t16 = new Set(scopePool("top16"));
    expect(scopePool("top32").filter((id) => t16.has(id)).length).toBe(16);
  });
});

describe("drawClassic", () => {
  const members = ["Sam", "Mo", "Ada", "Kit"];
  it("deals exactly one nation per player", () => {
    const draw = drawClassic(members, "SEED01", scopePool("all48"));
    for (const m of members) expect(draw[m]).toHaveLength(1);
  });
  it("is deterministic for the same seed", () => {
    const a = drawClassic(members, "SEED01");
    const b = drawClassic(members, "SEED01");
    expect(a).toEqual(b);
  });
  it("gives different deals for different seeds", () => {
    const a = drawClassic(members, "SEED01");
    const b = drawClassic(members, "SEED02");
    expect(a).not.toEqual(b);
  });
  it("assigns unique teams when players ≤ pool", () => {
    const draw = drawClassic(members, "SEED01", scopePool("top16"));
    const dealt = Object.values(draw).flat();
    expect(new Set(dealt).size).toBe(dealt.length);
  });
});

describe("draw modes + scope", () => {
  const base: Sweep = {
    id: "s1",
    name: "Office",
    seed: "SEED01",
    members: ["Sam", "Mo", "Ada"],
    createdAt: 0,
  };
  it("classic deals one each, draft splits the whole pool", () => {
    const classic = drawFor({ ...base, mode: "classic", scope: "top16" });
    const draft = drawFor({ ...base, mode: "draft", scope: "top16" });
    expect(Object.values(classic).every((t) => t.length === 1)).toBe(true);
    expect(Object.values(draft).flat().length).toBe(16); // whole pool dealt
  });
  it("flags classic overflow when players exceed the pool", () => {
    const many = { ...base, mode: "classic" as const, scope: "top16" as const, members: Array.from({ length: 20 }, (_, i) => `P${i}`) };
    expect(classicOverflow(many)).toBe(true);
    expect(classicOverflow({ ...base, mode: "classic", scope: "all48" })).toBe(false);
  });
});

describe("pot", () => {
  it("multiplies stake by players", () => {
    expect(potTotal({ id: "s", name: "x", seed: "S", members: ["a", "b", "c"], createdAt: 0, stake: 10 })).toBe(30);
    expect(potTotal({ id: "s", name: "x", seed: "S", members: ["a", " ", "b"], createdAt: 0, stake: 5 })).toBe(10); // blanks ignored
    expect(potTotal({ id: "s", name: "x", seed: "S", members: ["a"], createdAt: 0 })).toBe(0);
  });
});

describe("standings + winner", () => {
  // Build a classic sweep with enough players that someone owns ARG.
  // Draft mode deals all 48 teams, so the champion (ARG) is guaranteed owned.
  const members = ["Sam", "Mo", "Ada", "Kit", "Lee", "Jo", "Ash", "Ren"];
  const sweep: Sweep = { id: "s", name: "Cup", seed: "POThfd", members, createdAt: 0, mode: "draft", scope: "all48" };

  it("ranks the champion's owner first and names them the winner", () => {
    const draw = drawFor(sweep);
    const champOwner = Object.entries(draw).find(([, teams]) => teams.includes("ARG"))?.[0];
    expect(champOwner).toBeTruthy();
    const standings = sweepStandings(sweep, results);
    expect(standings[0].member).toBe(champOwner);
    expect(standings[0].bestStage).toBe("champion");
    expect(sweepWinners(sweep, results)).toContain(champOwner);
  });
  it("returns no winner before any results", () => {
    const empty: Results = { groups: {}, knockout: {} };
    expect(sweepWinners(sweep, empty)).toEqual([]);
    expect(isSettled(empty)).toBe(false);
  });
  it("knows the pot can be settled once there's a champion", () => {
    expect(isSettled(results)).toBe(true);
  });
});

describe("shared draw link", () => {
  const sweep: Sweep = {
    id: "s",
    name: "Friday Sweep",
    seed: "ABC123",
    members: ["Sam", "Mo"],
    createdAt: 123,
    mode: "classic",
    scope: "top32",
    stake: 5,
    currency: "£",
  };
  it("round-trips through encode/decode", () => {
    const decoded = decodeSweep(encodeSweep(sweep));
    expect(decoded).toMatchObject({
      name: "Friday Sweep",
      seed: "ABC123",
      members: ["Sam", "Mo"],
      mode: "classic",
      scope: "top32",
      stake: 5,
      currency: "£",
    });
  });
  it("everyone who opens the link recomputes the identical deal", () => {
    const decoded = decodeSweep(encodeSweep(sweep))!;
    expect(drawFor(decoded)).toEqual(drawFor(sweep));
  });
  it("reads a sweep out of a URL hash", () => {
    const url = sweepUrl(sweep, "https://x/");
    const hash = url.slice(url.indexOf("#"));
    const back = readSweepFromHash(hash);
    expect(back?.seed).toBe("ABC123");
    expect(readSweepFromHash("#b=somebracket")).toBeNull();
  });
});
