// Sweepstakes draw — the office classic. Randomly deal the 48 nations across a
// set of people. Deterministic from (members, seed) so it's provably fair and
// reproducible: anyone re-running the same names + seed gets the same draw.
// Pure + offline; no backend.

import { TEAMS } from "../data/teams";

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
