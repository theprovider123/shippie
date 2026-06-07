// Outside Bet Roulette: spin to be assigned a random nation. Your tournament
// score then rides entirely on that nation's run. Pure + offline.

import { GROUP_LETTERS } from "../data/tournament";
import type { Results } from "./types";

/** Deterministic pick from the field for a given seed (hashed to spread evenly). */
export function spinNation(seed: number, field: string[]): string {
  if (field.length === 0) return "";
  // xorshift-ish hash so consecutive seeds don't just step by one.
  let x = (seed ^ 0x9e3779b9) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return field[(x >>> 0) % field.length];
}

/** Did this nation actually come good — top-two of its group, or won a knockout tie? */
export function landed(teamId: string, results: Results): boolean {
  for (const letter of GROUP_LETTERS) {
    const order = results.groups[letter];
    if (order && (order[0] === teamId || order[1] === teamId)) return true;
  }
  return Object.values(results.knockout).includes(teamId);
}
