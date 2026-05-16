export type ScoreProvenance = 'provider-delayed' | 'provider-live' | 'manual-ready' | 'unavailable';
export type MatchStatus = 'scheduled' | 'live' | 'paused' | 'finished' | 'unknown';

export interface LiveScore {
  id: string;
  status: MatchStatus;
  scoreHome: number | null;
  scoreAway: number | null;
  minute: number | null;
  updatedAt: string;
  provenance: ScoreProvenance;
  source: string;
}

interface TodayScoresResponse {
  scores?: LiveScore[];
}

type ScoreFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function loadTodayScores(fetchImpl: ScoreFetch = fetch): Promise<LiveScore[]> {
  try {
    const response = await fetchImpl('/api/match-room/scores/today');
    if (!response.ok) return [fallbackLiveScore()];
    const body = (await response.json()) as TodayScoresResponse;
    return Array.isArray(body.scores) && body.scores.length > 0 ? body.scores : [fallbackLiveScore()];
  } catch {
    return [fallbackLiveScore()];
  }
}

export function fallbackLiveScore(): LiveScore {
  return {
    id: 'match-001',
    status: 'scheduled',
    scoreHome: null,
    scoreAway: null,
    minute: null,
    updatedAt: new Date().toISOString(),
    provenance: 'manual-ready',
    source: 'room-confirmation',
  };
}

export function provenanceLabel(provenance: ScoreProvenance): string {
  switch (provenance) {
    case 'provider-live':
      return 'Live feed';
    case 'provider-delayed':
      return 'Delayed feed';
    case 'manual-ready':
      return 'Awaiting kickoff';
    case 'unavailable':
      return 'Unavailable';
  }
}
