import { GROUP_FIXTURES, type Fixture } from "../data/tournament";
import type { LiveScore } from "./feed";

export interface LastManPick {
  day: string;
  fixtureId: string;
  teamId: string;
  at: number;
}

export type LastManRoundStatus = "open" | "pending" | "survived" | "out" | "missed" | "future";

export interface LastManRound {
  key: string;
  index: number;
  fixtures: Fixture[];
  startsAt: number;
  pick?: LastManPick;
  live?: LiveScore;
  winnerId?: string | null;
  status: LastManRoundStatus;
}

export interface LastManSummary {
  rounds: LastManRound[];
  current?: LastManRound;
  alive: boolean;
  eliminatedAt?: string;
  survived: number;
  boardScore: number;
  usedTeams: string[];
}

const PICK_KEY = "golazo:lastman";

export function loadLastManPicks(): LastManPick[] {
  try {
    const raw = localStorage.getItem(PICK_KEY);
    return raw ? normalizePicks(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveLastManPicks(picks: LastManPick[]): void {
  try {
    localStorage.setItem(PICK_KEY, JSON.stringify(normalizePicks(picks)));
  } catch {
    /* keep the run in memory if storage is full/private */
  }
}

export function upsertLastManPick(picks: LastManPick[], pick: LastManPick): LastManPick[] {
  const next = [...picks.filter((p) => p.day !== pick.day), pick];
  return normalizePicks(next);
}

export function normalizePicks(raw: unknown): LastManPick[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LastManPick[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Partial<LastManPick>;
    const day = String(p.day ?? "").slice(0, 10);
    const fixtureId = String(p.fixtureId ?? "");
    const teamId = String(p.teamId ?? "").toUpperCase();
    if (!day || !fixtureId || !teamId || seen.has(day)) continue;
    seen.add(day);
    out.push({ day, fixtureId, teamId, at: Number(p.at) || Date.now() });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

export function fixtureDay(fixture: Fixture): string {
  return fixture.kickoff.slice(0, 10);
}

export function evaluateLastMan(
  picks: LastManPick[],
  liveScores: LiveScore[],
  fixtures: Fixture[] = GROUP_FIXTURES,
  now = Date.now(),
): LastManSummary {
  const safePicks = normalizePicks(picks);
  const liveById = new Map(liveScores.map((score) => [score.matchId, score]));
  const pickByDay = new Map(safePicks.map((pick) => [pick.day, pick]));
  const rounds = buildRounds(fixtures).map((round) => {
    const pick = pickByDay.get(round.key);
    const fixture = pick ? round.fixtures.find((f) => f.id === pick.fixtureId) : undefined;
    const live = fixture ? liveById.get(fixture.id) : undefined;
    return { ...round, pick, live, winnerId: fixture && live ? winnerFor(fixture, live) : undefined };
  });

  let alive = true;
  let survived = 0;
  let current: LastManRound | undefined;
  let eliminatedAt: string | undefined;
  const usedTeams: string[] = [];

  const evaluated = rounds.map((round) => {
    if (!alive) return { ...round, status: "future" as const };
    if (current) return { ...round, status: "future" as const };

    if (!round.pick) {
      if (round.startsAt <= now) {
        alive = false;
        eliminatedAt = round.key;
        return { ...round, status: "missed" as const };
      }
      const next = { ...round, status: "open" as const };
      current = next;
      return next;
    }

    usedTeams.push(round.pick.teamId);
    if (round.winnerId === undefined) {
      const next = { ...round, status: "pending" as const };
      current = next;
      return next;
    }

    if (round.winnerId === round.pick.teamId) {
      survived += 1;
      return { ...round, status: "survived" as const };
    }

    alive = false;
    eliminatedAt = round.key;
    return { ...round, status: "out" as const };
  });

  if (alive && !current) current = evaluated.find((round) => round.status === "open" || round.status === "pending");
  const pendingPick = current?.status === "pending" ? 1 : 0;
  const boardScore = alive ? survived + pendingPick : 0;

  return { rounds: evaluated, current, alive, eliminatedAt, survived, boardScore, usedTeams };
}

function buildRounds(fixtures: Fixture[]): Omit<LastManRound, "status">[] {
  const byDay = new Map<string, Fixture[]>();
  fixtures.forEach((fixture) => {
    const key = fixtureDay(fixture);
    byDay.set(key, [...(byDay.get(key) ?? []), fixture]);
  });
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, dayFixtures], index) => {
      const sorted = [...dayFixtures].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
      return {
        key,
        index,
        fixtures: sorted,
        startsAt: Math.min(...sorted.map((f) => Date.parse(f.kickoff))),
      };
    });
}

function winnerFor(fixture: Fixture, score: LiveScore): string | null | undefined {
  if (score.status !== "ft") return undefined;
  if (score.homeGoals === score.awayGoals) return null;
  return score.homeGoals > score.awayGoals ? fixture.home : fixture.away;
}
