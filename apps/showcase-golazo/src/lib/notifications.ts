// Banter notification copy. Opt-in only — never a system-alert tone, never a
// permission prompt on first load. This is the string bank a scheduler (or the
// settings preview) draws from. Pure + offline.

import { REACTION_EMOJI, type ReactionKind } from "./reactions";

export function kickoffNudge(nation: string, mins: number): string {
  return `${nation} kick off in ${mins} minutes. You tipped them. No pressure.`;
}

export function reactionNudge(from: string, kind: ReactionKind): string {
  const about =
    kind === "skull"
      ? "Probably about that outside bet."
      : kind === "phone"
        ? "They want a word."
        : "Someone's impressed.";
  return `${from} hit your row with a ${REACTION_EMOJI[kind]}. ${about}`;
}

export function receiptsNudge(name: string): string {
  return `Full time. The table's moved — ${name} won't be happy.`;
}

export function lockNudge(text: string): string {
  return `Your tips lock in ${text}. Get them in.`;
}

export function outsideBetNudge(nation: string, pctMissed: number): string {
  return `${nation} came good. ${pctMissed}% of players didn't see it coming. You did.`;
}

const SAMPLES = [
  "England kick off in 45 minutes. You tipped them. No pressure.",
  "Karl hit your row with a 💀. Probably about that outside bet.",
  "Full time. The table's moved — Jordan won't be happy.",
];

/** A rotating sample for the settings preview (deterministic on a given day). */
export function sampleNudge(dayIndex = 0): string {
  return SAMPLES[Math.abs(dayIndex) % SAMPLES.length];
}
