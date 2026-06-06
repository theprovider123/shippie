import { describe, it, expect } from "vitest";
import { dayKey, bumpStreak } from "./streak";

describe("streak", () => {
  it("formats a UTC day key", () => {
    expect(dayKey(Date.parse("2026-06-06T09:00:00Z"))).toBe("2026-06-06");
  });

  it("starts at 1 from nothing", () => {
    expect(bumpStreak(null, "2026-06-06")).toEqual({ days: 1, lastDay: "2026-06-06" });
  });

  it("is unchanged on the same day", () => {
    const prev = { days: 4, lastDay: "2026-06-06" };
    expect(bumpStreak(prev, "2026-06-06")).toEqual(prev);
  });

  it("increments on a consecutive day", () => {
    expect(bumpStreak({ days: 4, lastDay: "2026-06-06" }, "2026-06-07")).toEqual({
      days: 5,
      lastDay: "2026-06-07",
    });
  });

  it("resets after a gap", () => {
    expect(bumpStreak({ days: 9, lastDay: "2026-06-06" }, "2026-06-09")).toEqual({
      days: 1,
      lastDay: "2026-06-09",
    });
  });
});
