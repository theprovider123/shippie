import { describe, expect, it } from "vitest";
import { drawSweep } from "./sweeps";
import { emptyFeed, feedHasResults, mergeResults, normalizeFeed, resultCount } from "./feed";
import { TEAMS } from "../data/teams";
import { formatKickoff } from "./zones";

describe("sweepstakes draw", () => {
  const people = ["Sam", "Devante", "Alex", "Mo"];

  it("is deterministic for the same members + seed", () => {
    const a = drawSweep(people, "SEED01");
    const b = drawSweep(people, "SEED01");
    expect(a).toEqual(b);
  });

  it("deals all 48 nations, distributed evenly (±1)", () => {
    const draw = drawSweep(people, "SEED01");
    const all = Object.values(draw).flat();
    expect(all).toHaveLength(48);
    expect(new Set(all).size).toBe(48); // no team dealt twice
    const counts = people.map((p) => draw[p].length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("every dealt id is a real team", () => {
    const draw = drawSweep(people, "X");
    const ids = new Set(TEAMS.map((t) => t.id));
    for (const teamId of Object.values(draw).flat()) {
      expect(ids.has(teamId)).toBe(true);
    }
  });

  it("a different seed generally yields a different deal", () => {
    const a = drawSweep(people, "SEED01");
    const b = drawSweep(people, "SEED99");
    expect(a).not.toEqual(b);
  });

  it("handles fewer than two people gracefully", () => {
    expect(drawSweep([], "S")).toEqual({});
    expect(Object.keys(drawSweep(["Solo"], "S"))).toEqual(["Solo"]);
  });
});

describe("tournament feed", () => {
  it("coerces junk into an empty feed", () => {
    expect(normalizeFeed(null)).toEqual(emptyFeed());
    expect(normalizeFeed(42)).toEqual(emptyFeed());
    expect(normalizeFeed({ news: "nope", live: 5 })).toEqual(emptyFeed());
  });

  it("parses a valid feed and detects results", () => {
    const feed = normalizeFeed({
      updatedAt: "2026-06-11T18:00:00Z",
      news: [{ at: "t", text: "Brazil through" }, { text: "" }],
      live: [
        {
          matchId: "m01",
          home: "MEX",
          away: "CRO",
          homeGoals: 2,
          awayGoals: 1,
          minute: "78'",
          status: "live",
        },
        { matchId: "", home: "x", away: "y" }, // dropped (no id)
      ],
      results: { groups: { A: ["MEX", "CRO", "ECU", "GHA"] }, knockout: { "F-0": "BRA" } },
    });
    expect(feed.news).toHaveLength(1);
    expect(feed.live).toHaveLength(1);
    expect(feed.live[0].status).toBe("live");
    expect(feedHasResults(feed)).toBe(true);
    expect(feed.results.knockout["F-0"]).toBe("BRA");
  });

  it("empty feed has no results", () => {
    expect(feedHasResults(emptyFeed())).toBe(false);
  });

  it("merges partial score updates without deleting known results", () => {
    const current = {
      groups: { A: ["MEX", "RSA", "KOR", "NOR"] },
      knockout: { "R32-0": "MEX" },
    };
    const incoming = {
      groups: { B: ["ITA", "GER", "SUI", "SWE"] },
      knockout: { "R32-0": "RSA", "R32-1": "ITA" },
      topScorer: "ARG",
    };
    const merged = mergeResults(current, incoming);

    expect(merged.groups.A).toEqual(["MEX", "RSA", "KOR", "NOR"]);
    expect(merged.groups.B).toEqual(["ITA", "GER", "SUI", "SWE"]);
    expect(merged.knockout["R32-0"]).toBe("RSA");
    expect(merged.knockout["R32-1"]).toBe("ITA");
    expect(merged.topScorer).toBe("ARG");
    expect(resultCount(merged)).toBe(5);
  });
});

describe("local kickoff formatting", () => {
  it("renders the same instant differently per timezone", () => {
    const iso = "2026-06-11T19:00:00Z"; // Mexico v South Africa
    const la = formatKickoff(iso, "America/Los_Angeles", Date.parse("2026-06-10T00:00:00Z"));
    const tokyo = formatKickoff(iso, "Asia/Tokyo", Date.parse("2026-06-10T00:00:00Z"));
    expect(la.time).not.toBe(tokyo.time);
    expect(la.zoneName).toBe("PDT");
    expect(tokyo.zoneName).toBe("JST");
    expect(la.past).toBe(false);
  });

  it("uses familiar short labels where Intl locale output would be an offset", () => {
    const iso = "2026-06-11T19:00:00Z";
    expect(formatKickoff(iso, "Europe/London").zoneName).toBe("BST");
    expect(formatKickoff(iso, "America/New_York").zoneName).toBe("EDT");
  });

  it("flags a past kickoff", () => {
    const k = formatKickoff("2026-06-11T19:00:00Z", "Europe/London", Date.parse("2026-06-12T00:00:00Z"));
    expect(k.past).toBe(true);
    expect(k.rel).toBe("kicked off");
  });

  it("falls back to UTC for an invalid stored zone", () => {
    const k = formatKickoff("2026-06-11T19:00:00Z", "Not/AZone", Date.parse("2026-06-10T00:00:00Z"));
    expect(k.zone).toBe("UTC");
  });
});
