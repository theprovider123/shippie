import type { PollMessage } from '@shippie/proximity';
import type { FantasyTeamSaved, MatchRoomArchiveState, MatchdayPayload, ScorePoll, ScoreTally, ScoreVote, Shoutout } from './types.ts';

export function normaliseScore(home: number, away: number): { home: number; away: number } | null {
  if (!Number.isInteger(home) || !Number.isInteger(away)) return null;
  if (home < 0 || away < 0 || home > 12 || away > 12) return null;
  return { home, away };
}

export function computeScoreTally(poll: ScorePoll, votes: Iterable<ScoreVote>): ScoreTally {
  const byVoter = new Map<string, ScoreVote>();
  for (const vote of votes) {
    if (vote.pollId !== poll.id) continue;
    if (vote.ts > poll.closesAt) continue;
    if (!normaliseScore(vote.home, vote.away)) continue;
    const existing = byVoter.get(vote.voterId);
    if (!existing || existing.ts < vote.ts) byVoter.set(vote.voterId, vote);
  }

  const histogram = new Map<string, { score: string; count: number; latest: number }>();
  let updatedAt = 0;
  for (const vote of byVoter.values()) {
    const score = `${vote.home}-${vote.away}`;
    const existing = histogram.get(score) ?? { score, count: 0, latest: 0 };
    existing.count += 1;
    existing.latest = Math.max(existing.latest, vote.ts);
    histogram.set(score, existing);
    updatedAt = Math.max(updatedAt, vote.ts);
  }

  const leaders = [...histogram.values()]
    .sort((a, b) => b.count - a.count || a.score.localeCompare(b.score))
    .slice(0, 5)
    .map(({ score, count }) => ({ score, count }));

  return { pollId: poll.id, totalVotes: byVoter.size, leaders, updatedAt };
}

export function cleanShoutoutText(value: string): string | null {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length < 2 || text.length > 90) return null;
  return text;
}

export function sortedShoutouts(items: Iterable<Shoutout>): Shoutout[] {
  return [...items].sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
}

export function emptyArchiveState(): MatchRoomArchiveState {
  return {
    crowdMessages: [],
    scorePolls: [],
    scoreVotes: [],
    pendingShoutouts: [],
    approvedShoutoutIds: [],
    fantasyTeams: [],
    legacySnapshots: [],
  };
}

export function reduceMatchRoomArchive(
  state: MatchRoomArchiveState,
  payload: MatchdayPayload,
): MatchRoomArchiveState {
  if (payload.kind === 'crowd') {
    return { ...state, crowdMessages: upsertBy(crowdMessageKey(payload.message), payload.message, state.crowdMessages) };
  }
  if (payload.kind === 'score-open') {
    return { ...state, scorePolls: upsertBy(payload.poll.id, payload.poll, state.scorePolls) };
  }
  if (payload.kind === 'score-vote') {
    return { ...state, scoreVotes: upsertLatest(`${payload.vote.pollId}:${payload.vote.voterId}`, payload.vote, state.scoreVotes) };
  }
  if (payload.kind === 'score-close') {
    return {
      ...state,
      scorePolls: state.scorePolls.map((poll) => (
        poll.id === payload.pollId ? { ...poll, closesAt: Math.min(poll.closesAt, payload.ts) } : poll
      )),
    };
  }
  if (payload.kind === 'shoutout-pending') {
    return { ...state, pendingShoutouts: upsertBy(payload.shoutout.id, payload.shoutout, state.pendingShoutouts) };
  }
  if (payload.kind === 'shoutout-approved') {
    return state.approvedShoutoutIds.includes(payload.shoutoutId)
      ? state
      : { ...state, approvedShoutoutIds: [...state.approvedShoutoutIds, payload.shoutoutId] };
  }
  if (payload.kind === 'fantasy-team-save') {
    return { ...state, fantasyTeams: upsertFantasyTeam(payload.team, state.fantasyTeams) };
  }
  if (payload.kind === 'fantasy-chip-play') {
    return {
      ...state,
      fantasyTeams: state.fantasyTeams.map((team) => {
        if (team.id !== payload.teamId) return team;
        const used = team.chipsUsed[payload.phase] ?? [];
        if (used.includes(payload.chip)) return team;
        return {
          ...team,
          chipsUsed: { ...team.chipsUsed, [payload.phase]: [...used, payload.chip] },
          updatedAt: payload.ts,
        };
      }),
    };
  }
  if (payload.kind === 'legacy-local-snapshot') {
    return {
      ...state,
      legacySnapshots: upsertBy(payload.snapshot.roomId, payload.snapshot, state.legacySnapshots, (snapshot) => snapshot.roomId),
    };
  }
  return state;
}

function crowdMessageKey(message: PollMessage): string {
  if (message.kind === 'poll-open') return `open:${message.poll.id}`;
  if (message.kind === 'poll-close') return `close:${message.pollId}`;
  return `vote:${message.vote.pollId}:${message.vote.voterId}`;
}

function upsertBy<T>(id: string, item: T, items: readonly T[], key: (item: T) => string = defaultId): T[] {
  const index = items.findIndex((current) => key(current) === id);
  if (index < 0) return [...items, item];
  return items.map((current, currentIndex) => currentIndex === index ? item : current);
}

function upsertLatest<T extends { ts: number }>(id: string, item: T, items: readonly T[]): T[] {
  const index = items.findIndex((current) => defaultVoteId(current) === id);
  if (index < 0) return [...items, item];
  return items.map((current, currentIndex) => currentIndex === index && current.ts < item.ts ? item : current);
}

function upsertFantasyTeam(team: FantasyTeamSaved, teams: readonly FantasyTeamSaved[]): FantasyTeamSaved[] {
  const index = teams.findIndex((item) => item.id === team.id);
  if (index < 0) return [...teams, team];
  return teams.map((item, itemIndex) => itemIndex === index && item.updatedAt <= team.updatedAt ? team : item);
}

function defaultId<T>(item: T): string {
  return typeof item === 'object' && item !== null && 'id' in item ? String((item as { id: unknown }).id) : '';
}

function defaultVoteId<T>(item: T): string {
  return typeof item === 'object' && item !== null && 'pollId' in item && 'voterId' in item
    ? `${String((item as { pollId: unknown }).pollId)}:${String((item as { voterId: unknown }).voterId)}`
    : defaultId(item);
}
