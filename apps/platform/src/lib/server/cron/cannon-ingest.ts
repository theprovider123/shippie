/**
 * The Cannon — scheduled season ingest (fires with the 5-minute cron).
 *
 * Three jobs, all idempotent (publishFeed no-ops on identical payloads):
 *   1. Fixtures refresh — provider-sourced, at most hourly, merged so manual
 *      edits (difficulty, ground, tv, h2h, manual-only fixtures) survive.
 *   2. Match-live phase machine — schedule-derived idle→pre→live→ft
 *      transitions that work with NO provider at all; a configured provider
 *      upgrades the live window with real score/minute/events.
 *   3. Provenance — provider publishes are stamped `external-api`; the
 *      schedule machine stamps `manual`/`scheduler` so a reader can always
 *      tell where a datum came from.
 *
 * A payload with `"lock": true` (set via the publish script for manual
 * matchday control) is never overwritten by this handler.
 */
import type { CronEnv } from './index';
import { getLatestFeed, publishFeed } from '../feeds/store';
import { createFootballDataProvider } from '../cannon/providers/football-data';
import type {
  CannonFixture,
  CannonMatchEvent,
  CannonScore,
  FootballDataProvider,
  ProviderMatchState,
} from '../cannon/providers/types';

const HOUR = 3_600_000;
const MIN = 60_000;

/** Live coverage window: 90min before kickoff → 150min after (ET + pens safe). */
export const PRE_WINDOW_MS = 6 * HOUR;
export const LIVE_GRACE_MS = 150 * MIN;
/** How long a finished match owns the Now screen before reverting to idle. */
export const FT_HOLD_MS = 36 * HOUR;
const FIXTURES_REFRESH_MS = 55 * MIN;

export interface FixturesPayload {
  season: string;
  club?: string;
  clubShort?: string;
  tablePosition?: number | null;
  fixtures: CannonFixture[];
  h2h?: Record<string, unknown>;
}

export interface MatchLivePayload {
  phase: 'idle' | 'pre' | 'live' | 'ht' | 'ft';
  matchId: string;
  kickoffUtc: string;
  comp?: string;
  opponent: string;
  opponentShort?: string;
  venue?: string;
  ground?: string | null;
  score: CannonScore | null;
  minute: number | null;
  events: CannonMatchEvent[];
  lineups?: unknown;
  preview?: unknown;
  lastResult?: Record<string, unknown> | null;
  lock?: boolean;
}

/** Merge a provider fixture list over the manual one. Manual editorial fields win. */
export function mergeFixtures(
  manual: FixturesPayload,
  provided: CannonFixture[],
): FixturesPayload {
  const byId = new Map(manual.fixtures.map((f) => [f.id, f]));
  const seen = new Set<string>();
  const merged: CannonFixture[] = provided.map((p) => {
    seen.add(p.id);
    const m = byId.get(p.id);
    if (!m) return { ...p, difficulty: p.difficulty ?? 'mid' };
    return {
      ...m,
      // Provider owns the facts that change without anyone editing JSON.
      kickoffUtc: p.kickoffUtc,
      status: p.status,
      score: p.score ?? m.score ?? null,
      // Manual owns the editorial layer when present.
      ground: m.ground ?? p.ground ?? null,
      tv: m.tv ?? p.tv ?? null,
      difficulty: m.difficulty ?? p.difficulty ?? 'mid',
    };
  });
  // Manual-only fixtures (e.g. competitions the provider doesn't carry) survive.
  for (const m of manual.fixtures) {
    if (!seen.has(m.id)) merged.push(m);
  }
  merged.sort((a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc));
  return { ...manual, fixtures: merged };
}

function nextFixture(fixtures: CannonFixture[], nowMs: number): CannonFixture | null {
  const upcoming = fixtures
    .filter((f) => f.status !== 'postponed' && Date.parse(f.kickoffUtc) + LIVE_GRACE_MS > nowMs && f.status !== 'ft')
    .sort((a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc));
  return upcoming[0] ?? null;
}

function lastFinished(fixtures: CannonFixture[], nowMs: number): CannonFixture | null {
  const done = fixtures
    .filter((f) => f.status === 'ft' && Date.parse(f.kickoffUtc) < nowMs)
    .sort((a, b) => Date.parse(b.kickoffUtc) - Date.parse(a.kickoffUtc));
  return done[0] ?? null;
}

