// Optional "in tune with the tournament" feed. A single bundled, same-origin
// `feed.json` carries: a short news ticker, live score snapshots, and the
// official results that drive live scoring + pool leaderboards.
//
// Offline-first: it's a static file shipped with the app (so it's cached and
// works offline), fetched on launch when online and refreshed per deploy. No
// third-party cloud — a future Shippie Worker can serve the same shape live.
// The last good feed is cached in localStorage so an offline cold start still
// shows the most recent known state.

import type { GroupLetter } from "../data/tournament";
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

export function emptyFeed(): Feed {
  return { updatedAt: "", news: [], live: [], results: { groups: {}, knockout: {} } };
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
    if (r.groups && typeof r.groups === "object") {
      f.results.groups = r.groups as Partial<Record<GroupLetter, string[]>>;
    }
    if (r.knockout && typeof r.knockout === "object") {
      f.results.knockout = r.knockout as Record<string, string>;
    }
  }
  return f;
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
export async function fetchFeed(): Promise<{ feed: Feed; online: boolean }> {
  try {
    const res = await fetch("./feed.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const json = await res.json();
    const feed = normalizeFeed(json);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(json));
    } catch {
      /* quota — ignore */
    }
    return { feed, online: true };
  } catch {
    return { feed: readCache() ?? emptyFeed(), online: false };
  }
}

/** Has the feed actually published anything yet? */
export function feedHasResults(feed: Feed): boolean {
  return (
    Object.keys(feed.results.knockout).length > 0 ||
    Object.values(feed.results.groups).some((g) => g && g.length > 0)
  );
}
