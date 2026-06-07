// Tribe stats, not rankings. Nobody cares they're 48,204th — they care that
// "only 8% called this". Pure + offline: derived from the field of predictions.

import { maybeTeam } from "../data/teams";
import { championOf } from "./bracket";
import type { Prediction } from "./types";

export interface TribeStat {
  /** Share of the field, 0–100. */
  pct: number;
  label: string;
}

function pctOf(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

/**
 * Belonging stats for your call vs the whole field (which includes you).
 * Returns only the lines that say something — champion + outside bet.
 */
export function tribeStats(mine: Prediction, field: Prediction[]): TribeStat[] {
  const total = field.length;
  const stats: TribeStat[] = [];

  const champId = championOf(mine);
  const champ = maybeTeam(champId);
  if (champ) {
    const n = field.filter((p) => championOf(p) === champ.id).length;
    stats.push({
      pct: pctOf(n, total),
      label: `${pctOf(n, total)}% of your lot back ${champ.name} to win it`,
    });
  }

  const ob = maybeTeam(mine.outsideBet);
  if (ob) {
    const sharers = field.filter((p) => p.outsideBet === ob.id).length;
    const others = Math.max(0, sharers - 1);
    const pct = pctOf(sharers, total);
    const label =
      others === 0
        ? `Only you called ${ob.name} as an outside bet. Brave.`
        : `${others} other${others === 1 ? "" : "s"} in your lot backed ${ob.name} as an outside bet`;
    stats.push({ pct, label });
  }

  return stats;
}
