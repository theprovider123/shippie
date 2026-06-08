import { describe, it, expect } from "vitest";
import {
  addLocalScore,
  bestScore,
  topScores,
  mergeBoards,
  encodeChallenge,
  decodeChallenge,
  challengeUrl,
  readChallengeFromHash,
  gameMeta,
  type ScoreEntry,
} from "./games";
import { profileLeaderboardKey } from "./leaderboard";

const s = (game: "keepy" | "topbins" | "lastman", name: string, score: number, at = 0): ScoreEntry => ({ game, name, score, at });

describe("local board", () => {
  it("ranks highest-first and tracks bests per game", () => {
    let board: ScoreEntry[] = [];
    board = addLocalScore(board, s("keepy", "Sam", 12));
    board = addLocalScore(board, s("keepy", "Sam", 30, 1));
    board = addLocalScore(board, s("topbins", "Sam", 5, 2));
    expect(bestScore(board, "keepy")).toBe(30);
    expect(bestScore(board, "topbins")).toBe(5);
    expect(bestScore(addLocalScore(board, s("lastman", "Sam", 1, 3)), "lastman")).toBe(1);
    expect(topScores(board, "keepy")[0].score).toBe(30);
    expect(topScores(board, "keepy").every((e) => e.game === "keepy")).toBe(true);
  });
  it("stamps local scores as yours", () => {
    const board = addLocalScore([], s("keepy", "Sam", 9));
    expect(board[0].source).toBe("you");
  });
});

describe("merge global + local", () => {
  it("interleaves and ranks both, global above lower local", () => {
    const local: ScoreEntry[] = [{ ...s("keepy", "Sam", 20), source: "you" }];
    const global: ScoreEntry[] = [
      { ...s("keepy", "Ana", 99), source: "global" },
      { ...s("keepy", "Bo", 5), source: "global" },
    ];
    const merged = mergeBoards(local, global, "keepy");
    expect(merged.map((e) => e.score)).toEqual([99, 20, 5]);
    expect(merged[1].source).toBe("you");
  });

  it("dedupes the same player key across local and global boards", () => {
    const local: ScoreEntry[] = [{ ...s("keepy", "Sam", 20), playerKey: "sam:u1", source: "you" }];
    const global: ScoreEntry[] = [{ ...s("keepy", "Sam", 20), playerKey: "sam:u1", source: "global" }];
    const merged = mergeBoards(local, global, "keepy");
    expect(merged).toHaveLength(1);
    expect(merged[0].playerKey).toBe("sam:u1");
    expect(merged[0].source).toBe("you"); // own row stays labelled "(you)" on a tie
  });

  it("keeps the higher score when the same player key has two values", () => {
    const local: ScoreEntry[] = [{ ...s("keepy", "Sam", 12), playerKey: "sam:u1", source: "you" }];
    const global: ScoreEntry[] = [{ ...s("keepy", "Sam", 40), playerKey: "sam:u1", source: "global" }];
    const merged = mergeBoards(local, global, "keepy");
    expect(merged).toHaveLength(1);
    expect(merged[0].score).toBe(40);
  });
});

describe("leaderboard identity", () => {
  it("combines a normalized username and stable uid into a unique key", () => {
    expect(profileLeaderboardKey({ name: "Sam Smith!", uid: "u-123" })).toBe("sam-smith:u-123");
  });
});

describe("challenge links", () => {
  it("round-trips a score challenge", () => {
    const c = { game: "keepy" as const, name: "Sam", score: 42 };
    expect(decodeChallenge(encodeChallenge(c))).toEqual(c);
  });
  it("reads a challenge out of a hash and ignores others", () => {
    const url = challengeUrl({ game: "topbins", name: "Mo", score: 7 }, "https://x/");
    const hash = url.slice(url.indexOf("#"));
    expect(readChallengeFromHash(hash)).toMatchObject({ game: "topbins", score: 7, name: "Mo" });
    expect(readChallengeFromHash("#sweep=abc")).toBeNull();
    expect(decodeChallenge("garbage")).toBeNull();
  });
});

describe("metadata", () => {
  it("resolves each game", () => {
    expect(gameMeta("keepy").unit).toBe("kick-ups");
    expect(gameMeta("topbins").name).toBe("Top Bins");
    expect(gameMeta("lastman").name).toBe("Last Man Standing");
  });
});
