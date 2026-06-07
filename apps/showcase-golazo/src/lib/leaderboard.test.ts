import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGlobal, submitGlobal, syncLastManFromLiveScores } from "./leaderboard";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("global leaderboard client", () => {
  it("tags fetched server rows with the requested game", async () => {
    globalThis.fetch = vi.fn(async () => ok({
      scores: [{ name: "Ana", playerKey: "ana:u1", score: 7, at: 1 }],
    })) as unknown as typeof fetch;

    await expect(fetchGlobal("lastman")).resolves.toEqual([
      expect.objectContaining({ game: "lastman", source: "global" }),
    ]);
  });

  it("submits Last Man pick history for server-side result recomputes", async () => {
    let posted: Record<string, unknown> | undefined;
    globalThis.fetch = vi.fn(async (_url, init) => {
      posted = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return ok({ scores: [{ name: "Sam", playerKey: "sam:u1", score: 1, at: 1 }] });
    }) as unknown as typeof fetch;

    const scores = await submitGlobal({
      game: "lastman",
      name: "Sam",
      playerKey: "sam:u1",
      score: 1,
      picks: [{ day: "2026-06-11", fixtureId: "A1-MEX-CRO", teamId: "MEX", at: 1000 }],
    });

    expect(posted?.picks).toEqual([
      expect.objectContaining({ fixtureId: "A1-MEX-CRO", teamId: "MEX" }),
    ]);
    expect(scores[0]).toMatchObject({ game: "lastman", source: "global" });
  });

  it("tags Last Man score-sync responses for the survivors board", async () => {
    globalThis.fetch = vi.fn(async () => ok({
      scores: [{ name: "Mo", playerKey: "mo:u2", score: 2, at: 2 }],
    })) as unknown as typeof fetch;

    const scores = await syncLastManFromLiveScores([
      { matchId: "A1-MEX-CRO", home: "MEX", away: "CRO", homeGoals: 2, awayGoals: 1, status: "ft" },
    ]);

    expect(scores[0]).toMatchObject({ game: "lastman", source: "global" });
  });
});