function resultFromFixture(f: CannonFixture): Record<string, unknown> {
  const s = f.score ?? null;
  const label = s ? `Arsenal ${s.home}–${s.away} ${f.opponent}` : `Arsenal v ${f.opponent}`;
  return {
    matchId: f.id,
    label,
    opponent: f.opponent,
    opponentShort: f.opponentShort,
    venue: f.venue,
    comp: f.comp,
    score: s,
    playedAt: f.kickoffUtc,
  };
}

/**
 * The pure phase machine. Returns the next match-live payload, or null when
 * nothing should change. Works with `live = null` (manual mode): phases still
 * advance off the clock, score stays honest (null, not fabricated).
 */
export function planMatchLive(input: {
  nowMs: number;
  fixtures: FixturesPayload;
  current: MatchLivePayload | null;
  live: ProviderMatchState | null;
}): MatchLivePayload | null {
  const { nowMs, fixtures, current, live } = input;
  if (current?.lock) return null;

  const next = nextFixture(fixtures.fixtures, nowMs);
  const finished = lastFinished(fixtures.fixtures, nowMs);

  // A freshly-finished match holds the screen in `ft` before going idle.
  const ftHold =
    finished && nowMs - Date.parse(finished.kickoffUtc) < FT_HOLD_MS ? finished : null;

  const carry = {
    preview: current?.preview,
    lineups: current?.lineups ?? null,
    lastResult: current?.lastResult ?? null,
  };

  if (!next && !ftHold) {
    // No upcoming fixture and no fresh result. If a window passed with no
    // result published (manual mode, nobody ran the script), revert to idle
    // keyed to the most recent past fixture so the app never shows a stale
    // "live" state forever.
    const lastPast =
      fixtures.fixtures
        .filter((f) => Date.parse(f.kickoffUtc) < nowMs)
        .sort((a, b) => Date.parse(b.kickoffUtc) - Date.parse(a.kickoffUtc))[0] ?? null;
    const base = finished ?? lastPast;
    if (!base && !current) return null;
    return {
      phase: 'idle',
      matchId: base?.id ?? current?.matchId ?? 'season',
      kickoffUtc: base?.kickoffUtc ?? current?.kickoffUtc ?? new Date(nowMs).toISOString(),
      comp: base?.comp ?? current?.comp,
      opponent: base?.opponent ?? current?.opponent ?? '',
      opponentShort: base?.opponentShort ?? current?.opponentShort,
      venue: base?.venue ?? current?.venue,
      score: null,
      minute: null,
      events: [],
      ...carry,
      lastResult: finished ? resultFromFixture(finished) : carry.lastResult,
    };
  }

  // Inside the live window of the next fixture?
  if (next) {
    const ko = Date.parse(next.kickoffUtc);
    const inPre = nowMs >= ko - PRE_WINDOW_MS && nowMs < ko;
    const inLive = nowMs >= ko && nowMs < ko + LIVE_GRACE_MS;

    if (inLive || (live && live.fixtureId === next.id && live.phase !== 'pre')) {
      const phase = live?.phase === 'ft' ? 'ft' : live?.phase === 'ht' ? 'ht' : 'live';
      const payload: MatchLivePayload = {
        phase,
        matchId: next.id,
        kickoffUtc: next.kickoffUtc,
        comp: next.comp,
        opponent: next.opponent,
        opponentShort: next.opponentShort,
        venue: next.venue,
        ground: next.ground ?? null,
        score: live?.score ?? null,
        minute: live?.minute ?? null,
        events: live?.events ?? [],
        ...carry,
      };
      if (phase === 'ft' && live?.score) {
        payload.lastResult = resultFromFixture({ ...next, status: 'ft', score: live.score });
      }
      return payload;
    }

    if (inPre) {
      return {
        phase: 'pre',
        matchId: next.id,
        kickoffUtc: next.kickoffUtc,
        comp: next.comp,
        opponent: next.opponent,
        opponentShort: next.opponentShort,
        venue: next.venue,
        ground: next.ground ?? null,
        score: null,
        minute: null,
        events: [],
        ...carry,
      };
    }
  }

  // Post-match hold, or plain idle pointing at the next fixture.
  if (ftHold && (!next || nowMs < Date.parse(ftHold.kickoffUtc) + FT_HOLD_MS)) {
    const heldResult = resultFromFixture(ftHold);
    // If the current payload already shows this ft state, don't re-publish.
    if (current?.phase === 'ft' && current.matchId === ftHold.id) return null;
    return {
      phase: 'ft',
      matchId: ftHold.id,
      kickoffUtc: ftHold.kickoffUtc,
      comp: ftHold.comp,
      opponent: ftHold.opponent,
      opponentShort: ftHold.opponentShort,
      venue: ftHold.venue,
      score: ftHold.score ?? null,
      minute: null,
      events: current?.matchId === ftHold.id ? (current?.events ?? []) : [],
      ...carry,
      lastResult: heldResult,
    };
  }

  if (!next) return null;
  return {
    phase: 'idle',
    matchId: next.id,
    kickoffUtc: next.kickoffUtc,
    comp: next.comp,
    opponent: next.opponent,
    opponentShort: next.opponentShort,
    venue: next.venue,
    ground: next.ground ?? null,
    score: null,
    minute: null,
    events: [],
    ...carry,
    lastResult: finished ? resultFromFixture(finished) : carry.lastResult,
  };
}

