// Score a prediction against (possibly partial) official results.
// Mirrors the on-screen rules so "why did I get N points" is always legible.

import {
  BRACKET_SHAPE,
  ROUNDS,
  GROUP_LETTERS,
  ROUND_POINTS,
  type RoundId,
} from "../data/tournament";
import type { Prediction, Results, ScoreBreakdown } from "./types";

export const GROUP_FIRST_POINTS = 5;
export const GROUP_SECOND_POINTS = 3;
export const CHAMPION_BONUS = 25;

export function scorePrediction(
  pred: Prediction,
  results: Results,
): ScoreBreakdown {
  let groupPoints = 0;
  for (const letter of GROUP_LETTERS) {
    const got = pred.groups[letter];
    const real = results.groups[letter];
    if (!got || !real) continue;
    if (got[0] && got[0] === real[0]) groupPoints += GROUP_FIRST_POINTS;
    if (got[1] && got[1] === real[1]) groupPoints += GROUP_SECOND_POINTS;
  }

  const knockoutPoints = {} as Record<RoundId, number>;
  let correctCalls = 0;
  ROUNDS.forEach((round: RoundId) => {
    let pts = 0;
    for (const slot of BRACKET_SHAPE[round]) {
      const pick = pred.knockout[slot.id];
      const truth = results.knockout[slot.id];
      if (pick && truth && pick === truth) {
        pts += ROUND_POINTS[round];
        correctCalls++;
      }
    }
    knockoutPoints[round] = pts;
  });

  const championPick = pred.knockout["F-0"];
  const championTruth = results.knockout["F-0"];
  const championBonus =
    championPick && championTruth && championPick === championTruth
      ? CHAMPION_BONUS
      : 0;

  const total =
    groupPoints +
    ROUNDS.reduce((sum, r) => sum + knockoutPoints[r], 0) +
    championBonus;

  return { groupPoints, knockoutPoints, championBonus, total, correctCalls };
}

/** Whether any official result exists yet (controls "scoring live" UI). */
export function hasResults(results: Results): boolean {
  return (
    Object.keys(results.knockout).length > 0 ||
    Object.values(results.groups).some((g) => g && g.length > 0)
  );
}
