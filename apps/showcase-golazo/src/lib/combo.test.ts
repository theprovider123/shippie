import { describe, expect, it } from "vitest";
import { gradeShot, comboMultiplier, scoreFor, gradeBonus, type Grade } from "./combo";

describe("gradeShot", () => {
  it("rewards a clean, well-placed, paced strike as a worldie", () => {
    expect(gradeShot({ cleanliness: 0.95, placement: 0.95, pace: 0.9 })).toBe("worldie");
  });

  it("calls a scrappy low-quality goal tidy", () => {
    expect(gradeShot({ cleanliness: 0.2, placement: 0.1, pace: 0.3 })).toBe("tidy");
  });

  it("calls a decent middling goal sweet", () => {
    expect(gradeShot({ cleanliness: 0.6, placement: 0.55, pace: 0.6 })).toBe("sweet");
  });

  it("weights placement most — a corner finish beats a clean centre", () => {
    const corner = gradeShot({ cleanliness: 0.4, placement: 0.95, pace: 0.5 });
    const centre = gradeShot({ cleanliness: 0.95, placement: 0.1, pace: 0.5 });
    const rank: Record<Grade, number> = { tidy: 0, sweet: 1, worldie: 2 };
    expect(rank[corner]).toBeGreaterThan(rank[centre]);
  });

  it("clamps out-of-range inputs without throwing", () => {
    expect(() => gradeShot({ cleanliness: 5, placement: -3, pace: 99 })).not.toThrow();
    expect(gradeShot({ cleanliness: 5, placement: 5, pace: 5 })).toBe("worldie");
  });
});

describe("comboMultiplier", () => {
  it("is 1x for the first goal", () => {
    expect(comboMultiplier(1)).toBe(1);
    expect(comboMultiplier(0)).toBe(1);
  });

  it("climbs with the streak", () => {
    expect(comboMultiplier(3)).toBeGreaterThan(comboMultiplier(2));
    expect(comboMultiplier(5)).toBeGreaterThan(comboMultiplier(3));
  });

  it("caps at 3x", () => {
    expect(comboMultiplier(50)).toBe(3);
    expect(comboMultiplier(9)).toBeLessThanOrEqual(3);
  });
});

describe("scoreFor", () => {
  it("a plain tidy goal with no streak is just its base points", () => {
    expect(scoreFor(1, "tidy", 1)).toBe(1);
  });

  it("adds a grade bonus", () => {
    expect(scoreFor(1, "worldie", 1)).toBe(1 + gradeBonus.worldie);
    expect(gradeBonus.worldie).toBeGreaterThan(gradeBonus.sweet);
    expect(gradeBonus.sweet).toBeGreaterThan(gradeBonus.tidy);
  });

  it("multiplies base+bonus by the combo and rounds", () => {
    // base 2 (top bins) + worldie bonus, on a long streak (3x)
    const expected = Math.round((2 + gradeBonus.worldie) * comboMultiplier(8));
    expect(scoreFor(2, "worldie", 8)).toBe(expected);
  });

  it("never returns less than the base points", () => {
    expect(scoreFor(2, "tidy", 1)).toBeGreaterThanOrEqual(2);
  });
});
