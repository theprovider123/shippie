/**
 * GET  /api/golazo/scores?game=keepy   -> { scores: [{name,score,at}] }  (top 50)
 * POST /api/golazo/scores  {game,name,score} -> { scores: [...] }          (inserts, returns board)
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

const GAMES = new Set(["keepy", "topbins"]);
const MAX = 50;

interface Entry {
  name: string;
  score: number;
  at: number;
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
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
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
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

  let body: { game?: string; name?: string; score?: unknown };
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

  const board = await readBoard(kv, game);
  board.push({ name, score, at: Date.now() });
  board.sort((a, b) => b.score - a.score || a.at - b.at);
  const top = board.slice(0, MAX);
  await kv.put(key(game), JSON.stringify(top));

  return json({ scores: top.map((e) => ({ ...e, source: "global" })) }, { headers: cors });
};
