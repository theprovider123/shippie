import { describe, expect, it } from "vitest";
import type { Fixture } from "../data/tournament";
import type { LiveScore } from "./feed";
import { evaluateLastMan, upsertLastManPick } from "./lastman";

const venue: Fixture["venue"] = {
  stadium: "Test Stadium",
  city: "Test City",
  country: "USA",
  tz: "America/New_York",
};

const fixtures: Fixture[] = [
  { id: "d1-a-b", fifaId: "test-1", matchNumber: 1, group: "A", round: 1, home: "MEX", away: "CRO", kickoff: "2026-06-11T16:00:00.000Z", venue },
  { id: "d1-c-d", fifaId: "test-2", matchNumber: 2, group: "A", round: 1, home: "ECU", away: "GHA", kickoff: "2026-06-11T19:00:00.000Z", venue },
  { id: "d2-a-c", fifaId: "test-3", matchNumber: 3, group: "A", round: 2, home: "MEX", away: "ECU", kickoff: "2026-06-16T16:00:00.000Z", venue },
];

const ft = (matchId: string, homeGoals: number, awayGoals: number): LiveScore => ({
  matchId,
  home: "",
  away: "",
  homeGoals,
  awayGoals,
  status: "ft",
});

describe("Last Man Standing", () => {
  it("opens the first future matchday when there is no pick", () => {
    const summary = evaluateLastMan([], [], fixtures, Date.parse("2026-06-10T12:00:00Z"));
    expect(summary.alive).toBe(true);
    expect(summary.current?.key).toBe("2026-06-11");
    expect(summary.boardScore).toBe(0);
  });

  it("counts a pending pick as a live survivor row", () => {
    const picks = upsertLastManPick([], { day: "2026-06-11", fixtureId: "d1-a-b", teamId: "MEX", at: 1 });
    const summary = evaluateLastMan(picks, [], fixtures, Date.parse("2026-06-10T12:00:00Z"));
    expect(summary.alive).toBe(true);
    expect(summary.boardScore).toBe(1);
    expect(summary.current?.status).toBe("pending");
  });

  it("survives a win and advances to the next matchday", () => {
    const picks = upsertLastManPick([], { day: "2026-06-11", fixtureId: "d1-a-b", teamId: "MEX", at: 1 });
    const summary = evaluateLastMan(picks, [ft("d1-a-b", 2, 0)], fixtures, Date.parse("2026-06-12T12:00:00Z"));
    expect(summary.alive).toBe(true);
    expect(summary.survived).toBe(1);
    expect(summary.current?.key).toBe("2026-06-16");
    expect(summary.boardScore).toBe(1);
  });

  it("knocks a player out for a draw or defeat", () => {
    const picks = upsertLastManPick([], { day: "2026-06-11", fixtureId: "d1-a-b", teamId: "MEX", at: 1 });
    expect(evaluateLastMan(picks, [ft("d1-a-b", 1, 1)], fixtures).alive).toBe(false);
    expect(evaluateLastMan(picks, [ft("d1-a-b", 0, 1)], fixtures).boardScore).toBe(0);
  });

  it("knocks a player out when the first deadline passes without a pick", () => {
    const summary = evaluateLastMan([], [], fixtures, Date.parse("2026-06-11T16:00:01Z"));
    expect(summary.alive).toBe(false);
    expect(summary.eliminatedAt).toBe("2026-06-11");
    expect(summary.rounds[0].status).toBe("missed");
  });
});
