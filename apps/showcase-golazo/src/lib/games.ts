// Arcade mini-games + leaderboard model. Local-first: your bests live on-device
// and travel by challenge link, exactly like the rest of Golazo. A worldwide
// board lights up on top when a leaderboard endpoint is reachable (leaderboard.ts).

export type GameId = "keepy" | "topbins" | "freekick" | "god" | "lastman";

export interface GameMeta {
  id: GameId;
  name: string;
  tagline: string;
  /** How you play, in one line — shown on the start card. */
  how: string;
  unit: string; // "kick-ups", "goals"
}

export const GAMES: GameMeta[] = [
  {
    id: "keepy",
    name: "Keepy Uppy",
    tagline: "Don't let it drop",
    how: "Tap the ball to keep it in the air",
    unit: "kick-ups",
  },
  {
    id: "topbins",
    name: "Top Bins",
    tagline: "Beat the keeper",
    how: "Swipe to shoot — aim for the top corners",
    unit: "goals",
  },
  {
    id: "freekick",
    name: "Free Kick",
    tagline: "Bend it round the wall",
    how: "Swipe with a curve to bend it past the wall",
    unit: "goals",
  },
  {
    id: "god",
    name: "Group of Death",
    tagline: "Knowledge + nerve",
    how: "Flap through the gaps — pick the right answer at every gate",
    unit: "caps",
  },
  {
    id: "lastman",
    name: "Last Man Standing",
    tagline: "Survive every matchday",
    how: "Pick one winner each matchday — draws and defeats knock you out",
    unit: "days alive",
  },
];

export function gameMeta(id: GameId): GameMeta {
  return GAMES.find((g) => g.id === id) ?? GAMES[0];
}

export interface ScoreEntry {
  game: GameId;
  name: string;
  score: number;
  at: number;
  /** Stable name+uid key when a row has been published globally. */
  playerKey?: string;
  /** Where it came from, for board labelling. */
  source?: "you" | "global" | "challenge";
}

const MAX_PER_GAME = 50;

/** Add a score to the local board, keeping a sorted, de-duplicated top list. */
export function addLocalScore(entries: ScoreEntry[], entry: ScoreEntry): ScoreEntry[] {
  const next = [...entries, { ...entry, source: "you" as const }];
  return rankBoard(next).slice(0, MAX_PER_GAME * GAMES.length);
}

/** Best score for a game across a board. */
export function bestScore(entries: ScoreEntry[], game: GameId): number {
  return entries.filter((e) => e.game === game).reduce((m, e) => Math.max(m, e.score), 0);
}

/** Top N for a game, highest first. */
export function topScores(entries: ScoreEntry[], game: GameId, n = 10): ScoreEntry[] {
  return rankBoard(entries.filter((e) => e.game === game)).slice(0, n);
}

/** Merge local + global boards for a game into one ranked list (deduped). */
export function mergeBoards(local: ScoreEntry[], global: ScoreEntry[], game: GameId): ScoreEntry[] {
  const seen = new Set<string>();
  const all = [...global, ...local].filter((e) => e.game === game);
  const deduped: ScoreEntry[] = [];
  for (const e of rankBoard(all)) {
    const key = e.playerKey
      ? `${e.playerKey}:${e.game}`
      : `${e.name.toLowerCase()}:${e.score}:${e.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }
  return deduped;
}

function rankBoard(entries: ScoreEntry[]): ScoreEntry[] {
  return [...entries].sort((a, b) => b.score - a.score || a.at - b.at);
}

// ── Challenge links ──────────────────────────────────────────────────────────
// "Beat my 42 kick-ups" — a score travels in the URL hash, no backend.
export interface Challenge {
  game: GameId;
  name: string;
  score: number;
}

export function encodeChallenge(c: Challenge): string {
  return `${c.game}~${Math.max(0, Math.floor(c.score))}~${encodeURIComponent(c.name.slice(0, 24))}`;
}

export function decodeChallenge(code: string): Challenge | null {
  const m = /^(keepy|topbins|freekick|god|lastman)~(\d+)~(.*)$/.exec(code.trim());
  if (!m) return null;
  return { game: m[1] as GameId, score: Number(m[2]), name: decodeURIComponent(m[3]) || "A mate" };
}

export function challengeUrl(c: Challenge, base?: string): string {
  const root =
    base ??
    (typeof location !== "undefined" ? location.origin + location.pathname : "https://shippie.app/run/golazo/");
  return `${root}#play=${encodeChallenge(c)}`;
}

export function readChallengeFromHash(hash: string): Challenge | null {
  const m = /[#&]play=([^&]+)/.exec(hash);
  return m ? decodeChallenge(m[1]) : null;
}
