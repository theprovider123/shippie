// Sweepstakes draw — the office classic. Randomly deal the 48 nations across a
// set of people. Deterministic from (members, seed) so it's provably fair and
// reproducible: anyone re-running the same names + seed gets the same draw.
// Pure + offline; no backend.

import { TEAMS } from "../data/teams";
import type { Results } from "./types";
import { teamStage, isAlive, STAGE_RANK, type Stage } from "./progress";

export type SweepMode = "classic" | "draft";
export type SweepScope = "all48" | "top32" | "top16";

export const SCOPE_LABEL: Record<SweepScope, string> = {
  all48: "All 48 nations",
  top32: "Top 32 seeds",
  top16: "Top 16 seeds",
};

export const MODE_LABEL: Record<SweepMode, string> = {
  classic: "Classic — one nation each",
  draft: "Draft — split the field",
};

/** The team-id pool for a scope, strongest first by seed. */
export function scopePool(scope: SweepScope): string[] {
  const bySeed = [...TEAMS].sort((a, b) => a.seed - b.seed).map((t) => t.id);
  if (scope === "top16") return bySeed.slice(0, 16);
  if (scope === "top32") return bySeed.slice(0, 32);
  return bySeed;
}

/** FNV-1a string hash → 32-bit unsigned. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — small, fast, deterministic. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Sweep {
  id: string;
  name: string;
  seed: string;
  members: string[];
  createdAt: number;
  /** Draw model. Defaults to "draft" for sweeps created before modes existed. */
  mode?: SweepMode;
  /** Which slice of the field is in the hat. Defaults to all 48. */
  scope?: SweepScope;
  /** Buy-in per player (a tracker — no real money). 0/undefined = no pot. */
  stake?: number;
  /** Currency symbol for the pot, e.g. "£". */
  currency?: string;
}

export function sweepMode(s: Pick<Sweep, "mode">): SweepMode {
  return s.mode ?? "draft";
}
export function sweepScope(s: Pick<Sweep, "scope">): SweepScope {
  return s.scope ?? "all48";
}

/** Total pot = stake × players. */
export function potTotal(s: Sweep): number {
  return Math.max(0, Math.round((s.stake ?? 0) * cleanMembers(s.members).length));
}

function cleanMembers(members: string[]): string[] {
  return members.map((m) => m.trim()).filter(Boolean);
}

/**
 * Deal `teamPool` (default: all 48 nations) round-robin across `members`,
 * after a seeded shuffle. Returns memberName → team ids. Deterministic.
 */
export function drawSweep(
  members: string[],
  seed: string,
  teamPool: string[] = TEAMS.map((t) => t.id),
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const clean = members.map((m) => m.trim()).filter(Boolean);
  if (clean.length === 0) return result;
  for (const m of clean) result[m] = [];

  const rng = mulberry32(hashStr(seed));
  const shuffled = [...teamPool];
  // Fisher–Yates with the seeded PRNG.
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  shuffled.forEach((teamId, i) => {
    result[clean[i % clean.length]].push(teamId);
  });
  return result;
}

/**
 * Classic office sweepstake: one nation per player. Shuffle the pool and deal
 * a single team to each player. If there are more players than teams in scope,
 * the deal wraps (the UI warns and offers draft mode / a wider scope instead).
 */
export function drawClassic(
  members: string[],
  seed: string,
  teamPool: string[] = TEAMS.map((t) => t.id),
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const clean = cleanMembers(members);
  if (clean.length === 0 || teamPool.length === 0) {
    for (const m of clean) result[m] = [];
    return result;
  }
  const rng = mulberry32(hashStr(seed));
  const shuffled = [...teamPool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  clean.forEach((m, i) => {
    result[m] = [shuffled[i % shuffled.length]];
  });
  return result;
}

/** Deal a sweep by its configured mode + scope. The single source of truth. */
export function drawFor(sweep: Sweep): Record<string, string[]> {
  const pool = scopePool(sweepScope(sweep));
  return sweepMode(sweep) === "classic"
    ? drawClassic(sweep.members, sweep.seed, pool)
    : drawSweep(sweep.members, sweep.seed, pool);
}

/** True when a classic draw can't give everyone a unique nation. */
export function classicOverflow(sweep: Sweep): boolean {
  return (
    sweepMode(sweep) === "classic" &&
    cleanMembers(sweep.members).length > scopePool(sweepScope(sweep)).length
  );
}

export interface SweepStanding {
  member: string;
  /** Teams dealt to this member (1 in classic, several in draft). */
  teams: string[];
  /** The member's best-performing team. */
  bestTeam: string | null;
  bestStage: Stage;
  /** Sort key: best team's stage rank, then count of still-alive teams. */
  score: number;
  aliveCount: number;
}

/** Rank players by how far their best nation has gone. Best first. */
export function sweepStandings(sweep: Sweep, results: Results): SweepStanding[] {
  const draw = drawFor(sweep);
  const rows: SweepStanding[] = Object.entries(draw).map(([member, teams]) => {
    let bestTeam: string | null = null;
    let bestRank = -1;
    let aliveCount = 0;
    for (const t of teams) {
      const rank = STAGE_RANK[teamStage(t, results)];
      if (rank > bestRank) {
        bestRank = rank;
        bestTeam = t;
      }
      if (isAlive(t, results)) aliveCount++;
    }
    const bestStage = teamStage(bestTeam, results);
    return {
      member,
      teams,
      bestTeam,
      bestStage,
      aliveCount,
      score: STAGE_RANK[bestStage] * 100 + aliveCount,
    };
  });
  return rows.sort((a, b) => b.score - a.score || a.member.localeCompare(b.member));
}

/**
 * The winning player(s) — whoever owns the champion. Before the final is
 * decided, returns the current leader(s) by best-stage (the "if it ended now"
 * call). Empty when there are no results yet.
 */
export function sweepWinners(sweep: Sweep, results: Results): string[] {
  const standings = sweepStandings(sweep, results);
  const top = standings[0];
  if (!top || STAGE_RANK[top.bestStage] === 0) return [];
  return standings.filter((s) => s.score === top.score).map((s) => s.member);
}

/** True once the tournament has a champion (the pot can be settled). */
export function isSettled(results: Results): boolean {
  return Boolean(results.knockout["F-0"]);
}

/** A short, shareable seed code. */
export function makeSeed(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const rand = new Uint32Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(rand);
    for (let i = 0; i < 6; i++) out += alphabet[rand[i] % alphabet.length];
  } else {
    for (let i = 0; i < 6; i++)
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
