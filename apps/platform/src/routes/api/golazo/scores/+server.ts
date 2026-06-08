/**
 * GET    /api/golazo/scores?game=keepy -> { scores: [{name,score,at}] } (top 50)
 * POST   /api/golazo/scores {game,name,playerKey,score,picks?} -> upserts row
 * DELETE /api/golazo/scores {playerKey,game?} -> removes opted-out rows
 * PATCH  /api/golazo/scores {game:"lastman",live:[...]} -> recomputes survivor board
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
  score: number;
  at: number;
  playerKey?: string;
  picks?: LastManPick[];
}

interface LastManPick {
  day: string;
  fixtureId: string;
  teamId: string;
  at: number;
}

interface LiveScore {
  matchId: string;
  home: string;
  away: string;
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

async function readBoard(kv: KVNamespace, game: string): Promise<Entry[]> {
  const raw = await kv.get(key(game));
  if (!raw) return [];
  try {
    return normalizeBoard(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function writeBoard(kv: KVNamespace, game: string, board: Entry[]): Promise<Entry[]> {
  const top = rank(board).slice(0, MAX);
  await kv.put(key(game), JSON.stringify(top));
  return top;
}

export const OPTIONS: RequestHandler = async () => new Response(null, { headers: cors });

export const GET: RequestHandler = async ({ url, platform }) => {
  const kv = platform?.env?.CACHE as KVNamespace | undefined;
  const game = url.searchParams.get("game") ?? "";
  if (!kv || !GAMES.has(game)) return json({ scores: [] }, { headers: cors });
  const scores = (await readBoard(kv, game)).map((e) => ({ ...e, source: "global" }));
  return json({ scores }, { headers: cors });
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const kv = platform?.env?.CACHE as KVNamespace | undefined;
  if (!kv) return json({ scores: [] }, { headers: cors });

  let body: { game?: string; name?: string; playerKey?: string; score?: unknown; picks?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400, headers: cors });
  }

  const game = String(body.game ?? "");
  const name = String(body.name ?? "").trim().slice(0, 24) || "Anon";
  const score = Math.floor(Number(body.score));
  if (!GAMES.has(game) || !Number.isFinite(score) || score <= 0 || score > 100000) {
    return json({ error: "invalid_score" }, { status: 400, headers: cors });
  }

  const playerKey = cleanPlayerKey(body.playerKey);
  const board = await readBoard(kv, game);
  const next = playerKey ? board.filter((entry) => entry.playerKey !== playerKey) : [...board];
  next.push({
    name,
    score,
    at: Date.now(),
    ...(playerKey ? { playerKey } : {}),
    ...(game === "lastman" ? { picks: normalizePicks(body.picks) } : {}),
  });
  const top = await writeBoard(kv, game, next);

  return json({ scores: top.map((e) => ({ ...e, source: "global" })) }, { headers: cors });
};

export const DELETE: RequestHandler = async ({ request, platform }) => {
  const kv = platform?.env?.CACHE as KVNamespace | undefined;
  if (!kv) return json({ scores: [] }, { headers: cors });

  let body: { playerKey?: string; game?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400, headers: cors });
  }

  const playerKey = cleanPlayerKey(body.playerKey);
  const game = body.game ? String(body.game) : "";
  if (!playerKey) return json({ error: "missing_player_key" }, { status: 400, headers: cors });
  if (game && !GAMES.has(game)) return json({ error: "invalid_game" }, { status: 400, headers: cors });

  const games = game ? [game] : [...GAMES];
  let responseScores: Entry[] = [];
  for (const boardGame of games) {
    const board = await readBoard(kv, boardGame);
    const next = board.filter((entry) => entry.playerKey !== playerKey);
    const top = await writeBoard(kv, boardGame, next);
    if (boardGame === game) responseScores = top;
  }

  return json({ scores: responseScores.map((e) => ({ ...e, source: "global" })) }, { headers: cors });
};

export const PATCH: RequestHandler = async ({ request, platform }) => {
  const kv = platform?.env?.CACHE as KVNamespace | undefined;
  if (!kv) return json({ scores: [] }, { headers: cors });

  let body: { game?: string; live?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400, headers: cors });
  }
  if (body.game !== "lastman") {
    return json({ error: "invalid_game" }, { status: 400, headers: cors });
  }

  const live = normalizeLiveScores(body.live);
  const board = await readBoard(kv, "lastman");
  const recomputed = board
    .map((entry) => recomputeLastManEntry(entry, live))
    .filter((entry): entry is Entry => Boolean(entry));
  const top = await writeBoard(kv, "lastman", recomputed);

  return json({ scores: top.map((e) => ({ ...e, source: "global" })) }, { headers: cors });
};

function normalizeBoard(raw: unknown): Entry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      name: cleanName(entry.name),
      score: Math.floor(Number(entry.score)),
      at: Number(entry.at) || Date.now(),
      ...(cleanPlayerKey(entry.playerKey) ? { playerKey: cleanPlayerKey(entry.playerKey) } : {}),
      ...(Array.isArray(entry.picks) ? { picks: normalizePicks(entry.picks) } : {}),
    }))
    .filter((entry) => Number.isFinite(entry.score) && entry.score > 0 && entry.score <= 100000);
}

function rank(board: Entry[]): Entry[] {
  return [...board].sort((a, b) => b.score - a.score || a.at - b.at);
}

function cleanName(value: unknown): string {
  return String(value ?? "").trim().slice(0, 24) || "Anon";
}

function cleanPlayerKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .slice(0, 96);
}

function normalizePicks(raw: unknown): LastManPick[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const picks: LastManPick[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const day = String(row.day ?? "").slice(0, 10);
    const fixtureId = String(row.fixtureId ?? "").slice(0, 64);
    const teamId = String(row.teamId ?? "").toUpperCase().slice(0, 12);
    if (!day || !fixtureId || !teamId || seen.has(day)) continue;
    seen.add(day);
    picks.push({ day, fixtureId, teamId, at: Number(row.at) || Date.now() });
  }
  return picks.sort((a, b) => a.day.localeCompare(b.day));
}

function normalizeLiveScores(raw: unknown): LiveScore[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((score): score is Record<string, unknown> => Boolean(score) && typeof score === "object")
    .map((score) => {
      const status: LiveScore["status"] =
        score.status === "ft" || score.status === "live" ? score.status : "upcoming";
      return {
        matchId: String(score.matchId ?? "").slice(0, 64),
        home: String(score.home ?? "").toUpperCase().slice(0, 12),
        away: String(score.away ?? "").toUpperCase().slice(0, 12),
        homeGoals: Math.max(0, Math.floor(Number(score.homeGoals) || 0)),
        awayGoals: Math.max(0, Math.floor(Number(score.awayGoals) || 0)),
        status,
      };
    })
    .filter((score) => score.matchId && score.home && score.away);
}

function recomputeLastManEntry(entry: Entry, liveScores: LiveScore[]): Entry | null {
  const picks = normalizePicks(entry.picks);
  if (picks.length === 0) return null;

  const liveByMatch = new Map(liveScores.map((score) => [score.matchId, score]));
  let survived = 0;
  for (const pick of picks) {
    const live = liveByMatch.get(pick.fixtureId);
    if (!live || live.status !== "ft") {
      return { ...entry, picks, score: survived + 1 };
    }
    const winner = winnerFor(live);
    if (winner !== pick.teamId) return null;
    survived += 1;
  }
  return { ...entry, picks, score: survived };
}

function winnerFor(score: LiveScore): string | null {
  if (score.homeGoals === score.awayGoals) return null;
  return score.homeGoals > score.awayGoals ? score.home : score.away;
}
