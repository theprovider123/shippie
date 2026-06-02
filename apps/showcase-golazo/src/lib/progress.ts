// How far a team has actually gone, derived from official results. Drives
// sweepstake standings ("is my team still alive?") and winner/settle logic.
// Pure + offline — reads the same Results shape that scoring uses.

import { ROUNDS, GROUP_LETTERS, type RoundId } from "../data/tournament";
import type { Results } from "./types";

export type Stage =
  | "out" // not in the results yet / eliminated in groups
  | "group" // played a group game but didn't qualify
  | "R32"
  | "R16"
  | "QF"
  | "SF"
  | "F" // reached the final
  | "champion"; // won it

export const STAGE_RANK: Record<Stage, number> = {
  out: 0,
  group: 1,
  R32: 2,
  R16: 3,
  QF: 4,
  SF: 5,
  F: 6,
  champion: 7,
};

export const STAGE_LABEL: Record<Stage, string> = {
  out: "Out",
  group: "Group stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-final",
  SF: "Semi-final",
  F: "Final",
  champion: "Champion 🏆",
};

/** The round a team advances INTO after winning a given round. */
const NEXT_STAGE: Record<RoundId, Stage> = {
  R32: "R16",
  R16: "QF",
  QF: "SF",
  SF: "F",
  F: "champion",
};

/** Which round-winner sets a team belongs to, latest first. */
function highestRoundWon(teamId: string, results: Results): RoundId | null {
  for (let i = ROUNDS.length - 1; i >= 0; i--) {
    const round = ROUNDS[i];
    const won = Object.entries(results.knockout).some(
      ([slotId, winner]) => slotId.startsWith(`${round}-`) && winner === teamId,
    );
    if (won) return round;
  }
  return null;
}

/** Did the team finish top-2 of its group (i.e. qualify) in the results? */
function qualifiedFromGroup(teamId: string, results: Results): boolean {
  for (const letter of GROUP_LETTERS) {
    const order = results.groups[letter];
    if (order && (order[0] === teamId || order[1] === teamId)) return true;
  }
  return false;
}

/** Did the team appear anywhere in the group results at all? */
function playedGroup(teamId: string, results: Results): boolean {
  for (const letter of GROUP_LETTERS) {
    if (results.groups[letter]?.includes(teamId)) return true;
  }
  return false;
}

/**
 * The furthest stage a team has reached given the current (possibly partial)
 * results. Champion is the terminal win; otherwise we read the latest round
 * the team won and advance it one stage.
 */
export function teamStage(teamId: string | null | undefined, results: Results): Stage {
  if (!teamId) return "out";
  const won = highestRoundWon(teamId, results);
  if (won) return NEXT_STAGE[won];
  // Hasn't won a knockout tie yet — place by group outcome.
  if (qualifiedFromGroup(teamId, results)) return "R32";
  if (playedGroup(teamId, results)) return "group";
  return "out";
}

/** A team is "alive" until it's been knocked out (lost a tie it was in). */
export function isAlive(teamId: string | null | undefined, results: Results): boolean {
  if (!teamId) return false;
  // Champion is alive (won). A team is eliminated once a later slot it should
  // have advanced into is filled by someone else — but the simplest honest
  // signal offline: alive if it reached the latest decided stage or is champ.
  const stage = teamStage(teamId, results);
  if (stage === "champion") return true;
  // If the final is decided and you're not champion, you're out.
  if (results.knockout["F-0"]) return false;
  return STAGE_RANK[stage] >= STAGE_RANK["R32"] || stage === "group";
}
