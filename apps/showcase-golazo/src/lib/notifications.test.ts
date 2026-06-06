import { describe, it, expect } from "vitest";
import { kickoffNudge, reactionNudge, receiptsNudge, sampleNudge } from "./notifications";

describe("notification copy", () => {
  it("names the nation in a kick-off nudge", () => {
    const line = kickoffNudge("England", 45);
    expect(line).toContain("England");
    expect(line).toContain("45");
  });

  it("names who reacted and with what", () => {
    expect(reactionNudge("Karl", "skull")).toContain("Karl");
    expect(reactionNudge("Karl", "skull")).toContain("💀");
  });

  it("teases a leaderboard shake-up without sounding like a system alert", () => {
    const line = receiptsNudge("Jordan");
    expect(line).toContain("Jordan");
    expect(line.toLowerCase()).not.toContain("notification");
  });

  it("always has a sample line for the settings preview", () => {
    expect(sampleNudge().length).toBeGreaterThan(10);
  });
});
