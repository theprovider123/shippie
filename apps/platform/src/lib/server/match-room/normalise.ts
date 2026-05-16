export type MatchRoomScoreProvenance = 'provider-delayed' | 'provider-live' | 'manual-ready' | 'unavailable';
export type MatchRoomStatus = 'scheduled' | 'live' | 'paused' | 'finished' | 'unknown';

export interface MatchRoomScore {
  id: string;
  status: MatchRoomStatus;
  scoreHome: number | null;
  scoreAway: number | null;
  minute: number | null;
  updatedAt: string;
  provenance: MatchRoomScoreProvenance;
  source: string;
}

interface FootballDataMatch {
  id?: number | string;
  utcDate?: string;
  status?: string;
  minute?: number;
  score?: {
    fullTime?: { home?: number | null; away?: number | null };
    regularTime?: { home?: number | null; away?: number | null };
    halfTime?: { home?: number | null; away?: number | null };
  };
}

export function fallbackScore(id = 'match-001'): MatchRoomScore {
  return {
    id,
    status: 'scheduled',
    scoreHome: null,
    scoreAway: null,
    minute: null,
    updatedAt: new Date().toISOString(),
    provenance: 'manual-ready',
    source: 'static-fixture',
  };
}

export function normaliseFootballDataMatch(match: FootballDataMatch, idPrefix = 'provider'): MatchRoomScore {
  const score = match.score?.fullTime ?? match.score?.regularTime ?? match.score?.halfTime ?? {};
  return {
    id: match.id ? `${idPrefix}-${match.id}` : `${idPrefix}-unknown`,
    status: normaliseStatus(match.status),
    scoreHome: typeof score.home === 'number' ? score.home : null,
    scoreAway: typeof score.away === 'number' ? score.away : null,
    minute: typeof match.minute === 'number' ? match.minute : null,
    updatedAt: new Date().toISOString(),
    provenance: match.status === 'IN_PLAY' ? 'provider-live' : 'provider-delayed',
    source: 'football-data.org',
  };
}

export function normaliseStatus(status: string | undefined): MatchRoomStatus {
  switch (status) {
    case 'SCHEDULED':
    case 'TIMED':
      return 'scheduled';
    case 'IN_PLAY':
      return 'live';
    case 'PAUSED':
      return 'paused';
    case 'FINISHED':
      return 'finished';
    default:
      return 'unknown';
  }
}
