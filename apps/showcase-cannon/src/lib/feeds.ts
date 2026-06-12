/**
 * Season data client — the Feed Protocol ladder for every editorial surface:
 *
 *   platform feed (GET /api/apps/cannon/feeds/<feed>)
 *     → last-good localStorage snapshot (the SDK caches each envelope)
 *       → bundled season seed (src/season/*.json, baked at build time)
 *
 * The hook reports provenance with the data: `asOf` (envelope updatedAt) and
 * `stale` (past the envelope's staleAfter, or seed-only), so screens can show
 * honest "as of" labels instead of silently lying about freshness.
 */
import { useEffect, useRef, useState } from 'react';
import { shippie } from '@shippie/sdk';
import type { FeedEnvelope } from '@shippie/sdk';
import type { ClubFeed, FixturesFeed, MatchFeed, NewsFeed, SquadFeed } from './types';
import seedFixtures from '../season/fixtures.json';
import seedMatch from '../season/match.json';
import seedSquad from '../season/squad.json';
import seedNews from '../season/news.json';
import seedClub from '../season/club.json';

export const APP = 'cannon';

// Same-origin in production (the app document lives on shippie.app whether
// reached via cannon.shippie.app → /run/cannon or directly); the platform
// dev server in development.
if (import.meta.env.DEV) {
  shippie.feeds.configure({ origin: 'http://localhost:4101' });
} else if (typeof window !== 'undefined') {
  shippie.feeds.configure({ origin: window.location.origin });
}

export interface FeedState<T> {
  data: T;
  /** ISO timestamp of the snapshot, null when running on the bundled seed. */
  asOf: string | null;
  /** True when past staleAfter or when only the bundled seed is available. */
  stale: boolean;
  /** True once a live fetch has succeeded this session. */
  online: boolean;
}

interface SeedSpec<T> {
  feed: string;
  seed: T;
}

export const FEEDS = {
  fixtures: { feed: 'fixtures', seed: seedFixtures as unknown as FixturesFeed },
  match: { feed: 'match-live', seed: seedMatch as unknown as MatchFeed },
  squad: { feed: 'squad', seed: seedSquad as unknown as SquadFeed },
  news: { feed: 'news', seed: seedNews as unknown as NewsFeed },
  club: { feed: 'club', seed: seedClub as unknown as ClubFeed },
} as const;

function isStale(env: FeedEnvelope, nowMs: number): boolean {
  if (!env.staleAfter) return false;
  const t = Date.parse(env.staleAfter);
  return Number.isFinite(t) && nowMs > t;
}

function fromEnvelope<T>(env: FeedEnvelope<T> | null, spec: SeedSpec<T>, online: boolean): FeedState<T> {
  if (!env) return { data: spec.seed, asOf: null, stale: true, online: false };
  return {
    data: env.payload,
    asOf: env.updatedAt,
    stale: isStale(env, Date.now()),
    online,
  };
}

/** Synchronous best snapshot for first paint: cache if present, else seed. */
export function initialFeedState<T>(spec: SeedSpec<T>): FeedState<T> {
  try {
    const cached = shippie.feeds.cached(APP, spec.feed) as FeedEnvelope<T> | null;
    return fromEnvelope(cached, spec, false);
  } catch {
    return { data: spec.seed, asOf: null, stale: true, online: false };
  }
}

export async function refreshFeed<T>(spec: SeedSpec<T>): Promise<FeedState<T>> {
  try {
    const env = (await shippie.feeds.get(APP, spec.feed)) as FeedEnvelope<T> | null;
    if (env) return fromEnvelope(env, spec, true);
  } catch {
    /* offline — initial state stands */
  }
  return initialFeedState(spec);
}

/**
 * React hook over the ladder. `pollMs` re-fetches on an interval — the Now
 * screen polls fast during a live match, everything else loads once.
 */
export function useFeed<T>(spec: SeedSpec<T>, pollMs?: number): FeedState<T> {
  const [state, setState] = useState<FeedState<T>>(() => initialFeedState(spec));
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      refreshFeed(spec).then((next) => {
        if (live.current) setState(next);
      });
    };
    tick();
    if (pollMs && pollMs > 0) timer = setInterval(tick, pollMs);
    return () => {
      live.current = false;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.feed, pollMs]);

  return state;
}

/** Compact "as of" label for stale badges: "as of 14:05" / "as of Sat 16 Aug". */
export function asOfLabel(asOf: string | null): string {
  if (!asOf) return 'season guide data';
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return 'cached';
  const d = new Date(t);
  const sameDay = new Date().toDateString() === d.toDateString();
  if (sameDay) {
    return `as of ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `as of ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
}
