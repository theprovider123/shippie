import { describe, expect, it } from 'vitest';
import {
  FT_HOLD_MS,
  cannonIngest,
  mergeFixtures,
  planMatchLive,
  type FixturesPayload,
  type MatchLivePayload,
} from './cannon-ingest';
import {
  cannonFixtureId,
  mapMatchToFixture,
  mapMatchToLive,
} from '../cannon/providers/football-data';
import type { CannonFixture, FootballDataProvider } from '../cannon/providers/types';

const KO = Date.parse('2026-08-16T14:00:00Z');
const H = 3_600_000;
const M = 60_000;

function fixture(over: Partial<CannonFixture> = {}): CannonFixture {
  return {
    id: 'cs-mci-2026-08-16',
    kickoffUtc: '2026-08-16T14:00:00Z',
    comp: 'Community Shield',
    opponent: 'Man City',
    opponentShort: 'MCI',
    venue: 'N',
    ground: 'Principality Stadium, Cardiff',
    tv: null,
    status: 'scheduled',
    score: null,
    difficulty: 'hard',
    ...over,
  };
}

function payload(fixtures: CannonFixture[]): FixturesPayload {
  return { season: '2026/27', fixtures };
}

describe('planMatchLive — the schedule-only phase machine (manual mode)', () => {
  it('is idle well before a match, pointing at the next fixture', () => {
    const out = planMatchLive({ nowMs: KO - 48 * H, fixtures: payload([fixture()]), current: null, live: null });
    expect(out?.phase).toBe('idle');
    expect(out?.matchId).toBe('cs-mci-2026-08-16');
    expect(out?.score).toBeNull();
  });

  it('enters pre inside the 6h window', () => {
    const out = planMatchLive({ nowMs: KO - 2 * H, fixtures: payload([fixture()]), current: null, live: null });
    expect(out?.phase).toBe('pre');
  });

  it('goes live at kickoff with an honest null score (no provider)', () => {
    const out = planMatchLive({ nowMs: KO + 10 * M, fixtures: payload([fixture()]), current: null, live: null });
    expect(out?.phase).toBe('live');
    expect(out?.score).toBeNull();
    expect(out?.minute).toBeNull();
  });

  it('falls back to idle after the live window when no result ever arrives', () => {
    const out = planMatchLive({ nowMs: KO + 4 * H, fixtures: payload([fixture()]), current: null, live: null });
    expect(out?.phase).toBe('idle');
  });

  it('never touches a locked payload', () => {
    const current = { phase: 'live', matchId: 'x', kickoffUtc: 'y', opponent: 'z', score: null, minute: null, events: [], lock: true } as MatchLivePayload;
    expect(planMatchLive({ nowMs: KO, fixtures: payload([fixture()]), current, live: null })).toBeNull();
  });
});

describe('planMatchLive — provider-driven live window', () => {
  const live = {
    fixtureId: 'cs-mci-2026-08-16',
    phase: 'live' as const,
    score: { home: 2, away: 1 },
    minute: 67,
    events: [{ min: 12, type: 'goal' as const, player: 'Saka', ours: true }],
  };

  it('carries provider score, minute, and events', () => {
    const out = planMatchLive({ nowMs: KO + 67 * M, fixtures: payload([fixture()]), current: null, live });
    expect(out?.phase).toBe('live');
    expect(out?.score).toEqual({ home: 2, away: 1 });
    expect(out?.minute).toBe(67);
    expect(out?.events).toHaveLength(1);
  });

  it('maps half-time and full-time phases', () => {
    const ht = planMatchLive({ nowMs: KO + 50 * M, fixtures: payload([fixture()]), current: null, live: { ...live, phase: 'ht' } });
    expect(ht?.phase).toBe('ht');

    const ft = planMatchLive({ nowMs: KO + 110 * M, fixtures: payload([fixture()]), current: null, live: { ...live, phase: 'ft' } });
    expect(ft?.phase).toBe('ft');
    expect(ft?.lastResult).toMatchObject({ matchId: 'cs-mci-2026-08-16', score: { home: 2, away: 1 } });
  });

  it('holds ft on the Now surface, then returns to idle for the next fixture', () => {
    const finished = fixture({ status: 'ft', score: { home: 2, away: 1 } });
    const nextUp = fixture({ id: 'pl-ful-2026-08-22', kickoffUtc: '2026-08-22T14:00:00Z', opponent: 'Fulham', opponentShort: 'FUL', venue: 'H', status: 'scheduled', score: null });

    const held = planMatchLive({ nowMs: KO + 12 * H, fixtures: payload([finished, nextUp]), current: null, live: null });
    expect(held?.phase).toBe('ft');
    expect(held?.matchId).toBe('cs-mci-2026-08-16');

    const after = planMatchLive({ nowMs: KO + FT_HOLD_MS + H, fixtures: payload([finished, nextUp]), current: null, live: null });
    expect(after?.phase).toBe('idle');
    expect(after?.matchId).toBe('pl-ful-2026-08-22');
    expect(after?.lastResult).toMatchObject({ matchId: 'cs-mci-2026-08-16' });
  });
});

