// Resolve who actually sits in any bracket slot, given the R32 entrants and the
// set of winner-picks made so far. Pure + deterministic so it can power both the
// live UI and scoring/tests.

import {
  BRACKET_SHAPE,
  ROUNDS,
  qualifiersToR32,
  type GroupLetter,
  type RoundId,
  type Standing,
} from "../data/tournament";
import type { Prediction } from "./types";

export function standingsFromPrediction(
  groups: Partial<Record<GroupLetter, string[]>>,
): Partial<Record<GroupLetter, Standing>> {
  const out: Partial<Record<GroupLetter, Standing>> = {};
  for (const [letter, order] of Object.entries(groups)) {
    if (order && order.length >= 4) {
      out[letter as GroupLetter] = {
        first: order[0],
        second: order[1],
        third: order[2],
        fourth: order[3],
      };
    }
  }
  return out;
}

export interface ResolvedBracket {
  /** slotId -> [teamId|null, teamId|null] participants of that match. */
  participants: Record<string, [string | null, string | null]>;
  /** The 32 R32 entrants in bracket order. */
  r32: (string | null)[];
}

/**
 * Walk the bracket from R32 upward, filling each slot's two participants from
 * the winner-picks of the feeding slots.
 */
export function resolveBracket(
  groups: Partial<Record<GroupLetter, string[]>>,
  knockout: Record<string, string>,
): ResolvedBracket {
  const r32 = qualifiersToR32(standingsFromPrediction(groups));
  const participants: Record<string, [string | null, string | null]> = {};

  ROUNDS.forEach((round: RoundId, ri) => {
    for (const slot of BRACKET_SHAPE[round]) {
      if (ri === 0) {
        participants[slot.id] = [
          r32[slot.index * 2] ?? null,
          r32[slot.index * 2 + 1] ?? null,
        ];
      } else {
        const [fa, fb] = slot.feeds!;
        participants[slot.id] = [knockout[fa] ?? null, knockout[fb] ?? null];
      }
    }
  });

  return { participants, r32 };
}

/** The champion = winner pick of the Final slot. */
export function championOf(pred: Prediction): string | null {
  return pred.knockout["F-0"] ?? null;
}

/** Is every group ordered and every knockout slot decided? */
export function isComplete(pred: Prediction): boolean {
  const { participants } = resolveBracket(pred.groups, pred.knockout);
  for (const slotId of Object.keys(participants)) {
    if (!pred.knockout[slotId]) return false;
  }
  return Boolean(pred.knockout["F-0"]);
}

/**
 * Remove any knockout pick that is no longer a valid participant of its slot
 * (e.g. after a group order or an upstream winner changed). Runs to a fixed
 * point so a single deep change cascades all the way to the Final.
 */
export function prunePicks(
  groups: Partial<Record<GroupLetter, string[]>>,
  knockout: Record<string, string>,
): Record<string, string> {
  let current = { ...knockout };
  for (let pass = 0; pass < 6; pass++) {
    const { participants } = resolveBracket(groups, current);
    let changed = false;
    for (const [slotId, pick] of Object.entries(current)) {
      const parts = participants[slotId];
      if (!parts || (pick !== parts[0] && pick !== parts[1])) {
        delete current[slotId];
        changed = true;
      }
    }
    if (!changed) break;
  }
  return current;
}

/** How far through the prediction is the user (0..1), for progress UI. */
export function completion(pred: Prediction): number {
  const totalGroups = 12;
  const doneGroups = Object.values(pred.groups).filter(
    (g) => g && g.length >= 4,
  ).length;
  const totalSlots = 31; // 16+8+4+2+1
  const doneSlots = Object.keys(pred.knockout).length;
  return Math.min(1, (doneGroups + doneSlots) / (totalGroups + totalSlots));
}