export interface CannonIngestEnv extends CronEnv {
  CANNON_FOOTBALL_API_TOKEN?: string;
}

export async function cannonIngest(
  env: CannonIngestEnv,
  deps: { provider?: FootballDataProvider | null; nowMs?: number } = {},
): Promise<{ fixturesPublished: boolean; matchPublished: boolean }> {
  const db = env.DB;
  const nowMs = deps.nowMs ?? Date.now();
  const provider =
    deps.provider !== undefined
      ? deps.provider
      : env.CANNON_FOOTBALL_API_TOKEN
        ? createFootballDataProvider({ token: env.CANNON_FOOTBALL_API_TOKEN })
        : null;

  const fixturesEnv = await getLatestFeed(db, 'cannon', 'fixtures');
  if (!fixturesEnv) return { fixturesPublished: false, matchPublished: false };
  let fixtures = fixturesEnv.payload as FixturesPayload;

  let fixturesPublished = false;
  const fixturesAge = nowMs - Date.parse(fixturesEnv.updatedAt);
  if (provider && fixturesAge > FIXTURES_REFRESH_MS) {
    const provided = await provider.fixtures();
    if (provided && provided.length > 0) {
      fixtures = mergeFixtures(fixtures, provided);
      const res = await publishFeed(db, {
        appSlug: 'cannon',
        feedId: 'fixtures',
        dataSchema: 'cannon.fixtures.v1',
        payload: fixtures,
        source: { kind: 'external-api', name: provider.name },
        updatedAt: new Date(nowMs).toISOString(),
        nowMs,
      });
      fixturesPublished = res.changed;
    }
  }

  const matchEnv = await getLatestFeed(db, 'cannon', 'match-live');
  const current = (matchEnv?.payload as MatchLivePayload | undefined) ?? null;

  let live: ProviderMatchState | null = null;
  const next = nextFixture(fixtures.fixtures, nowMs);
  if (provider && next) {
    const ko = Date.parse(next.kickoffUtc);
    // Only burn provider calls when a match is close or in play.
    if (nowMs >= ko - 90 * MIN && nowMs < ko + LIVE_GRACE_MS) {
      live = await provider.liveMatch(next);
    }
  }

  const planned = planMatchLive({ nowMs, fixtures, current, live });
  let matchPublished = false;
  if (planned) {
    const res = await publishFeed(db, {
      appSlug: 'cannon',
      feedId: 'match-live',
      dataSchema: 'cannon.match.v1',
      payload: planned,
      // Stale fast during a live window so clients poll eagerly; lazy otherwise.
      staleAfter: new Date(
        nowMs + (planned.phase === 'live' || planned.phase === 'ht' ? 2 * MIN : 6 * HOUR),
      ).toISOString(),
      source: live
        ? { kind: 'external-api', name: provider?.name }
        : { kind: 'manual', name: 'schedule-machine' },
      updatedAt: new Date(nowMs).toISOString(),
      nowMs,
    });
    matchPublished = res.changed;
  }

  return { fixturesPublished, matchPublished };
}
