// ── Tournament structure ─────────────────────────────────────────────────────
// 12 groups (A–L) of 4, the group-stage round-robin fixtures, and a
// deterministic knockout bracket built from the user's predicted qualifiers.
//
// Group assignments below are a balanced, pot-based seeding. When the official
// final draw is published, swap the team ids in GROUPS — nothing else changes.

import { TEAMS, team, type Team } from "./teams";

export const GROUP_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
] as const;
export type GroupLetter = (typeof GROUP_LETTERS)[number];

// Official FIFA WC2026 group draw (December 2025).
// Hosts: Mexico A1, Canada B1, USA D1.
export const GROUPS: Record<GroupLetter, [string, string, string, string]> = {
  A: ["MEX", "RSA", "KOR", "CZE"],   // Mexico, South Africa, Korea Republic, Czechia
  B: ["CAN", "BIH", "QAT", "SUI"],   // Canada, Bosnia & Herz., Qatar, Switzerland
  C: ["BRA", "MAR", "HAI", "SCO"],   // Brazil, Morocco, Haiti, Scotland
  D: ["USA", "PAR", "AUS", "TUR"],   // United States, Paraguay, Australia, Türkiye
  E: ["GER", "CUW", "CIV", "ECU"],   // Germany, Curaçao, Ivory Coast, Ecuador
  F: ["NED", "JPN", "SWE", "TUN"],   // Netherlands, Japan, Sweden, Tunisia
  G: ["BEL", "EGY", "IRN", "NZL"],   // Belgium, Egypt, Iran, New Zealand
  H: ["ESP", "CPV", "KSA", "URU"],   // Spain, Cape Verde, Saudi Arabia, Uruguay
  I: ["FRA", "SEN", "IRQ", "NOR"],   // France, Senegal, Iraq, Norway
  J: ["ARG", "ALG", "AUT", "JOR"],   // Argentina, Algeria, Austria, Jordan
  K: ["POR", "COD", "UZB", "COL"],   // Portugal, DR Congo, Uzbekistan, Colombia
  L: ["ENG", "CRO", "GHA", "PAN"],   // England, Croatia, Ghana, Panama
};

export function groupTeams(letter: GroupLetter): Team[] {
  return GROUPS[letter].map(team);
}

// ── Group-stage fixtures ─────────────────────────────────────────────────────
// Generated as a round-robin per group (3 rounds, 6 matches each → 72 total).
// Kickoffs are spread across the real group-stage window (Jun 11 – Jun 27 2026)
// purely so the Live / Results screens have a believable timeline offline.

export interface Fixture {
  id: string;
  group: GroupLetter;
  round: 1 | 2 | 3;
  home: string;
  away: string;
  /** ISO kickoff, local-naive. */
  kickoff: string;
}

// Standard round-robin schedule for 4 teams (indices into the group array).
const RR: Array<[number, number]>[] = [
  [[0, 1], [2, 3]], // round 1
  [[0, 2], [3, 1]], // round 2
  [[3, 0], [1, 2]], // round 3
];

function buildGroupFixtures(): Fixture[] {
  const out: Fixture[] = [];
  const start = Date.UTC(2026, 5, 11, 19, 0); // 2026-06-11 19:00 UTC = 20:00 BST (8pm UK)
  const dayMs = 24 * 60 * 60 * 1000;
  let slot = 0;
  GROUP_LETTERS.forEach((letter, gi) => {
    const ids = GROUPS[letter];
    RR.forEach((pairs, ri) => {
      pairs.forEach(([h, a]) => {
        // Spread kickoffs: each group's rounds land a few days apart, groups
        // staggered so something is "on" most days of the first fortnight.
        const day = ri * 5 + (gi % 5);
        const hour = (slot % 4) * 3; // 0,3,6,9h offsets within the day window
        const kickoff = new Date(start + day * dayMs + hour * 60 * 60 * 1000);
        out.push({
          id: `${letter}${ri + 1}-${ids[h]}-${ids[a]}`,
          group: letter,
          round: (ri + 1) as 1 | 2 | 3,
          home: ids[h],
          away: ids[a],
          kickoff: kickoff.toISOString(),
        });
        slot++;
      });
    });
  });
  return out.sort((x, y) => x.kickoff.localeCompare(y.kickoff));
}

