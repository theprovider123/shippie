import { describe, expect, it } from "vitest";
import { TEAMS, team } from "../data/teams";
import {
  GROUPS,
  GROUP_FIXTURES,
  GROUP_LETTERS,
  BRACKET_SHAPE,
  ROUNDS,
} from "../data/tournament";
import {
  championOf,
  completion,
  isComplete,
  prunePicks,
  resolveBracket,
  standingsFromPrediction,
} from "./bracket";
import {
  CHAMPION_BONUS,
  GROUP_FIRST_POINTS,
  GROUP_SECOND_POINTS,
  hasResults,
  scorePrediction,
} from "./scoring";
import { decodeShare, encodeShare, readShareFromHash, shareUrl } from "./codec";
import { SCHEMA_VERSION, type Prediction, type Results } from "./types";

// ── helpers ─────────────────────────────────────────────────────────────────

/** A prediction where every group finishes in its declared roster order. */
function fullGroups(): Prediction["groups"] {
  const groups: Prediction["groups"] = {};
  for (const l of GROUP_LETTERS) groups[l] = [...GROUPS[l]];
  return groups;
}

/** Resolve round-by-round, always advancing the first participant. */
function fillKnockout(groups: Prediction["groups"]): Record<string, string> {
  const knockout: Record<string, string> = {};
  for (const round of ROUNDS) {
    const { participants } = resolveBracket(groups, knockout);
    for (const slot of BRACKET_SHAPE[round]) {
      const [a] = participants[slot.id] ?? [null];
      if (a) knockout[slot.id] = a;
    }
  }
  return knockout;
}

function fullPrediction(): Prediction {
  const groups = fullGroups();
  return {
    v: SCHEMA_VERSION,
    groups,
    knockout: fillKnockout(groups),
    createdAt: 1700000000000,
  };
}

// ── teams + tournament shape ─────────────────────────────────────────────────

describe("field", () => {
  it("has 48 teams seeded 1..48 with unique ids", () => {
    expect(TEAMS).toHaveLength(48);
    const ids = new Set(TEAMS.map((t) => t.id));
    expect(ids.size).toBe(48);
    const seeds = TEAMS.map((t) => t.seed).sort((a, b) => a - b);
    expect(seeds).toEqual(Array.from({ length: 48 }, (_, i) => i + 1));
  });

  it("has 12 groups of 4 covering all 48 teams exactly once", () => {
    expect(GROUP_LETTERS).toHaveLength(12);
    const all = GROUP_LETTERS.flatMap((l) => GROUPS[l]);
    expect(all).toHaveLength(48);
    expect(new Set(all).size).toBe(48);
    for (const id of all) expect(() => team(id)).not.toThrow();
  });

  it("ships 72 official group fixtures", () => {
    expect(GROUP_FIXTURES).toHaveLength(72);
    // every fixture references real teams in its own group
    for (const f of GROUP_FIXTURES) {
      expect(GROUPS[f.group]).toContain(f.home);
      expect(GROUPS[f.group]).toContain(f.away);
    }
    expect(GROUP_FIXTURES[0]).toMatchObject({
      id: "m01",
      fifaId: "400021443",
      matchNumber: 1,
      home: "MEX",
      away: "RSA",
      kickoff: "2026-06-11T19:00:00Z",
      venue: { stadium: "Mexico City Stadium", tz: "America/Mexico_City" },
    });
  });
});

// ── bracket resolution ───────────────────────────────────────────────────────

