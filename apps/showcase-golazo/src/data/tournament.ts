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
// Official FIFA World Cup 2026 group-stage fixtures, sourced from FIFA's
// `calendar/matches` API for competition 17, season 285023, stage 289273.
// `kickoff` is the real UTC instant; viewer-local rendering happens in zones.ts.

export interface Fixture {
  /** Stable Golazo id. */
  id: string;
  /** Official FIFA match id. */
  fifaId: string;
  /** Official match number, 1..72. */
  matchNumber: number;
  group: GroupLetter;
  round: 1 | 2 | 3;
  home: string;
  away: string;
  /** ISO kickoff instant in UTC. */
  kickoff: string;
  venue: {
    stadium: string;
    city: string;
    country: "USA" | "CAN" | "MEX";
    /** IANA timezone at the ground. */
    tz: string;
  };
}

export const GROUP_FIXTURES: Fixture[] = [
  { id: "m01", fifaId: "400021443", matchNumber: 1, group: "A", round: 1, home: "MEX", away: "RSA", kickoff: "2026-06-11T19:00:00Z", venue: { stadium: "Mexico City Stadium", city: "Mexico City", country: "MEX", tz: "America/Mexico_City" } },
  { id: "m02", fifaId: "400021441", matchNumber: 2, group: "A", round: 1, home: "KOR", away: "CZE", kickoff: "2026-06-12T02:00:00Z", venue: { stadium: "Guadalajara Stadium", city: "Guadalajara", country: "MEX", tz: "America/Mexico_City" } },
  { id: "m03", fifaId: "400021449", matchNumber: 3, group: "B", round: 1, home: "CAN", away: "BIH", kickoff: "2026-06-12T19:00:00Z", venue: { stadium: "Toronto Stadium", city: "Toronto", country: "CAN", tz: "America/Toronto" } },
  { id: "m04", fifaId: "400021458", matchNumber: 4, group: "D", round: 1, home: "USA", away: "PAR", kickoff: "2026-06-13T01:00:00Z", venue: { stadium: "Los Angeles Stadium", city: "Los Angeles", country: "USA", tz: "America/Los_Angeles" } },
  { id: "m08", fifaId: "400021447", matchNumber: 8, group: "B", round: 1, home: "QAT", away: "SUI", kickoff: "2026-06-13T19:00:00Z", venue: { stadium: "San Francisco Bay Area Stadium", city: "San Francisco Bay Area", country: "USA", tz: "America/Los_Angeles" } },
  { id: "m07", fifaId: "400021456", matchNumber: 7, group: "C", round: 1, home: "BRA", away: "MAR", kickoff: "2026-06-13T22:00:00Z", venue: { stadium: "New York/New Jersey Stadium", city: "New Jersey", country: "USA", tz: "America/New_York" } },
  { id: "m05", fifaId: "400021453", matchNumber: 5, group: "C", round: 1, home: "HAI", away: "SCO", kickoff: "2026-06-14T01:00:00Z", venue: { stadium: "Boston Stadium", city: "Boston", country: "USA", tz: "America/New_York" } },
  { id: "m06", fifaId: "400021463", matchNumber: 6, group: "D", round: 1, home: "AUS", away: "TUR", kickoff: "2026-06-14T04:00:00Z", venue: { stadium: "BC Place Vancouver", city: "Vancouver", country: "CAN", tz: "America/Vancouver" } },
  { id: "m10", fifaId: "400021464", matchNumber: 10, group: "E", round: 1, home: "GER", away: "CUW", kickoff: "2026-06-14T17:00:00Z", venue: { stadium: "Houston Stadium", city: "Houston", country: "USA", tz: "America/Chicago" } },
  { id: "m11", fifaId: "400021470", matchNumber: 11, group: "F", round: 1, home: "NED", away: "JPN", kickoff: "2026-06-14T20:00:00Z", venue: { stadium: "Dallas Stadium", city: "Dallas", country: "USA", tz: "America/Chicago" } },
  { id: "m09", fifaId: "400021467", matchNumber: 9, group: "E", round: 1, home: "CIV", away: "ECU", kickoff: "2026-06-14T23:00:00Z", venue: { stadium: "Philadelphia Stadium", city: "Philadelphia", country: "USA", tz: "America/New_York" } },
  { id: "m12", fifaId: "400021474", matchNumber: 12, group: "F", round: 1, home: "SWE", away: "TUN", kickoff: "2026-06-15T02:00:00Z", venue: { stadium: "Monterrey Stadium", city: "Monterrey", country: "MEX", tz: "America/Monterrey" } },
  { id: "m14", fifaId: "400021482", matchNumber: 14, group: "H", round: 1, home: "ESP", away: "CPV", kickoff: "2026-06-15T16:00:00Z", venue: { stadium: "Atlanta Stadium", city: "Atlanta", country: "USA", tz: "America/New_York" } },
  { id: "m16", fifaId: "400021478", matchNumber: 16, group: "G", round: 1, home: "BEL", away: "EGY", kickoff: "2026-06-15T19:00:00Z", venue: { stadium: "Seattle Stadium", city: "Seattle", country: "USA", tz: "America/Los_Angeles" } },
  { id: "m13", fifaId: "400021486", matchNumber: 13, group: "H", round: 1, home: "KSA", away: "URU", kickoff: "2026-06-15T22:00:00Z", venue: { stadium: "Miami Stadium", city: "Miami", country: "USA", tz: "America/New_York" } },
  { id: "m15", fifaId: "400021476", matchNumber: 15, group: "G", round: 1, home: "IRN", away: "NZL", kickoff: "2026-06-16T01:00:00Z", venue: { stadium: "Los Angeles Stadium", city: "Los Angeles", country: "USA", tz: "America/Los_Angeles" } },
  { id: "m17", fifaId: "400021490", matchNumber: 17, group: "I", round: 1, home: "FRA", away: "SEN", kickoff: "2026-06-16T19:00:00Z", venue: { stadium: "New York/New Jersey Stadium", city: "New Jersey", country: "USA", tz: "America/New_York" } },
  { id: "m18", fifaId: "400021488", matchNumber: 18, group: "I", round: 1, home: "IRQ", away: "NOR", kickoff: "2026-06-16T22:00:00Z", venue: { stadium: "Boston Stadium", city: "Boston", country: "USA", tz: "America/New_York" } },
  { id: "m19", fifaId: "400021496", matchNumber: 19, group: "J", round: 1, home: "ARG", away: "ALG", kickoff: "2026-06-17T01:00:00Z", venue: { stadium: "Kansas City Stadium", city: "Kansas City", country: "USA", tz: "America/Chicago" } },
  { id: "m20", fifaId: "400021498", matchNumber: 20, group: "J", round: 1, home: "AUT", away: "JOR", kickoff: "2026-06-17T04:00:00Z", venue: { stadium: "San Francisco Bay Area Stadium", city: "San Francisco Bay Area", country: "USA", tz: "America/Los_Angeles" } },
  { id: "m23", fifaId: "400021502", matchNumber: 23, group: "K", round: 1, home: "POR", away: "COD", kickoff: "2026-06-17T17:00:00Z", venue: { stadium: "Houston Stadium", city: "Houston", country: "USA", tz: "America/Chicago" } },
  { id: "m22", fifaId: "400021507", matchNumber: 22, group: "L", round: 1, home: "ENG", away: "CRO", kickoff: "2026-06-17T20:00:00Z", venue: { stadium: "Dallas Stadium", city: "Dallas", country: "USA", tz: "America/Chicago" } },
  { id: "m21", fifaId: "400021510", matchNumber: 21, group: "L", round: 1, home: "GHA", away: "PAN", kickoff: "2026-06-17T23:00:00Z", venue: { stadium: "Toronto Stadium", city: "Toronto", country: "CAN", tz: "America/Toronto" } },
  { id: "m24", fifaId: "400021504", matchNumber: 24, group: "K", round: 1, home: "UZB", away: "COL", kickoff: "2026-06-18T02:00:00Z", venue: { stadium: "Mexico City Stadium", city: "Mexico City", country: "MEX", tz: "America/Mexico_City" } },
  { id: "m25", fifaId: "400021440", matchNumber: 25, group: "A", round: 2, home: "CZE", away: "RSA", kickoff: "2026-06-18T16:00:00Z", venue: { stadium: "Atlanta Stadium", city: "Atlanta", country: "USA", tz: "America/New_York" } },
  { id: "m26", fifaId: "400021446", matchNumber: 26, group: "B", round: 2, home: "SUI", away: "BIH", kickoff: "2026-06-18T19:00:00Z", venue: { stadium: "Los Angeles Stadium", city: "Los Angeles", country: "USA", tz: "America/Los_Angeles" } },
  { id: "m27", fifaId: "400021450", matchNumber: 27, group: "B", round: 2, home: "CAN", away: "QAT", kickoff: "2026-06-18T22:00:00Z", venue: { stadium: "BC Place Vancouver", city: "Vancouver", country: "CAN", tz: "America/Vancouver" } },
  { id: "m28", fifaId: "400021442", matchNumber: 28, group: "A", round: 2, home: "MEX", away: "KOR", kickoff: "2026-06-19T01:00:00Z", venue: { stadium: "Guadalajara Stadium", city: "Guadalajara", country: "MEX", tz: "America/Mexico_City" } },
  { id: "m32", fifaId: "400021462", matchNumber: 32, group: "D", round: 2, home: "USA", away: "AUS", kickoff: "2026-06-19T19:00:00Z", venue: { stadium: "Seattle Stadium", city: "Seattle", country: "USA", tz: "America/Los_Angeles" } },
  { id: "m30", fifaId: "400021454", matchNumber: 30, group: "C", round: 2, home: "SCO", away: "MAR", kickoff: "2026-06-19T22:00:00Z", venue: { stadium: "Boston Stadium", city: "Boston", country: "USA", tz: "America/New_York" } },
  { id: "m29", fifaId: "400021457", matchNumber: 29, group: "C", round: 2, home: "BRA", away: "HAI", kickoff: "2026-06-20T00:30:00Z", venue: { stadium: "Philadelphia Stadium", city: "Philadelphia", country: "USA", tz: "America/New_York" } },
  { id: "m31", fifaId: "400021460", matchNumber: 31, group: "D", round: 2, home: "TUR", away: "PAR", kickoff: "2026-06-20T03:00:00Z", venue: { stadium: "San Francisco Bay Area Stadium", city: "San Francisco Bay Area", country: "USA", tz: "America/Los_Angeles" } },
  { id: "m35", fifaId: "400021472", matchNumber: 35, group: "F", round: 2, home: "NED", away: "SWE", kickoff: "2026-06-20T17:00:00Z", venue: { stadium: "Houston Stadium", city: "Houston", country: "USA", tz: "America/Chicago" } },
  { id: "m33", fifaId: "400021469", matchNumber: 33, group: "E", round: 2, home: "GER", away: "CIV", kickoff: "2026-06-20T20:00:00Z", venue: { stadium: "Toronto Stadium", city: "Toronto", country: "CAN", tz: "America/Toronto" } },
  { id: "m34", fifaId: "400021465", matchNumber: 34, group: "E", round: 2, home: "ECU", away: "CUW", kickoff: "2026-06-21T00:00:00Z", venue: { stadium: "Kansas City Stadium", city: "Kansas City", country: "USA", tz: "America/Chicago" } },
  { id: "m36", fifaId: "400021475", matchNumber: 36, group: "F", round: 2, home: "TUN", away: "JPN", kickoff: "2026-06-21T04:00:00Z", venue: { stadium: "Monterrey Stadium", city: "Monterrey", country: "MEX", tz: "America/Monterrey" } },
  { id: "m38", fifaId: "400021483", matchNumber: 38, group: "H", round: 2, home: "ESP", away: "KSA", kickoff: "2026-06-21T16:00:00Z", venue: { stadium: "Atlanta Stadium", city: "Atlanta", country: "USA", tz: "America/New_York" } },
  { id: "m39", fifaId: "400021477", matchNumber: 39, group: "G", round: 2, home: "BEL", away: "IRN", kickoff: "2026-06-21T19:00:00Z", venue: { stadium: "Los Angeles Stadium", city: "Los Angeles", country: "USA", tz: "America/Los_Angeles" } },
  { id: "m37", fifaId: "400021487", matchNumber: 37, group: "H", round: 2, home: "URU", away: "CPV", kickoff: "2026-06-21T22:00:00Z", venue: { stadium: "Miami Stadium", city: "Miami", country: "USA", tz: "America/New_York" } },
  { id: "m40", fifaId: "400021480", matchNumber: 40, group: "G", round: 2, home: "NZL", away: "EGY", kickoff: "2026-06-22T01:00:00Z", venue: { stadium: "BC Place Vancouver", city: "Vancouver", country: "CAN", tz: "America/Vancouver" } },
  { id: "m43", fifaId: "400021494", matchNumber: 43, group: "J", round: 2, home: "ARG", away: "AUT", kickoff: "2026-06-22T17:00:00Z", venue: { stadium: "Dallas Stadium", city: "Dallas", country: "USA", tz: "America/Chicago" } },
  { id: "m42", fifaId: "400021492", matchNumber: 42, group: "I", round: 2, home: "FRA", away: "IRQ", kickoff: "2026-06-22T21:00:00Z", venue: { stadium: "Philadelphia Stadium", city: "Philadelphia", country: "USA", tz: "America/New_York" } },
  { id: "m41", fifaId: "400021491", matchNumber: 41, group: "I", round: 2, home: "NOR", away: "SEN", kickoff: "2026-06-23T00:00:00Z", venue: { stadium: "New York/New Jersey Stadium", city: "New Jersey", country: "USA", tz: "America/New_York" } },
  { id: "m44", fifaId: "400021499", matchNumber: 44, group: "J", round: 2, home: "JOR", away: "ALG", kickoff: "2026-06-23T03:00:00Z", venue: { stadium: "San Francisco Bay Area Stadium", city: "San Francisco Bay Area", country: "USA", tz: "America/Los_Angeles" } },
  { id: "m47", fifaId: "400021503", matchNumber: 47, group: "K", round: 2, home: "POR", away: "UZB", kickoff: "2026-06-23T17:00:00Z", venue: { stadium: "Houston Stadium", city: "Houston", country: "USA", tz: "America/Chicago" } },
  { id: "m45", fifaId: "400021506", matchNumber: 45, group: "L", round: 2, home: "ENG", away: "GHA", kickoff: "2026-06-23T20:00:00Z", venue: { stadium: "Boston Stadium", city: "Boston", country: "USA", tz: "America/New_York" } },
  { id: "m46", fifaId: "400021511", matchNumber: 46, group: "L", round: 2, home: "PAN", away: "CRO", kickoff: "2026-06-23T23:00:00Z", venue: { stadium: "Toronto Stadium", city: "Toronto", country: "CAN", tz: "America/Toronto" } },
  { id: "m48", fifaId: "400021501", matchNumber: 48, group: "K", round: 2, home: "COL", away: "COD", kickoff: "2026-06-24T02:00:00Z", venue: { stadium: "Guadalajara Stadium", city: "Guadalajara", country: "MEX", tz: "America/Mexico_City" } },
  { id: "m51", fifaId: "400021451", matchNumber: 51, group: "B", round: 3, home: "SUI", away: "CAN", kickoff: "2026-06-24T19:00:00Z", venue: { stadium: "BC Place Vancouver", city: "Vancouver", country: "CAN", tz: "America/Vancouver" } },
  { id: "m52", fifaId: "400021448", matchNumber: 52, group: "B", round: 3, home: "BIH", away: "QAT", kickoff: "2026-06-24T19:00:00Z", venue: { stadium: "Seattle Stadium", city: "Seattle", country: "USA", tz: "America/Los_Angeles" } },
  { id: "m49", fifaId: "400021455", matchNumber: 49, group: "C", round: 3, home: "SCO", away: "BRA", kickoff: "2026-06-24T22:00:00Z", venue: { stadium: "Miami Stadium", city: "Miami", country: "USA", tz: "America/New_York" } },
  { id: "m50", fifaId: "400021452", matchNumber: 50, group: "C", round: 3, home: "MAR", away: "HAI", kickoff: "2026-06-24T22:00:00Z", venue: { stadium: "Atlanta Stadium", city: "Atlanta", country: "USA", tz: "America/New_York" } },
  { id: "m53", fifaId: "400021444", matchNumber: 53, group: "A", round: 3, home: "CZE", away: "MEX", kickoff: "2026-06-25T01:00:00Z", venue: { stadium: "Mexico City Stadium", city: "Mexico City", country: "MEX", tz: "America/Mexico_City" } },
  { id: "m54", fifaId: "400021445", matchNumber: 54, group: "A", round: 3, home: "RSA", away: "KOR", kickoff: "2026-06-25T01:00:00Z", venue: { stadium: "Monterrey Stadium", city: "Monterrey", country: "MEX", tz: "America/Monterrey" } },
  { id: "m55", fifaId: "400021468", matchNumber: 55, group: "E", round: 3, home: "CUW", away: "CIV", kickoff: "2026-06-25T20:00:00Z", venue: { stadium: "Philadelphia Stadium", city: "Philadelphia", country: "USA", tz: "America/New_York" } },
  { id: "m56", fifaId: "400021466", matchNumber: 56, group: "E", round: 3, home: "ECU", away: "GER", kickoff: "2026-06-25T20:00:00Z", venue: { stadium: "New York/New Jersey Stadium", city: "New Jersey", country: "USA", tz: "America/New_York" } },
  { id: "m57", fifaId: "400021471", matchNumber: 57, group: "F", round: 3, home: "JPN", away: "SWE", kickoff: "2026-06-25T23:00:00Z", venue: { stadium: "Dallas Stadium", city: "Dallas", country: "USA", tz: "America/Chicago" } },
  { id: "m58", fifaId: "400021473", matchNumber: 58, group: "F", round: 3, home: "TUN", away: "NED", kickoff: "2026-06-25T23:00:00Z", venue: { stadium: "Kansas City Stadium", city: "Kansas City", country: "USA", tz: "America/Chicago" } },
  { id: "m59", fifaId: "400021459", matchNumber: 59, group: "D", round: 3, home: "TUR", away: "USA", kickoff: "2026-06-26T02:00:00Z", venue: { stadium: "Los Angeles Stadium", city: "Los Angeles", country: "USA", tz: "America/Los_Angeles" } },
  { id: "m60", fifaId: "400021461", matchNumber: 60, group: "D", round: 3, home: "PAR", away: "AUS", kickoff: "2026-06-26T02:00:00Z", venue: { stadium: "San Francisco Bay Area Stadium", city: "San Francisco Bay Area", country: "USA", tz: "America/Los_Angeles" } },
  { id: "m61", fifaId: "400021489", matchNumber: 61, group: "I", round: 3, home: "NOR", away: "FRA", kickoff: "2026-06-26T19:00:00Z", venue: { stadium: "Boston Stadium", city: "Boston", country: "USA", tz: "America/New_York" } },
  { id: "m62", fifaId: "400021493", matchNumber: 62, group: "I", round: 3, home: "SEN", away: "IRQ", kickoff: "2026-06-26T19:00:00Z", venue: { stadium: "Toronto Stadium", city: "Toronto", country: "CAN", tz: "America/Toronto" } },
  { id: "m65", fifaId: "400021485", matchNumber: 65, group: "H", round: 3, home: "CPV", away: "KSA", kickoff: "2026-06-27T00:00:00Z", venue: { stadium: "Houston Stadium", city: "Houston", country: "USA", tz: "America/Chicago" } },
  { id: "m66", fifaId: "400021484", matchNumber: 66, group: "H", round: 3, home: "URU", away: "ESP", kickoff: "2026-06-27T00:00:00Z", venue: { stadium: "Guadalajara Stadium", city: "Guadalajara", country: "MEX", tz: "America/Mexico_City" } },
  { id: "m63", fifaId: "400021479", matchNumber: 63, group: "G", round: 3, home: "EGY", away: "IRN", kickoff: "2026-06-27T03:00:00Z", venue: { stadium: "Seattle Stadium", city: "Seattle", country: "USA", tz: "America/Los_Angeles" } },
  { id: "m64", fifaId: "400021481", matchNumber: 64, group: "G", round: 3, home: "NZL", away: "BEL", kickoff: "2026-06-27T03:00:00Z", venue: { stadium: "BC Place Vancouver", city: "Vancouver", country: "CAN", tz: "America/Vancouver" } },
  { id: "m67", fifaId: "400021508", matchNumber: 67, group: "L", round: 3, home: "PAN", away: "ENG", kickoff: "2026-06-27T21:00:00Z", venue: { stadium: "New York/New Jersey Stadium", city: "New Jersey", country: "USA", tz: "America/New_York" } },
  { id: "m68", fifaId: "400021509", matchNumber: 68, group: "L", round: 3, home: "CRO", away: "GHA", kickoff: "2026-06-27T21:00:00Z", venue: { stadium: "Philadelphia Stadium", city: "Philadelphia", country: "USA", tz: "America/New_York" } },
  { id: "m71", fifaId: "400021505", matchNumber: 71, group: "K", round: 3, home: "COL", away: "POR", kickoff: "2026-06-27T23:30:00Z", venue: { stadium: "Miami Stadium", city: "Miami", country: "USA", tz: "America/New_York" } },
  { id: "m72", fifaId: "400021500", matchNumber: 72, group: "K", round: 3, home: "COD", away: "UZB", kickoff: "2026-06-27T23:30:00Z", venue: { stadium: "Atlanta Stadium", city: "Atlanta", country: "USA", tz: "America/New_York" } },
  { id: "m69", fifaId: "400021497", matchNumber: 69, group: "J", round: 3, home: "ALG", away: "AUT", kickoff: "2026-06-28T02:00:00Z", venue: { stadium: "Kansas City Stadium", city: "Kansas City", country: "USA", tz: "America/Chicago" } },
  { id: "m70", fifaId: "400021495", matchNumber: 70, group: "J", round: 3, home: "JOR", away: "ARG", kickoff: "2026-06-28T02:00:00Z", venue: { stadium: "Dallas Stadium", city: "Dallas", country: "USA", tz: "America/Chicago" } },
];

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