export const GROUP_FIXTURES: Fixture[] = buildGroupFixtures();

// ── Knockout bracket ─────────────────────────────────────────────────────────
// 32 entrants → R32, R16, QF, SF, Final (5 rounds). Entrants are the 12 group
// winners, 12 runners-up and the 8 best third-placed teams. We seed them into a
// standard single-elimination tree so the strongest qualifiers are kept apart
// until late rounds.

export const ROUNDS = ["R32", "R16", "QF", "SF", "F"] as const;
export type RoundId = (typeof ROUNDS)[number];

export const ROUND_LABEL: Record<RoundId, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  F: "Final",
};

export const ROUND_POINTS: Record<RoundId, number> = {
  R32: 1,
  R16: 2,
  QF: 4,
  SF: 8,
  F: 16,
};

export interface BracketSlot {
  id: string; // e.g. "R32-0", "R16-3", "F-0"
  round: RoundId;
  index: number;
  /** Slot ids that feed this match (null for R32, which is fed by qualifiers). */
  feeds: [string, string] | null;
}

/** Standard single-elimination seed order for a bracket of size n (power of 2). */
export function seedOrder(n: number): number[] {
  let rounds = [1, 2];
  while (rounds.length < n) {
    const next: number[] = [];
    const sum = rounds.length * 2 + 1;
    for (const s of rounds) {
      next.push(s);
      next.push(sum - s);
    }
    rounds = next;
  }
  return rounds; // 1-based seeds in bracket position order
}

/** Build the static slot graph (independent of who qualifies). */
export function buildBracketShape(): Record<RoundId, BracketSlot[]> {
  const shape = {} as Record<RoundId, BracketSlot[]>;
  ROUNDS.forEach((round, ri) => {
    const count = 16 / Math.pow(2, ri);
    shape[round] = Array.from({ length: count }, (_, index) => {
      const feeds: [string, string] | null =
        ri === 0
          ? null
          : [
              `${ROUNDS[ri - 1]}-${index * 2}`,
              `${ROUNDS[ri - 1]}-${index * 2 + 1}`,
            ];
      return { id: `${round}-${index}`, round, index, feeds };
    });
  });
  return shape;
}

export const BRACKET_SHAPE = buildBracketShape();

export type Standing = { first: string; second: string; third: string; fourth: string };

/**
 * Compute the 32 knockout entrants from predicted group standings, ordered into
 * R32 match slots. Returns an array of 32 team ids (pairs are [0,1], [2,3], …).
 * Best-thirds are chosen by team seed (deterministic, documented default).
 */
export function qualifiersToR32(
  standings: Partial<Record<GroupLetter, Standing>>,
): (string | null)[] {
  const winners: string[] = [];
  const runners: string[] = [];
  const thirds: string[] = [];
  for (const letter of GROUP_LETTERS) {
    const s = standings[letter];
    winners.push(s?.first ?? "");
    runners.push(s?.second ?? "");
    if (s?.third) thirds.push(s.third);
  }
  // 8 best third-placed teams by seed (lower seed = stronger).
  const bestThirds = [...thirds]
    .filter(Boolean)
    .sort((a, b) => team(a).seed - team(b).seed)
    .slice(0, 8);

  // Build the 32-entrant pool with a "rank" so we can seed the tree. Winners
  // outrank runners outrank thirds; within a tier, by team seed.
  const pool: { id: string; rank: number }[] = [];
  winners.forEach((id) => id && pool.push({ id, rank: team(id).seed }));
  runners.forEach((id) => id && pool.push({ id, rank: 100 + team(id).seed }));
  bestThirds.forEach((id) => id && pool.push({ id, rank: 200 + team(id).seed }));

  pool.sort((a, b) => a.rank - b.rank);
  // Map seed position -> team. If incomplete, pad with null (UI shows "TBD").
  const order = seedOrder(32); // bracket positions hold these 1-based seeds
  const result: (string | null)[] = new Array(32).fill(null);
  order.forEach((seed, pos) => {
    const entrant = pool[seed - 1];
    result[pos] = entrant ? entrant.id : null;
  });
  return result;
}

/** All teams flat, for pickers. */
export { TEAMS };
