/**
 * GET    /api/golazo/scores?game=keepy|lastman          -> { scores: [{name,playerKey,score,at}] }
 * POST   /api/golazo/scores {game,name,playerKey,score}  -> { scores: [...] } (upserts, returns board)
 * POST   /api/golazo/scores {game:"lastman",live:[...]}  -> recomputes survivors after an admin score sync
 * PATCH  /api/golazo/scores {game:"lastman",live:[...]}  -> recomputes survivors after an admin score sync
 * DELETE /api/golazo/scores {playerKey,game?}            -> { scores: [...] } (removes one player)
 *
 * The worldwide leaderboard for the Golazo arcade games. Backed by the existing
 * CACHE KV binding (one key per game). Offline-safe on the client: the showcase
 * (leaderboard.ts) degrades to the local board when this is unreachable.
 *
 * To switch the games global:
 *   1. Deploy the platform (this route ships with it).
 *   2. Set GLOBAL_LEADERBOARD_URL in apps/showcase-golazo/src/lib/leaderboard.ts
 *      to "https://shippie.app/api/golazo/scores".
 *   3. Add "shippie.app" to allowed_connect_domains in apps/showcase-golazo/shippie.json.
 */
import { json } from "@sveltejs/kit";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { RequestHandler } from "./$types";

const GAMES = new Set(["keepy", "topbins", "freekick", "god", "lastman"]);
const MAX = 50;

interface Entry {
  name: string;
  playerKey: string;
  score: number;
  at: number;
}

interface LastManPick {
  day: string;
  fixtureId: string;
  teamId: string;
  at: number;
}

interface LastManRegistryEntry {
  name: string;
  playerKey: string;
  picks: LastManPick[];
  updatedAt: number;
}

interface Fixture {
  id: string;
  home: string;
  away: string;
  kickoff: string;
}

