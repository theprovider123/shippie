import { describe, expect, test } from 'bun:test';
import type { RouteBanterPoll } from '../data/parade-2026';
import {
  mergeLocalVoteIntoAggregate,
  pullBanterPulse,
  selectBanterPulseVotes,
  voteToBanterPulsePacket,
} from './banter-sync';

const polls: RouteBanterPoll[] = [
  {
    id: 'player-of-season',
    question: 'Player',
    options: [
      { id: 'raya', label: 'Raya' },
      { id: 'gabriel', label: 'Gabriel' },
    ],
  },
];

describe('banter-sync', () => {
  test('only exports fixed poll choices with a source id', () => {
    expect(
      voteToBanterPulsePacket(
        {
          pollId: 'player-of-season',
          optionId: 'raya',
          sourceId: 'fan_123',
          updatedAt: '2026-05-31T13:00:00.000Z',
        },
        polls,
      ),
    ).toMatchObject({ pollId: 'player-of-season', optionId: 'raya', sourceId: 'fan_123' });

    expect(
      voteToBanterPulsePacket(
        {
          pollId: 'player-of-season',
          optionId: 'abuse-write-in',
          sourceId: 'fan_123',
          updatedAt: '2026-05-31T13:00:00.000Z',
        },
        polls,
      ),
    ).toBeNull();
  });

  test('selects the latest vote per poll', () => {
    const votes = selectBanterPulseVotes(
      [
        { pollId: 'player-of-season', optionId: 'raya', sourceId: 'fan_123', updatedAt: '2026-05-31T13:00:00.000Z' },
        { pollId: 'player-of-season', optionId: 'gabriel', sourceId: 'fan_123', updatedAt: '2026-05-31T13:01:00.000Z' },
      ],
      polls,
    );
    expect(votes).toHaveLength(1);
    expect(votes[0]?.optionId).toBe('gabriel');
  });

  test('filters unknown aggregate options from the relay', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          aggregates: [
            {
              pollId: 'player-of-season',
              total: 999,
              options: { raya: 3, spam: 999 },
              updatedAt: '2026-05-31T13:01:00.000Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch;

    const aggregates = await pullBanterPulse(polls, '/pulse', fetchImpl);
    expect(aggregates[0]).toMatchObject({ total: 3, options: { raya: 3 } });
  });

  test('shows the local pick while the relay is still empty', () => {
    expect(mergeLocalVoteIntoAggregate(polls[0]!, null, 'gabriel')).toMatchObject({
      total: 1,
      options: { gabriel: 1 },
    });
  });
});
