// Worldwide leaderboard client. Optional + graceful: if no endpoint is configured
// or the network is down, the games fall back to the on-device board and shared
// challenges, so they always work offline. Flip GLOBAL on by setting the endpoint
// (a tiny Cloudflare Worker / platform route that stores top-N per game in KV).

import type { GameId, ScoreEntry } from "./games";

/**
 * Leaderboard endpoint. Empty = local-only (offline ethos). When set, expects:
 *   GET  {url}?game=keepy        -> { scores: ScoreEntry[] }
 *   POST {url}  {game,name,score} -> { scores: ScoreEntry[] }
 * The host must be whitelisted in shippie.json allowed_connect_domains.
 */
export const GLOBAL_LEADERBOARD_URL = "https://shippie.app/api/golazo/scores";

export function isGlobalEnabled(): boolean {
  return GLOBAL_LEADERBOARD_URL.length > 0;
}

const TIMEOUT_MS = 4000;

function withTimeout(signal?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  signal?.addEventListener("abort", () => ctrl.abort());
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

/** Fetch the global top-N for a game. Returns [] on any failure (offline-safe). */
export async function fetchGlobal(game: GameId): Promise<ScoreEntry[]> {
  if (!isGlobalEnabled()) return [];
  const { signal, done } = withTimeout();
  try {
    const r = await fetch(`${GLOBAL_LEADERBOARD_URL}?game=${encodeURIComponent(game)}`, { signal });
    if (!r.ok) return [];
    const data = (await r.json()) as { scores?: ScoreEntry[] };
    return (data.scores ?? []).map((s) => ({ ...s, source: "global" as const }));
  } catch {
    return [];
  } finally {
    done();
  }
}

/** Submit a score to the global board. Returns the updated board, or [] if it didn't land. */
export async function submitGlobal(entry: Pick<ScoreEntry, "game" | "name" | "score">): Promise<ScoreEntry[]> {
  if (!isGlobalEnabled()) return [];
  const { signal, done } = withTimeout();
  try {
    const r = await fetch(GLOBAL_LEADERBOARD_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ game: entry.game, name: entry.name.slice(0, 24), score: Math.floor(entry.score) }),
      signal,
    });
    if (!r.ok) return [];
    const data = (await r.json()) as { scores?: ScoreEntry[] };
    return (data.scores ?? []).map((s) => ({ ...s, source: "global" as const }));
  } catch {
    return [];
  } finally {
    done();
  }
}
