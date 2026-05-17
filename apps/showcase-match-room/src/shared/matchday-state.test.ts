import { describe, expect, test } from 'bun:test';
import { cleanShoutoutText, computeScoreTally, emptyArchiveState, normaliseScore, reduceMatchRoomArchive } from './matchday-state.ts';
import type { FantasyTeamSaved, ScorePoll, ScoreVote } from './types.ts';

const poll: ScorePoll = {
  id: 'score-1',
  question: 'Predict',
  homeLabel: 'Home',
  awayLabel: 'Away',
  closesAt: 1_000,
  createdAt: 1,
  organiserId: 'host',
};

describe('score prediction tally', () => {
  test('keeps the latest vote per voter and rolls up score keys', () => {
    const votes: ScoreVote[] = [
      { pollId: 'score-1', voterId: 'a', home: 2, away: 1, ts: 10 },
      { pollId: 'score-1', voterId: 'a', home: 3, away: 1, ts: 20 },
      { pollId: 'score-1', voterId: 'b', home: 3, away: 1, ts: 30 },
      { pollId: 'score-1', voterId: 'c', home: 1, away: 1, ts: 40 },
      { pollId: 'other', voterId: 'd', home: 9, away: 9, ts: 50 },
      { pollId: 'score-1', voterId: 'e', home: 4, away: 4, ts: 2_000 },
    ];

    expect(computeScoreTally(poll, votes)).toEqual({
      pollId: 'score-1',
      totalVotes: 3,
      leaders: [
        { score: '3-1', count: 2 },
        { score: '1-1', count: 1 },
      ],
      updatedAt: 40,
    });
  });
});

describe('match-room validation', () => {
  test('normalises bounded football scores', () => {
    expect(normaliseScore(0, 2)).toEqual({ home: 0, away: 2 });
    expect(normaliseScore(13, 0)).toBeNull();
    expect(normaliseScore(2.5, 0)).toBeNull();
  });

  test('cleans shoutout text', () => {
    expect(cleanShoutoutText('  North   Bank  ')).toBe('North Bank');
    expect(cleanShoutoutText('x')).toBeNull();
    expect(cleanShoutoutText('a'.repeat(91))).toBeNull();
  });
});

describe('match-room document reducer', () => {
  test('rebuilds durable fantasy and score state from room events', () => {
    const team: FantasyTeamSaved = {
      id: 'fantasy-team-1',
      managerId: 'peer-1',
      managerName: 'North Stand',
      squad: {
        playerIds: [],
        startingIds: [],
        benchIds: [],
        captainId: null,
        viceCaptainId: null,
        bank: 0,
      },
      freeTransfers: 1,
      chipsUsed: { group: [], knockout: [] },
      points: 0,
      updatedAt: 10,
    };

    const state = [
      { kind: 'score-open' as const, poll },
      { kind: 'score-vote' as const, vote: { pollId: poll.id, voterId: 'peer-1', home: 2, away: 1, ts: 20 } },
      { kind: 'fantasy-team-save' as const, team },
      { kind: 'fantasy-chip-play' as const, teamId: team.id, chip: 'bench-boost' as const, phase: 'group' as const, ts: 30 },
    ].reduce(reduceMatchRoomArchive, emptyArchiveState());

    expect(state.scorePolls.map((item) => item.id)).toEqual(['score-1']);
    expect(state.scoreVotes.map((item) => `${item.home}-${item.away}`)).toEqual(['2-1']);
    expect(state.fantasyTeams[0]?.chipsUsed.group).toEqual(['bench-boost']);
  });
});
