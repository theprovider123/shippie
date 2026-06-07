/**
 * GET    /api/golazo/scores?game=keepy|lastman         -> { scores: [{name,playerKey,score,at}] }
 * POST   /api/golazo/scores {game,name,playerKey,score} -> { scores: [...] } (upserts, returns board)
 * DELETE /api/golazo/scores {playerKey,game?}           -> { scores: [...] } (removes one player)
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

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function key(game: string): string {
  return `golazo:lb:${game}`;
}

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
  const scores = rank(await readBoard(kv, game)).map((e) => ({ ...e, source: "global" }));
  return json({ scores }, { headers: cors });
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const kv = platform?.env?.CACHE as KVNamespace | undefined;
  if (!kv) return json({ scores: [] }, { headers: cors });

  let body: { game?: string; name?: string; playerKey?: string; score?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400, headers: cors });
  }

  const game = String(body.game ?? "");
  const name = String(body.name ?? "").trim().slice(0, 24) || "Anon";
  const playerKey = String(body.playerKey ?? "").trim().slice(0, 80);
  const score = Math.floor(Number(body.score));
  if (!GAMES.has(game) || !playerKey || !Number.isFinite(score) || score <= 0 || score > 100000) {
    return json({ error: "invalid_score" }, { status: 400, headers: cors });
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

  return json({ scores: top.map((e) => ({ ...e, source: "global" })) }, { headers: cors });
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
  for (const game of games) {
    const board = await readBoard(kv, game);
    const next = rank(board.filter((entry) => entry.playerKey !== playerKey));
    await kv.put(key(game), JSON.stringify(next));
    if (!requestedGame || requestedGame === game) latest = next;
  }

  return json({ scores: latest.map((e) => ({ ...e, source: "global" })) }, { headers: cors });
};
