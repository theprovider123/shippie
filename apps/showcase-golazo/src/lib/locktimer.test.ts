import { describe, it, expect } from "vitest";
import { lockCountdown } from "./locktimer";

const NOW = 1_700_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("lockCountdown", () => {
  it("counts days, hours and minutes when far out", () => {
    const c = lockCountdown(NOW + 2 * DAY + 14 * HOUR + 32 * MIN, NOW);
    expect(c.locked).toBe(false);
    expect(c.text).toBe("2d 14h 32m");
  });

  it("drops days once inside 24h", () => {
    const c = lockCountdown(NOW + 3 * HOUR + 5 * MIN, NOW);
    expect(c.text).toBe("3h 5m");
  });

  it("shows just minutes inside the last hour", () => {
    const c = lockCountdown(NOW + 45 * MIN, NOW);
    expect(c.text).toBe("45m");
  });

  it("is locked once kick-off has passed", () => {
    const c = lockCountdown(NOW - 1, NOW);
    expect(c.locked).toBe(true);
    expect(c.text).toBe("Predictions in");
  });
});
