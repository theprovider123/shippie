// Shot grading + combo scoring, shared by every Golazo shooting game. Pure + testable:
// no canvas, no DOM. The games feed in how clean/placed/paced a strike was and get back
// a grade (for juice + flavour) and the points the goal is worth after streak multipliers.

export type Grade = "tidy" | "sweet" | "worldie";

export interface ShotQuality {
  /** 0..1 how clean/smooth the swipe arc was (low jitter = a sweetly struck ball). */
  cleanliness: number;
  /** 0..1 how close to a corner / top-bin the ball was placed. */
  placement: number;
  /** 0..1 pace on the strike. */
  pace: number;
}

/** Extra points a grade adds on top of the goal's base value. */
export const gradeBonus: Record<Grade, number> = { tidy: 0, sweet: 1, worldie: 2 };

function clamp01(n: number): number {
  return !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Single 0..1 quality score — placement matters most, then how it was struck. */
export function shotQuality(q: ShotQuality): number {
  return clamp01(q.placement) * 0.5 + clamp01(q.pace) * 0.25 + clamp01(q.cleanliness) * 0.25;
}

export function gradeShot(q: ShotQuality): Grade {
  const s = shotQuality(q);
  return s >= 0.75 ? "worldie" : s >= 0.45 ? "sweet" : "tidy";
}

/**
 * Consecutive goals build a multiplier. `streak` is the goal count INCLUDING this one
 * (1 = first goal of a run). Climbs +0.25 per goal after the first, capped at 3×.
 */
export function comboMultiplier(streak: number): number {
  const s = Math.max(1, Math.floor(streak) || 1);
  return Math.min(3, 1 + (s - 1) * 0.25);
}

/** Points a goal is worth: (base + grade bonus) × combo multiplier, rounded. */
export function scoreFor(basePts: number, grade: Grade, streak: number): number {
  return Math.max(basePts, Math.round((basePts + gradeBonus[grade]) * comboMultiplier(streak)));
}