interface LiveScore {
  matchId: string;
  homeGoals: number;
  awayGoals: number;
  status: "upcoming" | "live" | "ft";
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function key(game: string): string {
  return `golazo:lb:${game}`;
}

const LAST_MAN_PICK_KEY = "golazo:lastman:picks";

const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;
const GROUPS: Record<(typeof GROUP_LETTERS)[number], [string, string, string, string]> = {
  A: ["MEX", "CRO", "ECU", "GHA"],
  B: ["CAN", "ITA", "AUT", "RSA"],
  C: ["ARG", "URU", "UKR", "KSA"],
  D: ["USA", "COL", "TUR", "QAT"],
  E: ["FRA", "MAR", "SRB", "IRQ"],
  F: ["BRA", "SUI", "POL", "UZB"],
  G: ["ENG", "JPN", "NOR", "JOR"],
  H: ["ESP", "SEN", "NGA", "PAN"],
  I: ["POR", "DEN", "EGY", "CRC"],
  J: ["NED", "IRN", "ALG", "JAM"],
  K: ["BEL", "KOR", "CIV", "PAR"],
  L: ["GER", "AUS", "CMR", "NZL"],
};

const RR: Array<[number, number]>[] = [
  [[0, 1], [2, 3]],
  [[0, 2], [3, 1]],
  [[3, 0], [1, 2]],
];

function buildGroupFixtures(): Fixture[] {
  const out: Fixture[] = [];
  const start = Date.UTC(2026, 5, 11, 16, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  let slot = 0;
  GROUP_LETTERS.forEach((letter, gi) => {
    const ids = GROUPS[letter];
    RR.forEach((pairs, ri) => {
      pairs.forEach(([h, a]) => {
        const day = ri * 5 + (gi % 5);
        const hour = (slot % 4) * 3;
        const kickoff = new Date(start + day * dayMs + hour * 60 * 60 * 1000);
        out.push({
          id: `${letter}${ri + 1}-${ids[h]}-${ids[a]}`,
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

const GROUP_FIXTURES = buildGroupFixtures();

async function readBoard(kv: KVNamespace, game: string): Promise<Entry[]> {
  const raw = await kv.get(key(game));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Entry[];
    return Array.isArray(arr)
      ? arr
          .filter((entry): entry is Entry => {
            if (!entry || typeof entry !== "object") return false;
            const e = entry as Partial<Entry>;
            return typeof e.name === "string" && Number.isFinite(e.score);
          })
          .map((entry) => ({
            name: String(entry.name).trim().slice(0, 24) || "Anon",
            playerKey:
              typeof entry.playerKey === "string" && entry.playerKey.trim()
                ? entry.playerKey.trim().slice(0, 80)
                : `legacy:${String(entry.name).trim().toLowerCase()}`,
            score: Math.floor(Number(entry.score)),
            at: Number(entry.at) || Date.now(),
          }))
      : [];
  } catch {
    return [];
  }
}

function normalizePicks(raw: unknown): LastManPick[] {
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

function normalizeLiveScores(raw: unknown): LiveScore[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      matchId: String(item.matchId ?? ""),
      homeGoals: Math.max(0, Math.floor(Number(item.homeGoals ?? 0) || 0)),
      awayGoals: Math.max(0, Math.floor(Number(item.awayGoals ?? 0) || 0)),
      status: (item.status === "ft" || item.status === "live" ? item.status : "upcoming") as LiveScore["status"],
    }))
    .filter((score) => score.matchId.length > 0);
}

async function readLastManRegistry(kv: KVNamespace): Promise<LastManRegistryEntry[]> {
  const raw = await kv.get(LAST_MAN_PICK_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item): item is Partial<LastManRegistryEntry> => Boolean(item) && typeof item === "object")
      .map((entry) => ({
        name: String(entry.name ?? "").trim().slice(0, 24) || "Anon",
        playerKey: String(entry.playerKey ?? "").trim().slice(0, 80),
        picks: normalizePicks(entry.picks),
        updatedAt: Number(entry.updatedAt) || Date.now(),
      }))
      .filter((entry) => entry.playerKey && entry.picks.length > 0);
  } catch {
    return [];
  }
}

async function writeLastManRegistry(kv: KVNamespace, entries: LastManRegistryEntry[]): Promise<void> {
  const seen = new Set<string>();
  const safe = entries
    .filter((entry) => {
      if (!entry.playerKey || seen.has(entry.playerKey)) return false;
      seen.add(entry.playerKey);
      return entry.picks.length > 0;
    })
    .slice(0, 5000);
  await kv.put(LAST_MAN_PICK_KEY, JSON.stringify(safe));
}

async function upsertLastManRegistry(
  kv: KVNamespace,
  entry: LastManRegistryEntry,
): Promise<void> {
  const previous = await readLastManRegistry(kv);
  await writeLastManRegistry(kv, [
    ...previous.filter((row) => row.playerKey !== entry.playerKey),
    entry,
  ]);
}

async function removeLastManRegistry(kv: KVNamespace, playerKey: string): Promise<void> {
  const previous = await readLastManRegistry(kv);
  await writeLastManRegistry(kv, previous.filter((row) => row.playerKey !== playerKey));
}

function livePayload(body: Record<string, unknown>): unknown {
  if (Array.isArray(body.live)) return body.live;
  const feed = body.feed;
  if (feed && typeof feed === "object" && Array.isArray((feed as Record<string, unknown>).live)) {
    return (feed as Record<string, unknown>).live;
  }
  return null;
}

function fixtureDay(fixture: Fixture): string {
  return fixture.kickoff.slice(0, 10);
}

function winnerFor(fixture: Fixture, score: LiveScore): string | null | undefined {
  if (score.status !== "ft") return undefined;
  if (score.homeGoals === score.awayGoals) return null;
  return score.homeGoals > score.awayGoals ? fixture.home : fixture.away;
}

function evaluateLastManPicks(picks: LastManPick[], liveScores: LiveScore[], now = Date.now()) {
  const safePicks = normalizePicks(picks);
  const liveById = new Map(liveScores.map((score) => [score.matchId, score]));
  const pickByDay = new Map(safePicks.map((pick) => [pick.day, pick]));
  const byDay = new Map<string, Fixture[]>();
  GROUP_FIXTURES.forEach((fixture) => {
    const day = fixtureDay(fixture);
    byDay.set(day, [...(byDay.get(day) ?? []), fixture]);
  });

  let alive = true;
  let survived = 0;
  let pendingPick = 0;

  for (const [day, fixtures] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!alive || pendingPick > 0) break;
    const startsAt = Math.min(...fixtures.map((fixture) => Date.parse(fixture.kickoff)));
    const pick = pickByDay.get(day);

    if (!pick) {
      if (startsAt <= now) alive = false;
      break;
    }

    const fixture = fixtures.find((candidate) => candidate.id === pick.fixtureId);
    if (!fixture || (pick.teamId !== fixture.home && pick.teamId !== fixture.away)) {
      alive = false;
      break;
    }

    const live = liveById.get(fixture.id);
    const winner = live ? winnerFor(fixture, live) : undefined;
    if (winner === undefined) {
      pendingPick = 1;
      break;
    }
    if (winner === pick.teamId) {
      survived += 1;
      continue;
    }
    alive = false;
  }

  return { alive, score: alive ? survived + pendingPick : 0 };
}

async function recomputeLastManBoard(
  kv: KVNamespace,
  liveScores: LiveScore[],
  now = Date.now(),
): Promise<{ scores: Entry[]; updated: number; removed: number }> {
  const previous = await readBoard(kv, "lastman");
  const previousByKey = new Map(previous.map((entry) => [entry.playerKey, entry]));
  const registry = await readLastManRegistry(kv);
  const next: Entry[] = [];
  let removed = 0;

  for (const entry of registry) {
    const run = evaluateLastManPicks(entry.picks, liveScores, now);
    if (run.alive && run.score > 0) {
      const prev = previousByKey.get(entry.playerKey);
      next.push({
        name: entry.name,
        playerKey: entry.playerKey,
        score: run.score,
        at: prev?.score === run.score ? prev.at : Date.now(),
      });
    } else {
      removed += 1;
    }
  }

  const scores = rank(next);
  await kv.put(key("lastman"), JSON.stringify(scores));
  return { scores, updated: scores.length, removed };
}

function rank(board: Entry[]): Entry[] {
  const seen = new Set<string>();
  return board
    .filter((e) => Number.isFinite(e.score) && e.score > 0)
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .filter((entry) => {
      if (seen.has(entry.playerKey)) return false;
      seen.add(entry.playerKey);
      return true;
    })
    .slice(0, MAX);
}

export const OPTIONS: RequestHandler = async () => new Response(null, { headers: cors });

export const GET: RequestHandler = async ({ url, platform }) => {
  const kv = platform?.env?.CACHE as KVNamespace | undefined;
  const game = url.searchParams.get("game") ?? "";
  if (!kv || !GAMES.has(game)) return json({ scores: [] }, { headers: cors });
  const scores = rank(await readBoard(kv, game)).map((e) => ({ ...e, game, source: "global" }));
  return json({ scores }, { headers: cors });
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const kv = platform?.env?.CACHE as KVNamespace | undefined;
  if (!kv) return json({ scores: [] }, { headers: cors });

  let body: {
    game?: string;
    name?: string;
    playerKey?: string;
    score?: unknown;
    picks?: unknown;
    live?: unknown;
    feed?: unknown;
    now?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400, headers: cors });
  }

  const game = String(body.game ?? "");
  const live = livePayload(body as Record<string, unknown>);
  if (game === "lastman" && live) {
    const result = await recomputeLastManBoard(kv, normalizeLiveScores(live), Number(body.now) || Date.now());
    return json({
      scores: result.scores.map((e) => ({ ...e, game: "lastman", source: "global" })),
      updated: result.updated,
      removed: result.removed,
    }, { headers: cors });
  }

  const name = String(body.name ?? "").trim().slice(0, 24) || "Anon";
  const playerKey = String(body.playerKey ?? "").trim().slice(0, 80);
  const score = Math.floor(Number(body.score));
  if (!GAMES.has(game) || !playerKey || !Number.isFinite(score) || score <= 0 || score > 100000) {
    return json({ error: "invalid_score" }, { status: 400, headers: cors });
  }

  if (game === "lastman" && body.picks) {
    const picks = normalizePicks(body.picks);
    if (picks.length > 0) {
      await upsertLastManRegistry(kv, {
        name,
        playerKey,
        picks,
        updatedAt: Date.now(),
      });
    }
  }

  const previous = await readBoard(kv, game);
  const existing = previous.find((entry) => entry.playerKey === playerKey);
  const nextEntry: Entry = {
    name,
    playerKey,
    score: Math.max(score, existing?.score ?? 0),
    at: Date.now(),
  };
  const top = rank([...previous.filter((entry) => entry.playerKey !== playerKey), nextEntry]);
  await kv.put(key(game), JSON.stringify(top));

  return json({ scores: top.map((e) => ({ ...e, game, source: "global" })) }, { headers: cors });
};

export const PATCH: RequestHandler = async ({ request, platform }) => {
  const kv = platform?.env?.CACHE as KVNamespace | undefined;
  if (!kv) return json({ scores: [] }, { headers: cors });

  let body: { game?: string; live?: unknown; feed?: unknown; now?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400, headers: cors });
  }

  const game = String(body.game ?? "lastman");
  const live = livePayload(body as Record<string, unknown>);
  if (game !== "lastman" || !live) {
    return json({ error: "invalid_lastman_sync" }, { status: 400, headers: cors });
  }

  const result = await recomputeLastManBoard(kv, normalizeLiveScores(live), Number(body.now) || Date.now());
  return json({
    scores: result.scores.map((e) => ({ ...e, game: "lastman", source: "global" })),
    updated: result.updated,
    removed: result.removed,
  }, { headers: cors });
};

export const DELETE: RequestHandler = async ({ request, platform }) => {
  const kv = platform?.env?.CACHE as KVNamespace | undefined;
  if (!kv) return json({ scores: [] }, { headers: cors });

  let body: { game?: string; playerKey?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400, headers: cors });
  }

  const playerKey = String(body.playerKey ?? "").trim().slice(0, 80);
  const requestedGame = body.game ? String(body.game) : "";
  if (!playerKey || (requestedGame && !GAMES.has(requestedGame))) {
    return json({ error: "invalid_player" }, { status: 400, headers: cors });
  }

  const games = requestedGame ? [requestedGame] : [...GAMES];
  let latest: Entry[] = [];
  if (!requestedGame || requestedGame === "lastman") {
    await removeLastManRegistry(kv, playerKey);
  }
  for (const game of games) {
    const board = await readBoard(kv, game);
    const next = rank(board.filter((entry) => entry.playerKey !== playerKey));
    await kv.put(key(game), JSON.stringify(next));
    if (!requestedGame || requestedGame === game) latest = next;
  }

  return json({
    scores: latest.map((e) => ({ ...e, game: requestedGame ?? "lastman", source: "global" })),
  }, { headers: cors });
};
