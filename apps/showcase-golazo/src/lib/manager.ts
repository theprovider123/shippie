// Manager Mode: pick a starting XI from a fixed budget, share the team sheet,
// duel a mate by link. Points ride on real player performances. Pure + offline.
// The pool is a small bundled evergreen list — no data feeds, true to the ethos.

export type Position = "GK" | "DEF" | "MID" | "FWD";

export interface Player {
  /** Stable short id used in share links — never renumber casually. */
  id: string;
  name: string;
  /** Nation id (matches teams.ts) for the flag. */
  nation: string;
  pos: Position;
  /** Cost in budget units. */
  cost: number;
}

export const MANAGER_BUDGET = 100;

// ~24 marquee names across the favourites. Costs are vibes, not a price list.
export const PLAYERS: Player[] = [
  { id: "mbappe", name: "Mbappé", nation: "FRA", pos: "FWD", cost: 15 },
  { id: "haaland", name: "Haaland", nation: "NOR", pos: "FWD", cost: 14 },
  { id: "vinicius", name: "Vinícius Jr", nation: "BRA", pos: "FWD", cost: 13 },
  { id: "kane", name: "Kane", nation: "ENG", pos: "FWD", cost: 12 },
  { id: "messi", name: "Messi", nation: "ARG", pos: "FWD", cost: 12 },
  { id: "bellingham", name: "Bellingham", nation: "ENG", pos: "MID", cost: 12 },
  { id: "yamal", name: "Yamal", nation: "ESP", pos: "FWD", cost: 11 },
  { id: "wirtz", name: "Wirtz", nation: "GER", pos: "MID", cost: 10 },
  { id: "pedri", name: "Pedri", nation: "ESP", pos: "MID", cost: 9 },
  { id: "musiala", name: "Musiala", nation: "GER", pos: "MID", cost: 9 },
  { id: "rodri", name: "Rodri", nation: "ESP", pos: "MID", cost: 9 },
  { id: "dejong", name: "De Jong", nation: "NED", pos: "MID", cost: 8 },
  { id: "saka", name: "Saka", nation: "ENG", pos: "MID", cost: 9 },
  { id: "vandijk", name: "Van Dijk", nation: "NED", pos: "DEF", cost: 7 },
  { id: "hakimi", name: "Hakimi", nation: "MAR", pos: "DEF", cost: 6 },
  { id: "saliba", name: "Saliba", nation: "FRA", pos: "DEF", cost: 6 },
  { id: "dias", name: "Rúben Dias", nation: "POR", pos: "DEF", cost: 6 },
  { id: "theo", name: "Theo Hernández", nation: "FRA", pos: "DEF", cost: 5 },
  { id: "bastoni", name: "Bastoni", nation: "ITA", pos: "DEF", cost: 5 },
  { id: "trent", name: "Alexander-Arnold", nation: "ENG", pos: "DEF", cost: 6 },
  { id: "donnarumma", name: "Donnarumma", nation: "ITA", pos: "GK", cost: 5 },
  { id: "courtois", name: "Courtois", nation: "BEL", pos: "GK", cost: 5 },
  { id: "alisson", name: "Alisson", nation: "BRA", pos: "GK", cost: 5 },
  { id: "martinez", name: "E. Martínez", nation: "ARG", pos: "GK", cost: 4 },
];

const BY_ID = new Map(PLAYERS.map((p) => [p.id, p]));

export function player(id: string): Player | undefined {
  return BY_ID.get(id);
}

export function squadCost(ids: string[]): number {
  return ids.reduce((sum, id) => sum + (BY_ID.get(id)?.cost ?? 0), 0);
}

/** A legal XI: exactly 11 distinct, real players within budget. */
export function validXI(ids: string[], budget = MANAGER_BUDGET): boolean {
  if (ids.length !== 11) return false;
  if (new Set(ids).size !== 11) return false;
  if (!ids.every((id) => BY_ID.has(id))) return false;
  return squadCost(ids) <= budget;
}

/** Sum a team's points from a performance map (playerId -> points). */
export function scoreXI(ids: string[], perf: Record<string, number>): number {
  return ids.reduce((sum, id) => sum + (perf[id] ?? 0), 0);
}

// ── Share / duel link codec ──
export function encodeTeam(ids: string[]): string {
  return ids.join(",");
}

export function decodeTeam(code: string): string[] {
  return code
    .split(",")
    .map((s) => s.trim())
    .filter((id) => BY_ID.has(id));
}

export function managerUrl(ids: string[], base?: string): string {
  const root =
    base ??
    (typeof location !== "undefined"
      ? location.origin + location.pathname
      : "https://shippie.app/run/golazo/");
  return `${root}#xi=${encodeTeam(ids)}`;
}

export function readManagerFromHash(hash: string): string[] | null {
  const m = /[#&]xi=([^&]+)/.exec(hash);
  if (!m) return null;
  const ids = decodeTeam(decodeURIComponent(m[1]));
  return ids.length ? ids : null;
}

/** A crude "star power" rating for an XI — used to settle a sheet-vs-sheet duel
 *  when there are no live performances to score against yet. */
export function squadRating(ids: string[]): number {
  return squadCost(ids);
}