describe('mergeFixtures', () => {
  it('provider owns facts, manual owns editorial, manual-only fixtures survive', () => {
    const manual = payload([
      fixture({ tv: 'TNT Sports', difficulty: 'hard' }),
      fixture({ id: 'cs-extra-2026-08-01', kickoffUtc: '2026-08-01T14:00:00Z', opponent: 'Friendly XI', comp: 'Friendly' }),
    ]);
    const provided = [
      fixture({ kickoffUtc: '2026-08-16T16:30:00Z', status: 'scheduled', tv: null, difficulty: undefined, ground: null }),
      fixture({ id: 'pl-ful-2026-08-22', kickoffUtc: '2026-08-22T14:00:00Z', opponent: 'Fulham', difficulty: undefined }),
    ];
    const merged = mergeFixtures(manual, provided);
    const shield = merged.fixtures.find((f) => f.id === 'cs-mci-2026-08-16');
    expect(shield?.kickoffUtc).toBe('2026-08-16T16:30:00Z'); // provider fact wins
    expect(shield?.tv).toBe('TNT Sports'); // manual editorial wins
    expect(shield?.ground).toBe('Principality Stadium, Cardiff');
    expect(merged.fixtures.some((f) => f.id === 'cs-extra-2026-08-01')).toBe(true); // manual-only kept
    expect(merged.fixtures.find((f) => f.id === 'pl-ful-2026-08-22')?.difficulty).toBe('mid'); // default
    // sorted by kickoff
    expect(merged.fixtures[0].id).toBe('cs-extra-2026-08-01');
  });
});

