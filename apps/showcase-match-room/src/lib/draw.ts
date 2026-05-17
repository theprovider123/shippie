import { TEAMS } from '../data/tournament.ts';

export interface SweepstakeDraw {
  member: string;
  teams: string[];
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  let state = hashSeed(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = nextState(state);
    const j = state % (i + 1);
    const current = out[i];
    const swap = out[j];
    if (current === undefined || swap === undefined) continue;
    out[i] = swap;
    out[j] = current;
  }
  return out;
}

export function createSweepstakeDraw(members: readonly string[], seed: string): SweepstakeDraw[] {
  const cleanMembers = members.map((member) => member.trim()).filter(Boolean);
  if (cleanMembers.length === 0) return [];
  const shuffledTeams = seededShuffle(TEAMS.map((team) => team.code), seed);
  return cleanMembers.map((member, index) => ({
    member,
    teams: shuffledTeams.filter((_, teamIndex) => teamIndex % cleanMembers.length === index),
  }));
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const char of seed || 'shippie-match-room') {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextState(state: number): number {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}
