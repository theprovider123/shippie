/**
 * Football data provider abstraction for The Cannon's ingest cron.
 *
 * A provider normalises an external API into the cannon feed shapes — the
 * ingest pipeline never sees provider-specific JSON. Manual mode (no provider
 * configured) is first-class: the publish script and admin edits write the
 * same feeds, and the planner still runs the schedule-derived phase machine.
 */

export type CannonPhase = 'idle' | 'pre' | 'live' | 'ht' | 'ft';
export type FixtureStatus = 'scheduled' | 'live' | 'ft' | 'postponed';

export interface CannonScore {
  home: number;
  away: number;
}

export interface CannonMatchEvent {
  min: number;
  type: 'goal' | 'own-goal' | 'pen' | 'red' | 'yellow' | 'sub' | 'var' | 'note';
  player?: string;
  /** true when the event belongs to Arsenal, false for the opposition. */
  ours?: boolean;
  detail?: string;
}

export interface CannonFixture {
  /** Slug-shaped, stable across refreshes: `<comp>-<opp>-<yyyy-mm-dd>`. */
  id: string;
  kickoffUtc: string;
  comp: string;
  opponent: string;
  opponentShort: string;
  venue: 'H' | 'A' | 'N';
  ground?: string | null;
  tv?: string | null;
  status: FixtureStatus;
  score?: CannonScore | null;
  difficulty?: 'hard' | 'mid' | 'winnable';
}

/** Live snapshot of one match, already normalised to cannon vocabulary. */
export interface ProviderMatchState {
  fixtureId: string;
  phase: Extract<CannonPhase, 'pre' | 'live' | 'ht' | 'ft'>;
  score: CannonScore | null;
  minute: number | null;
  events: CannonMatchEvent[];
}

export interface FootballDataProvider {
  /** Short name recorded as feed provenance (`source.name`). */
  name: string;
  /** Full season fixture list, or null when the upstream call fails. */
  fixtures(): Promise<CannonFixture[] | null>;
  /** Live state for one fixture, or null when unavailable/failed. */
  liveMatch(fixture: CannonFixture): Promise<ProviderMatchState | null>;
}
