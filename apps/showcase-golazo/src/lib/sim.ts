// Demo aid: play out a plausible tournament so the live-scoring, pool, and
// sweepstake standings/settle surfaces light up without waiting on the real
// feed. Seeds win more often than not, with the odd upset for flavour.

import {
  GROUPS,
  GROUP_LETTERS,
  BRACKET_SHAPE,
  ROUNDS,
  qualifiersToR32,
  type Standing,
} from "../data/tournament";
import { team } from "../data/teams";
import type { Results } from "./types";

/** Pick a winner between two teams — favours the stronger seed, ~25% upsets. */
function beat(a: string, b: string): string {
  const sa = team(a).seed, sb = team(b).seed;
  const favourite = sa <= sb ? a : b;
  const underdog = favourite === a ? b : a;
  return Math.random() < 0.25 ? underdog : favourite;
}

export function simulateTournament(): Results {
  // Group standings: keep the seeded order (top two go through). Occasionally
  // swap 1st/2nd for realism.
  const standings: Partial<Record<string, Standing>> = {};
  const groups: Results["groups"] = {};
  for (const letter of GROUP_LETTERS) {
    const ids = [...GROUPS[letter]];
    if (Math.random() < 0.3) [ids[0], ids[1]] = [ids[1], ids[0]];
    groups[letter] = ids;
    standings[letter] = { first: ids[0], second: ids[1], third: ids[2], fourth: ids[3] };
  }

  // Knockout: fill each round from the previous winners.
  const entrants = qualifiersToR32(standings);
  const knockout: Record<string, string> = {};
  ROUNDS.forEach((round) => {
    for (const slot of BRACKET_SHAPE[round]) {
      let a: string | null, b: string | null;
      if (!slot.feeds) {
        a = entrants[slot.index * 2] ?? null;
        b = entrants[slot.index * 2 + 1] ?? null;
      } else {
        a = knockout[slot.feeds[0]] ?? null;
        b = knockout[slot.feeds[1]] ?? null;
      }
      if (a && b) knockout[slot.id] = beat(a, b);
      else if (a || b) knockout[slot.id] = (a ?? b) as string;
    }
  });

  const champion = knockout["F-0"];
  return { groups, knockout, topScorer: champion };
}