describe("bracket", () => {
  it("turns full group standings into 32 R32 entrants", () => {
    const groups = fullGroups();
    const { r32 } = resolveBracket(groups, {});
    expect(r32).toHaveLength(32);
    expect(r32.every((x) => typeof x === "string")).toBe(true);
    expect(new Set(r32).size).toBe(32); // no duplicate qualifier
  });

  it("standingsFromPrediction needs all four places", () => {
    const partial = standingsFromPrediction({ A: ["MEX", "CRO"] });
    expect(partial.A).toBeUndefined();
    const full = standingsFromPrediction({ A: [...GROUPS.A] });
    expect(full.A?.first).toBe(GROUPS.A[0]);
  });

  it("a fully-filled bracket is complete and crowns a champion", () => {
    const pred = fullPrediction();
    expect(isComplete(pred)).toBe(true);
    expect(championOf(pred)).toBe(pred.knockout["F-0"]);
    expect(completion(pred)).toBe(1);
  });

  it("prunePicks drops picks that are no longer valid participants", () => {
    const groups = fullGroups();
    const knockout = fillKnockout(groups);
    // Find an R32 slot and confirm its winner is currently valid.
    const { participants } = resolveBracket(groups, knockout);
    const slot = "R32-0";
    const [a] = participants[slot];
    expect(knockout[slot]).toBe(a);

    // Reverse group A's order: its old winner (A[0]) is now 4th and can't
    // qualify the same way — any knockout pick relying on it must be pruned.
    const reversed: Prediction["groups"] = {
      ...groups,
      A: [...GROUPS.A].reverse(),
    };
    const pruned = prunePicks(reversed, knockout);
    const { participants: after } = resolveBracket(reversed, pruned);
    // Every surviving pick must be one of its slot's actual participants.
    for (const [slotId, pick] of Object.entries(pruned)) {
      const parts = after[slotId];
      expect(parts === undefined ? [] : parts).toContain(pick);
    }
    // Pruning never invents picks.
    expect(Object.keys(pruned).length).toBeLessThanOrEqual(
      Object.keys(knockout).length,
    );
  });

  it("reports partial completion between 0 and 1", () => {
    const empty: Prediction = {
      v: SCHEMA_VERSION,
      groups: {},
      knockout: {},
      createdAt: 0,
    };
    expect(completion(empty)).toBe(0);
    const some: Prediction = {
      v: SCHEMA_VERSION,
      groups: { A: [...GROUPS.A], B: [...GROUPS.B] },
      knockout: {},
      createdAt: 0,
    };
    expect(completion(some)).toBeGreaterThan(0);
    expect(completion(some)).toBeLessThan(1);
  });
});

// ── scoring ──────────────────────────────────────────────────────────────────

describe("scoring", () => {
  it("awards group points for correct 1st and 2nd only", () => {
    const pred: Prediction = {
      v: SCHEMA_VERSION,
      groups: { A: ["MEX", "CRO", "ECU", "GHA"] },
      knockout: {},
      createdAt: 0,
    };
    const results: Results = {
      groups: { A: ["MEX", "CRO", "GHA", "ECU"] }, // 1st + 2nd correct
      knockout: {},
    };
    const s = scorePrediction(pred, results);
    expect(s.groupPoints).toBe(GROUP_FIRST_POINTS + GROUP_SECOND_POINTS);
    expect(s.total).toBe(GROUP_FIRST_POINTS + GROUP_SECOND_POINTS);
  });

  it("awards round weights, correct-call count and the champion bonus", () => {
    const pred: Prediction = {
      v: SCHEMA_VERSION,
      groups: {},
      knockout: { "R32-0": "BRA", "F-0": "BRA" },
      createdAt: 0,
    };
    const results: Results = {
      groups: {},
      knockout: { "R32-0": "BRA", "F-0": "BRA" },
    };
    const s = scorePrediction(pred, results);
    expect(s.knockoutPoints.R32).toBe(1);
    expect(s.knockoutPoints.F).toBe(16);
    expect(s.championBonus).toBe(CHAMPION_BONUS);
    expect(s.correctCalls).toBe(2);
    expect(s.total).toBe(1 + 16 + CHAMPION_BONUS);
  });

  it("scores nothing when picks miss", () => {
    const pred = fullPrediction();
    const results: Results = { groups: {}, knockout: { "F-0": "__none__" } };
    expect(hasResults(results)).toBe(true);
    expect(scorePrediction(pred, results).total).toBe(0);
  });

  it("hasResults is false for an empty result set", () => {
    expect(hasResults({ groups: {}, knockout: {} })).toBe(false);
  });
});

// ── share codec ──────────────────────────────────────────────────────────────

describe("share codec", () => {
  it("round-trips a prediction through encode/decode", () => {
    const pred = fullPrediction();
    const payload = {
      name: "Devante",
      uid: "abc123",
      favTeam: "BRA",
      prediction: pred,
    };
    const code = encodeShare(payload);
    const back = decodeShare(code);
    expect(back).not.toBeNull();
    expect(back?.name).toBe("Devante");
    expect(back?.uid).toBe("abc123");
    expect(back?.favTeam).toBe("BRA");
    expect(back?.prediction.knockout["F-0"]).toBe(pred.knockout["F-0"]);
    expect(back?.prediction.groups.A).toEqual(pred.groups.A);
  });

  it("rejects junk codes", () => {
    expect(decodeShare("not-base64!!")).toBeNull();
    expect(decodeShare("")).toBeNull();
  });

  it("builds and reads back a share URL hash", () => {
    const pred = fullPrediction();
    const payload = { name: "Sam", uid: "u1", prediction: pred };
    const url = shareUrl(payload, "https://shippie.app/golazo");
    expect(url).toContain("#b=");
    const hash = url.slice(url.indexOf("#"));
    const back = readShareFromHash(hash);
    expect(back?.uid).toBe("u1");
    expect(back?.name).toBe("Sam");
  });
});
