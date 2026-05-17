import { normaliseFootballDataMatch, type MatchRoomScore } from './normalise';

interface FetchMatchesOptions {
  token: string;
  fetchImpl?: typeof fetch;
  dateFrom: string;
  dateTo: string;
}

interface FootballDataMatchesResponse {
  matches?: unknown[];
}

export async function fetchFootballDataMatches(opts: FetchMatchesOptions): Promise<MatchRoomScore[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = new URL('https://api.football-data.org/v4/competitions/WC/matches');
  url.searchParams.set('dateFrom', opts.dateFrom);
  url.searchParams.set('dateTo', opts.dateTo);
  const response = await fetchImpl(url, {
    headers: { 'X-Auth-Token': opts.token },
  });
  if (!response.ok) {
    throw new Error(`football-data request failed: ${response.status}`);
  }
  const body = (await response.json()) as FootballDataMatchesResponse;
  const matches = Array.isArray(body.matches) ? body.matches : [];
  return matches.map((match) => normaliseFootballDataMatch(match as Parameters<typeof normaliseFootballDataMatch>[0]));
}
