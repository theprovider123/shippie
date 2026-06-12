// Optional "in tune with the tournament" feed. A single bundled, same-origin
// `feed.json` carries: a short news ticker, live score snapshots, and the
// official results that drive live scoring + pool leaderboards.
//
// Offline-first: it's a static file shipped with the app (so it's cached and
// works offline), fetched on launch when online and refreshed per deploy. No
// third-party cloud — a future Shippie Worker can serve the same shape live.
// The last good feed is cached in localStorage so an offline cold start still
// shows the most recent known state.

import { GROUP_LETTERS, type GroupLetter } from "../data/tournament";
import type { Results } from "./types";

export interface NewsItem {
  at: string;
  text: string;
}

export interface LiveScore {
  matchId: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  minute?: string;
  status: "upcoming" | "live" | "ft";
}

export interface Feed {
  updatedAt: string;
  news: NewsItem[];
  live: LiveScore[];
  results: Results;
}

const CACHE_KEY = "golazo:feed";
// Lane-3 live feed (Shippie Feed Protocol). When an admin publishes scores, this goes live
// silently; until then the bundled static feed.json is used. Cross-origin-safe (CORS *).
const PLATFORM_FEED_URL = "https://shippie.app/api/apps/golazo/feeds/scores";

export function emptyFeed(): Feed {
  return { updatedAt: "", news: [], live: [], results: { groups: {}, knockout: {} } };
}

function cleanGroups(raw: unknown): Partial<Record<GroupLetter, string[]>> {
  const groups: Partial<Record<GroupLetter, string[]>> = {};
  if (!raw || typeof raw !== "object") return groups;
  const record = raw as Record<string, unknown>;
  for (const letter of GROUP_LETTERS) {
    const value = record[letter];
    if (!Array.isArray(value)) continue;
    const ids = value.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, 4);
    if (ids.length > 0) groups[letter] = ids;
  }
  return groups;
}

function cleanKnockout(raw: unknown): Record<string, string> {
  const knockout: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return knockout;
  for (const [slot, teamId] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof teamId === "string" && teamId.length > 0) knockout[slot] = teamId;
  }
  return knockout;
}

export function mergeResults(current: Results, incoming: Results): Results {
  return {
    groups: { ...current.groups, ...incoming.groups },
    knockout: { ...current.knockout, ...incoming.knockout },
    topScorer: incoming.topScorer ?? current.topScorer,
  };
}

export function resultCount(results: Results): number {
  return (
    Object.keys(results.knockout).length +
    Object.values(results.groups).filter((g) => g && g.length > 0).length +
    (results.topScorer ? 1 : 0)
  );
}

/** Defensive coercion of an untrusted JSON blob into a Feed. Pure + testable. */
export function normalizeFeed(raw: unknown): Feed {
  const f = emptyFeed();
  if (!raw || typeof raw !== "object") return f;
  const o = raw as Record<string, unknown>;
  if (typeof o.updatedAt === "string") f.updatedAt = o.updatedAt;

  if (Array.isArray(o.news)) {
    f.news = o.news
      .filter((n): n is Record<string, unknown> => Boolean(n) && typeof n === "object")
      .map((n) => ({ at: String(n.at ?? ""), text: String(n.text ?? "") }))
      .filter((n) => n.text.length > 0)
      .slice(0, 20);
  }

  if (Array.isArray(o.live)) {
    f.live = o.live
      .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === "object")
      .map((m) => ({
        matchId: String(m.matchId ?? ""),
        home: String(m.home ?? ""),
        away: String(m.away ?? ""),
        homeGoals: Number(m.homeGoals ?? 0) || 0,
        awayGoals: Number(m.awayGoals ?? 0) || 0,
        minute: m.minute != null ? String(m.minute) : undefined,
        status: (m.status === "live" || m.status === "ft"
          ? m.status
          : "upcoming") as LiveScore["status"],
      }))
      .filter((m) => m.matchId.length > 0);
  }

  if (o.results && typeof o.results === "object") {
    const r = o.results as Record<string, unknown>;
    f.results.groups = cleanGroups(r.groups);
    f.results.knockout = cleanKnockout(r.knockout);
    if (typeof r.topScorer === "string" && r.topScorer.length > 0) f.results.topScorer = r.topScorer;
  }
  return f;
}

function feedTime(feed: Feed): number {
  const t = Date.parse(feed.updatedAt);
  return Number.isFinite(t) ? t : 0;
}

function freshest(primary: Feed, cached: Feed | null): Feed {
  return cached && feedTime(cached) > feedTime(primary) ? cached : primary;
}

function readCache(): Feed | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? normalizeFeed(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * Fetch the bundled feed. On any failure (offline cold start, etc.) fall back
 * to the last cached feed, then to an empty feed. Returns `{ feed, online }`.
 */
export function cacheFeed(feed: Feed): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(feed));
  } catch {
    /* quota — ignore */
  }
}

export async function fetchFeed(): Promise<{ feed: Feed; online: boolean }> {
  const cached = readCache();
  // 1. The live platform feed (lane-3). A versioned envelope whose payload is a Feed.
  try {
    const res = await fetch(PLATFORM_FEED_URL, { cache: "no-store" });
    if (res.ok) {
      const env = await res.json();
      if (env && env.schema === "shippie.feed.v1" && env.payload && typeof env.payload === "object") {
        const feed = freshest(normalizeFeed(env.payload), cached);
        cacheFeed(feed);
        return { feed, online: true };
      }
    }
    // 404 / not-yet-published → fall through to the bundled feed.
  } catch {
    /* offline or blocked — fall through */
  }

  // 2. The bundled static feed.json (shipped with the app, cached by the SW for offline).
  try {
    const res = await fetch("./feed.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const json = await res.json();
    const feed = freshest(normalizeFeed(json), cached);
    cacheFeed(feed);
    return { feed, online: true };
  } catch {
    // 3. Last-good snapshot from a previous run.
    return { feed: cached ?? emptyFeed(), online: false };
  }
}

/** Has the feed actually published anything yet? */
export function feedHasResults(feed: Feed): boolean {
  return resultCount(feed.results) > 0;
}
