import { describe, expect, test } from 'bun:test';
import { createCrowdPoll, type PollMessage } from './crowd-poll.ts';
import { createGossipNode } from './gossip.ts';

function fakeNow(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function harness() {
  const clock = fakeNow();
  const gossip = createGossipNode<PollMessage>('self', { rng: () => 0.5 });
  const poll = createCrowdPoll({
    selfPeerId: 'self',
    gossip,
    peers: () => [],
    now: clock.now,
  });
  return { clock, gossip, poll };
}

describe('createCrowdPoll — opening + voting (choice)', () => {
  test('open poll lands in polls() and starts an empty tally', async () => {
    const { clock, poll } = harness();
    await poll.openPoll({
      id: 'p1',
      kind: 'choice',
      question: 'Which song next?',
      options: ['A', 'B', 'C'],
      organiserId: 'self',
      closesAt: clock.now() + 60_000,
    });
    const tally = poll.tallies()[0]!;
    expect(tally.totalVotes).toBe(0);
    expect(tally.perBucket).toEqual([0, 0, 0]);
  });

  test('vote increments the right bucket', async () => {
    const { clock, poll } = harness();
    await poll.openPoll({
      id: 'p1',
      kind: 'choice',
      question: 'q',
      options: ['A', 'B', 'C'],
      organiserId: 'self',
      closesAt: clock.now() + 60_000,
    });
    await poll.vote('p1', 'voter-1', 1);
    await poll.vote('p1', 'voter-2', 1);
    await poll.vote('p1', 'voter-3', 0);
    const tally = poll.tallies()[0]!;
    expect(tally.totalVotes).toBe(3);
    expect(tally.perBucket).toEqual([1, 2, 0]);
  });

  test('voter can change their mind (last-write-wins by ts)', async () => {
    const { clock, poll } = harness();
    await poll.openPoll({
      id: 'p1',
      kind: 'choice',
      question: 'q',
      options: ['A', 'B'],
      organiserId: 'self',
      closesAt: clock.now() + 60_000,
    });
    await poll.vote('p1', 'voter-1', 0);
    clock.advance(100);
    await poll.vote('p1', 'voter-1', 1);
    expect(poll.tallies()[0]!.perBucket).toEqual([0, 1]);
  });

  test('out-of-bounds option index is rejected', async () => {
    const { clock, poll } = harness();
    await poll.openPoll({
      id: 'p1',
      kind: 'choice',
      question: 'q',
      options: ['A', 'B'],
      organiserId: 'self',
      closesAt: clock.now() + 60_000,
    });
    expect(await poll.vote('p1', 'voter-1', 5)).toBeNull();
    expect(poll.tallies()[0]!.totalVotes).toBe(0);
  });

  test('vote after closesAt is rejected', async () => {
    const { clock, poll } = harness();
    await poll.openPoll({
      id: 'p1',
      kind: 'choice',
      question: 'q',
      options: ['A'],
      organiserId: 'self',
      closesAt: clock.now() + 1000,
    });
    clock.advance(2000);
    expect(await poll.vote('p1', 'voter-1', 0)).toBeNull();
  });
});

describe('createCrowdPoll — rating polls', () => {
  test('rating tally computes mean across votes', async () => {
    const { clock, poll } = harness();
    await poll.openPoll({
      id: 'r1',
      kind: 'rating',
      question: 'How was the talk?',
      options: [],
      organiserId: 'self',
      closesAt: clock.now() + 60_000,
    });
    await poll.vote('r1', 'a', 5);
    await poll.vote('r1', 'b', 3);
    await poll.vote('r1', 'c', 4);
    const tally = poll.tallies()[0]!;
    expect(tally.totalVotes).toBe(3);
    expect(Math.abs((tally.mean ?? 0) - 4)).toBeLessThan(0.001);
    expect(tally.perBucket[2]).toBe(1); // score 3 → bucket index 2
    expect(tally.perBucket[3]).toBe(1); // score 4 → bucket index 3
    expect(tally.perBucket[4]).toBe(1); // score 5 → bucket index 4
  });

  test('rejects rating values outside 1..5', async () => {
    const { clock, poll } = harness();
    await poll.openPoll({
      id: 'r1',
      kind: 'rating',
      question: 'q',
      options: [],
      organiserId: 'self',
      closesAt: clock.now() + 60_000,
    });
    expect(await poll.vote('r1', 'a', 0)).toBeNull();
    expect(await poll.vote('r1', 'a', 6)).toBeNull();
    expect(poll.tallies()[0]!.totalVotes).toBe(0);
  });
});

describe('createCrowdPoll — receive (gossiped messages)', () => {
  test('poll-open from a peer is registered', () => {
    const { clock, poll } = harness();
    poll.receive(
      {
        kind: 'poll-open',
        poll: {
          id: 'p2',
          kind: 'choice',
          question: 'External',
          options: ['x'],
          organiserId: 'peer-b',
          createdAt: clock.now(),
          closesAt: clock.now() + 60_000,
        },
      },
      'peer-b',
    );
    expect(poll.polls()).toHaveLength(1);
  });

  test('poll-vote from a peer updates the tally', () => {
    const { clock, poll } = harness();
    poll.receive(
      {
        kind: 'poll-open',
        poll: {
          id: 'p3',
          kind: 'choice',
          question: 'q',
          options: ['A', 'B'],
          organiserId: 'peer-b',
          createdAt: clock.now(),
          closesAt: clock.now() + 60_000,
        },
      },
      'peer-b',
    );
    poll.receive(
      {
        kind: 'poll-vote',
        vote: { pollId: 'p3', voterId: 'peer-c', value: 1, ts: clock.now() },
      },
      'peer-c',
    );
    expect(poll.tallies()[0]!.perBucket).toEqual([0, 1]);
  });

  test('poll-close moves the deadline to now and rejects later votes', () => {
    const { clock, poll } = harness();
    poll.receive(
      {
        kind: 'poll-open',
        poll: {
          id: 'p4',
          kind: 'choice',
          question: 'q',
          options: ['A'],
          organiserId: 'self',
          createdAt: clock.now(),
          closesAt: clock.now() + 60_000,
        },
      },
      'self',
    );
    poll.receive({ kind: 'poll-close', pollId: 'p4' }, 'self');
    clock.advance(100);
    poll.receive(
      {
        kind: 'poll-vote',
        vote: { pollId: 'p4', voterId: 'late', value: 0, ts: clock.now() },
      },
      'late',
    );
    expect(poll.tallies()[0]!.totalVotes).toBe(0);
  });
});

describe('createCrowdPoll — onTallyChange', () => {
  test('handler fires on local vote', async () => {
    const { clock, poll } = harness();
    const events: number[] = [];
    poll.onTallyChange((t) => events.push(t.totalVotes));
    await poll.openPoll({
      id: 'p1',
      kind: 'choice',
      question: 'q',
      options: ['A'],
      organiserId: 'self',
      closesAt: clock.now() + 60_000,
    });
    await poll.vote('p1', 'a', 0);
    expect(events).toContain(1);
  });
});
