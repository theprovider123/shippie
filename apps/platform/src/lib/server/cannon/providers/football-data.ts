/**
 * football-data.org (v4) provider — the default free-tier source.
 * Arsenal team id 57; ~10 req/min allowance is comfortably inside the
 * 5-minute ingest cadence. Everything provider-specific stays in this file;
 * `fetchImpl` is injected so tests never touch the network.
 */
import type {
  CannonFixture,
  CannonMatchEvent,
  CannonScore,
  FootballDataProvider,
  ProviderMatchState,
} from './types';

const BASE = 'https://api.football-data.org/v4';
const ARSENAL_ID = 57;

interface FdTeam {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
}

interface FdMatch {
  id: number;
  utcDate: string;
  status: string; // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | POSTPONED | SUSPENDED | CANCELLED
  minute?: number | null;
  competition?: { name?: string };
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score?: {
    fullTime?: { home: number | null; away: number | null };
    halfTime?: { home: number | null; away: number | null };
  };
  goals?: Array<{
    minute: number;
    team: { id: number };
    scorer?: { name?: string };
    type?: string; // REGULAR | OWN | PENALTY
  }>;
}

function fixtureStatus(s: string): CannonFixture['status'] {
  if (s === 'IN_PLAY' || s === 'PAUSED') return 'live';
  if (s === 'FINISHED') return 'ft';
  if (s === 'POSTPONED' || s === 'SUSPENDED' || s === 'CANCELLED') return 'postponed';
  return 'scheduled';
}

function compSlug(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('premier')) return 'pl';
  if (n.includes('champions')) return 'ucl';
  if (n.includes('fa cup')) return 'fac';
  if (n.includes('efl') || n.includes('carabao') || n.includes('league cup')) return 'eflc';
  if (n.includes('shield')) return 'cs';
  return n.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 8) || 'cup';
}

function oppSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16);
}

/** Deterministic cannon fixture id — stable across refreshes and providers. */
export function cannonFixtureId(comp: string, opponent: string, kickoffUtc: string): string {
  return `${compSlug(comp)}-${oppSlug(opponent)}-${kickoffUtc.slice(0, 10)}`;
}

function arsenalScore(m: FdMatch, home: boolean): CannonScore | null {
  const ft = m.score?.fullTime;
  if (!ft || ft.home == null || ft.away == null) return null;
  return home ? { home: ft.home, away: ft.away } : { home: ft.away, away: ft.home };
}

export function mapMatchToFixture(m: FdMatch): CannonFixture {
  const home = m.homeTeam.id === ARSENAL_ID;
  const opp = home ? m.awayTeam : m.homeTeam;
  const oppName = opp.shortName || opp.name;
  const comp = m.competition?.name ?? 'Cup';
  return {
    id: cannonFixtureId(comp, oppName, m.utcDate),
    kickoffUtc: m.utcDate,
    comp,
    opponent: oppName,
    opponentShort: (opp.tla || oppName.slice(0, 3)).toUpperCase(),
    venue: home ? 'H' : 'A',
    ground: null,
    tv: null,
    status: fixtureStatus(m.status),
    score: arsenalScore(m, home),
  };
}

export function mapMatchToLive(m: FdMatch): ProviderMatchState {
  const home = m.homeTeam.id === ARSENAL_ID;
  const opp = home ? m.awayTeam : m.homeTeam;
  const phase =
    m.status === 'PAUSED' ? 'ht' :
    m.status === 'IN_PLAY' ? 'live' :
    m.status === 'FINISHED' ? 'ft' : 'pre';
  const events: CannonMatchEvent[] = (m.goals ?? []).map((g) => ({
    min: g.minute,
    type: g.type === 'OWN' ? 'own-goal' : g.type === 'PENALTY' ? 'pen' : 'goal',
    player: g.scorer?.name,
    ours: g.team.id === ARSENAL_ID || (g.type === 'OWN' && g.team.id !== ARSENAL_ID),
  }));
  return {
    fixtureId: cannonFixtureId(m.competition?.name ?? 'Cup', opp.shortName || opp.name, m.utcDate),
    phase,
    score: arsenalScore(m, home),
    minute: typeof m.minute === 'number' ? m.minute : null,
    events,
  };
}

export function createFootballDataProvider(opts: {
  token: string;
  fetchImpl?: typeof fetch;
}): FootballDataProvider {
  const doFetch = opts.fetchImpl ?? fetch;
  const headers = { 'X-Auth-Token': opts.token };

  /** football-data match ids keyed by our fixture id, learned on each fixtures() call. */
  const externalIds = new Map<string, number>();

  return {
    name: 'football-data.org',

    async fixtures(): Promise<CannonFixture[] | null> {
      try {
        const res = await doFetch(`${BASE}/teams/${ARSENAL_ID}/matches?limit=200`, { headers });
        if (!res.ok) return null;
        const body = (await res.json()) as { matches?: FdMatch[] };
        if (!Array.isArray(body.matches)) return null;
        const fixtures = body.matches.map(mapMatchToFixture);
        body.matches.forEach((m, i) => externalIds.set(fixtures[i].id, m.id));
        return fixtures;
      } catch {
        return null;
      }
    },

    async liveMatch(fixture): Promise<ProviderMatchState | null> {
      const externalId = externalIds.get(fixture.id);
      if (externalId == null) {
        // Cold cache (fresh worker isolate) — refresh the id map first.
        const got = await this.fixtures();
        if (!got) return null;
      }
      const id = externalIds.get(fixture.id);
      if (id == null) return null;
      try {
        const res = await doFetch(`${BASE}/matches/${id}`, { headers });
        if (!res.ok) return null;
        const body = (await res.json()) as { match?: FdMatch } & FdMatch;
        const match = body.match ?? body;
        if (!match?.homeTeam) return null;
        return mapMatchToLive(match);
      } catch {
        return null;
      }
    },
  };
}
