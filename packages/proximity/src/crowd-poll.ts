/**
 * Phase 6 — Crowd polling / Q&A primitive over gossip.
 *
 * Lives on top of the multi-hop gossip layer: a poll is a payload that
 * propagates through the mesh; votes are payloads that propagate back.
 * Convergence is eventual — at any moment a node knows the votes it
 * has received plus the votes it has cast. As gossip rounds finish,
 * every reachable node converges to the same tally.
 *
 * Two ballot shapes:
 *   - 'choice'  — pick one of N options (e.g. quiz answers, vote)
 *   - 'rating'  — submit a 1..5 score (e.g. talk feedback)
 *
 * Crowd consensus property: the tally is **monotonic in votes received**.
 * No "remove" semantics; once a vote propagates, it counts. This makes
 * the algebra trivially CRDT-safe — votes are a grow-only set keyed by
 * (pollId, voterId).
 *
 * Every poll has a hard wall-clock deadline. Votes received after the
 * deadline drop on receive — prevents zombie votes from re-joining
 * stragglers.
 */

import type { GossipMessage, GossipNode, GossipPeer } from './gossip.ts';

export type PollKind = 'choice' | 'rating';

export interface PollDescriptor {
  /** Unique poll id — typically derived from organiser + question + ts. */
  id: string;
  kind: PollKind;
  question: string;
  /** Wall-clock ms when voting closes. */
  closesAt: number;
  /** For 'choice' — option labels. For 'rating' — empty. */
  options: readonly string[];
  /** Organiser peer id (for trust + display). */
  organiserId: string;
  /** Originated wall-clock ms. */
  createdAt: number;
}

export interface Vote {
  pollId: string;
  voterId: string;
  /** For 'choice' — index into options. For 'rating' — 1..5. */
  value: number;
  /** Wall-clock ms the vote was cast. */
  ts: number;
}

export type PollMessage =
  | { kind: 'poll-open'; poll: PollDescriptor }
  | { kind: 'poll-vote'; vote: Vote }
  | { kind: 'poll-close'; pollId: string };

export interface PollTally {
  pollId: string;
  totalVotes: number;
  /** For 'choice' — count per option index. For 'rating' — count per score 1..5. */
  perBucket: readonly number[];
  /** Mean score for rating polls; undefined for choice. */
  mean?: number;
  /** Wall-clock ms of the most recent vote we know about. */
  updatedAt: number;
}

export interface CrowdPoll {
  /** Open a fresh poll and broadcast it to the mesh. */
  openPoll(input: Omit<PollDescriptor, 'createdAt'>): Promise<PollDescriptor>;
  /** Cast a vote on a known poll. */
  vote(pollId: string, voterId: string, value: number): Promise<Vote | null>;
  /** Receive a gossiped poll message. */
  receive(message: PollMessage, fromPeerId: string): void;
  /** Snapshot tallies of every poll this node knows about. */
  tallies(): readonly PollTally[];
  /** Subscribe to tally updates. */
  onTallyChange(handler: (tally: PollTally) => void): () => void;
  /** All known polls. */
  polls(): readonly PollDescriptor[];
}

export interface CrowdPollOptions {
  selfPeerId: string;
  gossip: GossipNode<PollMessage>;
  /** Lookup of currently-known peers (used for fanout when broadcasting). */
  peers(): readonly GossipPeer<PollMessage>[];
  now?: () => number;
}

export function createCrowdPoll(opts: CrowdPollOptions): CrowdPoll {
  const now = opts.now ?? (() => Date.now());
  const polls = new Map<string, PollDescriptor>();
  const votes = new Map<string, Map<string, Vote>>(); // pollId → voterId → Vote
  const tallyHandlers = new Set<(tally: PollTally) => void>();

  const computeTally = (poll: PollDescriptor): PollTally => {
    const byVoter = votes.get(poll.id) ?? new Map<string, Vote>();
    const buckets = poll.kind === 'choice' ? poll.options.length : 5;
    const perBucket = new Array<number>(buckets).fill(0);
    let sum = 0;
    let count = 0;
    let updatedAt = 0;
    for (const v of byVoter.values()) {
      const idx = poll.kind === 'choice' ? v.value : v.value - 1;
      if (idx < 0 || idx >= buckets) continue;
      perBucket[idx] = (perBucket[idx] ?? 0) + 1;
      sum += v.value;
      count += 1;
      if (v.ts > updatedAt) updatedAt = v.ts;
    }
    const mean = poll.kind === 'rating' && count > 0 ? sum / count : undefined;
    return { pollId: poll.id, totalVotes: count, perBucket, mean, updatedAt };
  };

  const emit = (pollId: string) => {
    const poll = polls.get(pollId);
    if (!poll) return;
    const tally = computeTally(poll);
    for (const h of tallyHandlers) h(tally);
  };

  const ingestVote = (vote: Vote): boolean => {
    const poll = polls.get(vote.pollId);
    if (!poll) return false;
    if (vote.ts > poll.closesAt) return false;
    if (poll.kind === 'choice' && (vote.value < 0 || vote.value >= poll.options.length)) return false;
    if (poll.kind === 'rating' && (vote.value < 1 || vote.value > 5)) return false;
    let byVoter = votes.get(vote.pollId);
    if (!byVoter) {
      byVoter = new Map();
      votes.set(vote.pollId, byVoter);
    }
    // Last-write-wins by timestamp — voter can change their mind until the poll closes.
    const existing = byVoter.get(vote.voterId);
    if (existing && existing.ts >= vote.ts) return false;
    byVoter.set(vote.voterId, vote);
    return true;
  };

  return {
    async openPoll(input) {
      const poll: PollDescriptor = { ...input, createdAt: now() };
      polls.set(poll.id, poll);
      await opts.gossip.broadcast({ kind: 'poll-open', poll }, opts.peers());
      return poll;
    },
    async vote(pollId, voterId, value) {
      const poll = polls.get(pollId);
      if (!poll) return null;
      if (now() > poll.closesAt) return null;
      const vote: Vote = { pollId, voterId, value, ts: now() };
      if (!ingestVote(vote)) return null;
      emit(pollId);
      await opts.gossip.broadcast({ kind: 'poll-vote', vote }, opts.peers());
      return vote;
    },
    receive(message) {
      if (message.kind === 'poll-open') {
        const existing = polls.get(message.poll.id);
        if (!existing || existing.createdAt < message.poll.createdAt) {
          polls.set(message.poll.id, message.poll);
        }
        return;
      }
      if (message.kind === 'poll-vote') {
        if (ingestVote(message.vote)) emit(message.vote.pollId);
        return;
      }
      if (message.kind === 'poll-close') {
        const poll = polls.get(message.pollId);
        if (poll) polls.set(message.pollId, { ...poll, closesAt: now() });
      }
    },
    tallies() {
      return [...polls.values()].map((poll) => computeTally(poll));
    },
    onTallyChange(handler) {
      tallyHandlers.add(handler);
      return () => tallyHandlers.delete(handler);
    },
    polls() {
      return [...polls.values()];
    },
  };
}

/**
 * Adapter so the gossip node's `onDeliver` can pump messages straight
 * into a CrowdPoll instance with no plumbing in the caller.
 */
export function bindCrowdPollToGossip(
  gossip: GossipNode<PollMessage>,
  poll: CrowdPoll,
): () => void {
  return gossip.onDeliver((payload, message: GossipMessage<PollMessage>) => {
    poll.receive(payload, message.originPeerId);
  });
}
