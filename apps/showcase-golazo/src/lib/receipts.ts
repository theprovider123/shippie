// The Receipts: who called it, who bottled it, and a specific dig at whoever was
// most wrong. Pure + offline — derived from pool entries scored against results.

import { GROUP_LETTERS, type GroupLetter } from "../data/tournament";
import { maybeTeam } from "../data/teams";
import { hasResults, scorePrediction } from "./scoring";
import type { PoolEntry, Prediction, Results } from "./types";

export interface RankedEntry {
  entry: PoolEntry;
  pts: number;
  pos: number;
}

/** Has this person actually made any tips? */
function isSilent(p: Prediction): boolean {
  const anyGroup = Object.values(p.groups).some((g) => g && g.length >= 4);
  return !anyGroup && Object.keys(p.knockout).length === 0;
}

/** Rank entries by points (highest first) with 1-based positions. */
export function rankEntries(entries: PoolEntry[], results: Results): RankedEntry[] {
  const scored = entries.map((entry) => ({
    entry,
    pts: scorePrediction(entry.prediction, results).total,
  }));
  scored.sort((a, b) => b.pts - a.pts);
  return scored.map((s, i) => ({ ...s, pos: i + 1 }));
}

export interface EntryTag {
  label: string;
  tone: "good" | "bad" | "neutral";
}

/** The banter tag for a row: Silent / Called it / Bottled It 💀 / nothing. */
export function tagFor(
  r: RankedEntry,
  ranked: RankedEntry[],
  results: Results,
): EntryTag | null {
  if (isSilent(r.entry.prediction)) return { label: "Silent", tone: "neutral" };
  if (!hasResults(results)) return null;
  if (r.pos === 1) return { label: "Called it", tone: "good" };
  if (ranked.length > 1 && r.pos === ranked.length)
    return { label: "Bottled It 💀", tone: "bad" };
  return null;
}

export interface Receipt {
  name: string;
  line: string;
}

interface WrongPick {
  letter: GroupLetter;
  pickedFirst: string;
}

/** The first group where this person's winner pick was flat wrong. */
function wrongGroupWinner(p: Prediction, results: Results): WrongPick | null {
  for (const letter of GROUP_LETTERS) {
    const got = p.groups[letter]?.[0];
    const real = results.groups[letter]?.[0];
    if (got && real && got !== real) return { letter, pickedFirst: got };
  }
  return null;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** Name the most-wrong person, with a specific dig where one exists. */
export function mostWrong(entries: PoolEntry[], results: Results): Receipt | null {
  if (entries.length < 2 || !hasResults(results)) return null;
  const ranked = rankEntries(entries, results);
  const worst = ranked[ranked.length - 1];
  const name = worst.entry.name;
  const posText = ordinal(worst.pos);
  const wrong = wrongGroupWinner(worst.entry.prediction, results);
  if (wrong) {
    const t = maybeTeam(wrong.pickedFirst);
    return {
      name,
      line: `${name} picked ${t ? t.name : "them"} to win Group ${wrong.letter}. ${name} is ${posText}. ${name} should answer their phone.`,
    };
  }
  return {
    name,
    line: `${name} is rock bottom on ${worst.pts} pts. ${name} should have a word with themselves.`,
  };
}
