import { describe, it, expect } from "vitest";
import {
  addReaction,
  activeReactions,
  reactionsReceived,
  type ReactionStore,
} from "./reactions";

const NOW = 1_700_000_000_000;
const DAY = 24 * 3600_000;

describe("reactions", () => {
  it("adds a reaction keyed by entry uid", () => {
    const s = addReaction({}, "abc", "fire", NOW);
    expect(activeReactions(s, "abc", NOW)).toEqual(["fire"]);
  });

  it("returns nothing for an unknown uid", () => {
    expect(activeReactions({}, "nope", NOW)).toEqual([]);
  });

  it("expires reactions after 24h", () => {
    const s = addReaction({}, "abc", "skull", NOW);
    expect(activeReactions(s, "abc", NOW + DAY + 1)).toEqual([]);
  });

  it("dedupes the same reaction, keeping the newest timestamp", () => {
    let s: ReactionStore = addReaction({}, "abc", "phone", NOW);
    s = addReaction(s, "abc", "phone", NOW + 1000);
    expect(s["abc"]).toHaveLength(1);
    expect(activeReactions(s, "abc", NOW + DAY)).toEqual(["phone"]);
    // still alive just under 24h after the *newer* timestamp
    expect(activeReactions(s, "abc", NOW + 1000 + DAY - 1)).toEqual(["phone"]);
  });

  it("keeps distinct reaction kinds on the same uid", () => {
    let s = addReaction({}, "abc", "fire", NOW);
    s = addReaction(s, "abc", "skull", NOW);
    expect(activeReactions(s, "abc", NOW).sort()).toEqual(["fire", "skull"]);
  });

  it("counts active reactions received across all of a person's entries", () => {
    let s = addReaction({}, "me", "fire", NOW);
    s = addReaction(s, "me", "skull", NOW);
    s = addReaction(s, "other", "phone", NOW);
    expect(reactionsReceived(s, ["me"], NOW)).toBe(2);
  });
});