describe('football-data.org mappers', () => {
  const fdMatch = {
    id: 12345,
    utcDate: '2026-08-16T14:00:00Z',
    status: 'IN_PLAY',
    minute: 67,
    competition: { name: 'Community Shield' },
    homeTeam: { id: 65, name: 'Manchester City FC', shortName: 'Man City', tla: 'MCI' },
    awayTeam: { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS' },
    score: { fullTime: { home: 1, away: 2 } },
    goals: [
      { minute: 12, team: { id: 57 }, scorer: { name: 'Bukayo Saka' }, type: 'REGULAR' },
      { minute: 40, team: { id: 65 }, scorer: { name: 'Erling Haaland' }, type: 'REGULAR' },
    ],
  };

  it('maps an away match from Arsenal POV (score flipped, venue A)', () => {
    const f = mapMatchToFixture(fdMatch);
    expect(f.venue).toBe('A');
    expect(f.opponent).toBe('Man City');
    expect(f.score).toEqual({ home: 2, away: 1 }); // Arsenal first
    expect(f.status).toBe('live');
    expect(f.id).toBe(cannonFixtureId('Community Shield', 'Man City', '2026-08-16T14:00:00Z'));
  });

  it('maps live state with our-goal attribution and PAUSED → ht', () => {
    const live = mapMatchToLive(fdMatch);
    expect(live.phase).toBe('live');
    expect(live.minute).toBe(67);
    expect(live.events[0]).toMatchObject({ min: 12, type: 'goal', player: 'Bukayo Saka', ours: true });
    expect(live.events[1].ours).toBe(false);
    expect(mapMatchToLive({ ...fdMatch, status: 'PAUSED' }).phase).toBe('ht');
  });
});

describe('cannonIngest orchestration', () => {
  /** Minimal D1 fake — the statements store.ts issues. */
  function fakeDb(rows: Map<string, Record<string, unknown>>) {
    return {
      prepare(sql: string) {
        let args: unknown[] = [];
        const stmt = {
          bind(...a: unknown[]) { args = a; return stmt; },
          async first() {
            if (sql.includes('SELECT * FROM app_feeds WHERE app_slug')) {
              for (const r of rows.values()) if (r.app_slug === args[0] && r.feed_id === args[1]) return r;
              return null;
            }
            if (sql.includes('SELECT sequence, hash')) {
              const r = rows.get(String(args[0]));
              return r ? { sequence: r.sequence, hash: r.hash } : null;
            }
            return null;
          },
          async run() {
            const keys = ['id', 'app_slug', 'feed_id', 'data_schema', 'sequence', 'updated_at', 'stale_after', 'hash', 'source_kind', 'source_name', 'payload', 'created_at'];
            const row: Record<string, unknown> = {};
            keys.forEach((k, i) => (row[k] = args[i]));
            rows.set(String(row.id), row);
            return { success: true };
          },
        };
        return stmt;
      },
    } as never;
  }

  function seedRows(nowMs: number, fixtures: FixturesPayload): Map<string, Record<string, unknown>> {
    const rows = new Map<string, Record<string, unknown>>();
    rows.set('cannon:fixtures', {
      id: 'cannon:fixtures', app_slug: 'cannon', feed_id: 'fixtures', data_schema: 'cannon.fixtures.v1',
      sequence: 1, updated_at: new Date(nowMs - 10 * M).toISOString(), stale_after: null,
      hash: 'fnv1a:00000000', source_kind: 'manual', source_name: 'seed', payload: JSON.stringify(fixtures), created_at: nowMs,
    });
    return rows;
  }

  it('publishes a pre-phase snapshot inside the window without any provider', async () => {
    const nowMs = KO - 2 * H;
    const rows = seedRows(nowMs, payload([fixture()]));
    const res = await cannonIngest({ DB: fakeDb(rows), CACHE: {} as never }, { provider: null, nowMs });
    expect(res.matchPublished).toBe(true);
    const live = rows.get('cannon:match-live');
    expect(live).toBeDefined();
    expect(JSON.parse(String(live!.payload)).phase).toBe('pre');
    expect(live!.source_name).toBe('schedule-machine');
  });

  it('uses the provider during the live window and stamps external-api provenance', async () => {
    const nowMs = KO + 30 * M;
    const rows = seedRows(nowMs, payload([fixture()]));
    const provider: FootballDataProvider = {
      name: 'fake-provider',
      fixtures: async () => null,
      liveMatch: async () => ({
        fixtureId: 'cs-mci-2026-08-16', phase: 'live', score: { home: 1, away: 0 }, minute: 31, events: [],
      }),
    };
    const res = await cannonIngest({ DB: fakeDb(rows), CACHE: {} as never }, { provider, nowMs });
    expect(res.matchPublished).toBe(true);
    const live = rows.get('cannon:match-live')!;
    expect(live.source_kind).toBe('external-api');
    const body = JSON.parse(String(live.payload));
    expect(body.score).toEqual({ home: 1, away: 0 });
    expect(body.minute).toBe(31);
  });

  it('re-running with identical state publishes nothing new (idempotent)', async () => {
    const nowMs = KO - 2 * H;
    const rows = seedRows(nowMs, payload([fixture()]));
    await cannonIngest({ DB: fakeDb(rows), CACHE: {} as never }, { provider: null, nowMs });
    const second = await cannonIngest({ DB: fakeDb(rows), CACHE: {} as never }, { provider: null, nowMs: nowMs + M });
    expect(second.matchPublished).toBe(false);
  });
});
