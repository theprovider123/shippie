// Worldwide leaderboard client. Optional + graceful: if no endpoint is configured
// or the network is down, the games fall back to the on-device board and shared
// challenges, so they always work offline. Flip GLOBAL on by setting the endpoint
// (a tiny Cloudflare Worker / platform route that stores top-N per game in KV).

import type { GameId, ScoreEntry } from "./games";
import { GAMES, bestScore } from "./games";
import type { Profile } from "./types";

/**
 * Leaderboard endpoint. Empty = local-only (offline ethos). When set, expects:
 *   GET    {url}?game=keepy                    -> { scores: ScoreEntry[] }
 *   POST   {url}  {game,name,playerKey,score}  -> { scores: ScoreEntry[] }
 *   DELETE {url}  {playerKey, game?}            -> { scores: ScoreEntry[] }
 * The host must be whitelisted in shippie.json allowed_connect_domains.
 */
export const GLOBAL_LEADERBOARD_URL = "https://shippie.app/api/golazo/scores";

export function isGlobalEnabled(): boolean {
  return GLOBAL_LEADERBOARD_URL.length > 0;
}

const TIMEOUT_MS = 4000;
const SYNC_CHANNEL = "golazo:leaderboard-sync";

export interface LeaderboardSyncEvent {
  game?: GameId;
  playerKey?: string;
  at: number;
}

export interface LeaderboardSyncResult {
  published: number;
  removed: boolean;
}

function slugKey(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "player";
}

export function profileLeaderboardKey(profile: Pick<Profile, "name" | "uid">): string {
  return `${slugKey(profile.name)}:${profile.uid}`;
}

let syncChannel: BroadcastChannel | null = null;

function channel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (syncChannel) return syncChannel;
  try {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL);
  } catch {
    syncChannel = null;
  }
  return syncChannel;
}

export function notifyLeaderboardSync(event: Partial<LeaderboardSyncEvent> = {}): void {
  const detail: LeaderboardSyncEvent = { ...event, at: Date.now() };
  try {
    window.dispatchEvent(new CustomEvent(SYNC_CHANNEL, { detail }));
  } catch {
    /* ignore */
  }
  try {
    channel()?.postMessage(detail);
  } catch {
    /* ignore */
  }
}

export function subscribeLeaderboardSync(cb: (event: LeaderboardSyncEvent) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onWindow = (event: Event) => {
    cb((event as CustomEvent<LeaderboardSyncEvent>).detail);
  };
  window.addEventListener(SYNC_CHANNEL, onWindow);
  const bc = channel();
  const onMessage = (event: MessageEvent<LeaderboardSyncEvent>) => cb(event.data);
  bc?.addEventListener("message", onMessage);
  return () => {
    window.removeEventListener(SYNC_CHANNEL, onWindow);
    bc?.removeEventListener("message", onMessage);
  };
}

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
export async function submitGlobal(
  entry: Pick<ScoreEntry, "game" | "name" | "score"> & { playerKey: string },
): Promise<ScoreEntry[]> {
  if (!isGlobalEnabled()) return [];
  const { signal, done } = withTimeout();
  try {
    const r = await fetch(GLOBAL_LEADERBOARD_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        game: entry.game,
        name: entry.name.slice(0, 24),
        playerKey: entry.playerKey,
        score: Math.floor(entry.score),
      }),
      signal,
    });
    if (!r.ok) return [];
    const data = (await r.json()) as { scores?: ScoreEntry[] };
    const scores = (data.scores ?? []).map((s) => ({ ...s, source: "global" as const }));
    notifyLeaderboardSync({ game: entry.game, playerKey: entry.playerKey });
    return scores;
  } catch {
    return [];
  } finally {
    done();
  }
}

/** Remove one player's global rows. Omitting game removes them from every Golazo board. */
export async function deleteGlobalScores(playerKey: string, game?: GameId): Promise<ScoreEntry[]> {
  if (!isGlobalEnabled()) return [];
  const { signal, done } = withTimeout();
  try {
    const r = await fetch(GLOBAL_LEADERBOARD_URL, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerKey, game }),
      signal,
    });
    if (!r.ok) return [];
    const data = (await r.json()) as { scores?: ScoreEntry[] };
    notifyLeaderboardSync({ game, playerKey });
    return (data.scores ?? []).map((s) => ({ ...s, source: "global" as const }));
  } catch {
    return [];
  } finally {
    done();
  }
}

/** Apply the current profile consent to every local best score. */
export async function syncGlobalScores(
  profile: Profile,
  scores: ScoreEntry[],
  enabled = !!profile.globalLeaderboardOptIn,
): Promise<LeaderboardSyncResult> {
  const playerKey = profileLeaderboardKey(profile);
  if (!enabled) {
    await deleteGlobalScores(playerKey);
    return { published: 0, removed: true };
  }

  let published = 0;
  for (const game of GAMES.map((g) => g.id)) {
    const score = bestScore(scores, game);
    if (score <= 0) continue;
    await submitGlobal({ game, name: profile.name, score, playerKey });
    published += 1;
  }
  if (published === 0) notifyLeaderboardSync({ playerKey });
  return { published, removed: false };
}
