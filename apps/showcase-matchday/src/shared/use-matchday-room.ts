import { useEffect, useMemo, useRef, useState } from 'react';
import { createCrowdPoll, type CrowdPoll, type PollDescriptor, type PollMessage, type PollTally, type Vote } from '@shippie/proximity';
import { computeScoreTally, normaliseScore, cleanShoutoutText, sortedShoutouts } from './matchday-state.ts';
import { randomId } from './peer-id.ts';
import { createRelayGossipRoom, type RelayGossipRoom } from './relay-gossip.ts';
import { createIndexedDbVoteQueue, type VoteQueue } from './vote-queue.ts';
import type { MatchdayPayload, RoomStatus, ScorePoll, ScoreTally, ScoreVote, Shoutout } from './types.ts';

interface UseRoomOptions {
  roomId: string;
  roomKey: string;
  signalBase: string;
  peerId: string;
}

export interface MatchdayRoomState {
  peerId: string;
  status: RoomStatus;
  polls: readonly PollDescriptor[];
  tallies: readonly PollTally[];
  scorePolls: readonly ScorePoll[];
  scoreTallies: readonly ScoreTally[];
  pendingShoutouts: readonly Shoutout[];
  approvedShoutouts: readonly Shoutout[];
  openChoicePoll(question: string, options: readonly string[], durationSeconds: number): Promise<void>;
  openRatingPoll(question: string, durationSeconds: number): Promise<void>;
  openScorePoll(input: { question: string; homeLabel: string; awayLabel: string; durationSeconds: number }): Promise<void>;
  closeCrowdPoll(pollId: string): Promise<void>;
  closeScorePoll(pollId: string): Promise<void>;
  voteCrowd(poll: PollDescriptor, value: number): Promise<void>;
  voteScore(poll: ScorePoll, home: number, away: number): Promise<void>;
  submitShoutout(text: string): Promise<boolean>;
  approveShoutout(shoutoutId: string): Promise<void>;
}

const EMPTY_STATUS: RoomStatus = {
  connection: 'connecting',
  peerCount: 0,
  lastActivity: null,
  error: null,
};

export function useMatchdayRoom(opts: UseRoomOptions): MatchdayRoomState {
  const [status, setStatus] = useState<RoomStatus>(EMPTY_STATUS);
  const [polls, setPolls] = useState<readonly PollDescriptor[]>([]);
  const [tallies, setTallies] = useState<readonly PollTally[]>([]);
  const [scorePolls, setScorePolls] = useState<readonly ScorePoll[]>([]);
  const [scoreTallies, setScoreTallies] = useState<readonly ScoreTally[]>([]);
  const [pendingShoutouts, setPendingShoutouts] = useState<readonly Shoutout[]>([]);
  const [approvedShoutouts, setApprovedShoutouts] = useState<readonly Shoutout[]>([]);

  const roomRef = useRef<RelayGossipRoom | null>(null);
  const pollRef = useRef<CrowdPoll | null>(null);
  const queueRef = useRef<VoteQueue<MatchdayPayload> | null>(null);
  const scorePollMap = useRef(new Map<string, ScorePoll>());
  const scoreVotes = useRef(new Map<string, ScoreVote>());
  const pendingMap = useRef(new Map<string, Shoutout>());
  const approvedIds = useRef(new Set<string>());
  const crowdMessages = useRef(new Map<string, PollMessage>());
  const lastPeerCount = useRef(0);

  useEffect(() => {
    const room = createRelayGossipRoom(opts);
    roomRef.current = room;
    queueRef.current = createIndexedDbVoteQueue<MatchdayPayload>();

    const pollGossip = {
      broadcast: async (message: PollMessage) => {
        rememberCrowdMessage(crowdMessages.current, message);
        await room.broadcast({ kind: 'crowd', message });
        return {
          id: `poll_${Date.now()}_${Math.floor(Math.random() * 1e9)}`,
          hop: 0,
          originatedAt: Date.now(),
          originPeerId: opts.peerId,
          payload: message,
        };
      },
      receive: async () => undefined,
      onDeliver: () => () => undefined,
      size: () => room.gossip.size(),
    };

    const poll = createCrowdPoll({
      selfPeerId: opts.peerId,
      gossip: pollGossip,
      peers: () => [],
    });
    pollRef.current = poll;

    const refreshPolls = () => {
      setPolls(poll.polls().slice().sort((a, b) => b.createdAt - a.createdAt));
      setTallies(poll.tallies());
    };
    const refreshScore = () => {
      const scoreItems = [...scorePollMap.current.values()].sort((a, b) => b.createdAt - a.createdAt);
      setScorePolls(scoreItems);
      setScoreTallies(scoreItems.map((p) => computeScoreTally(p, scoreVotes.current.values())));
    };
    const refreshShoutouts = () => {
      const pending = sortedShoutouts(pendingMap.current.values()).filter((s) => !approvedIds.current.has(s.id));
      const approved = sortedShoutouts([...pendingMap.current.values()].filter((s) => approvedIds.current.has(s.id)));
      setPendingShoutouts(pending);
      setApprovedShoutouts(approved.slice(-8).reverse());
    };

    const unsubStatus = room.subscribe((next) => {
      setStatus(next);
      if (next.connection === 'open' && next.peerCount > 0) {
        void queueRef.current?.drain(async (message) => room.broadcast(message.payload));
      }
      if (next.connection === 'open' && next.peerCount > lastPeerCount.current) {
        window.setTimeout(() => {
          void rebroadcastKnownState(room, {
            crowdMessages: crowdMessages.current,
            scorePolls: scorePollMap.current,
            scoreVotes: scoreVotes.current,
            pendingShoutouts: pendingMap.current,
            approvedIds: approvedIds.current,
          });
        }, 250);
      }
      lastPeerCount.current = next.peerCount;
    });

    const unsubGossip = room.gossip.onDeliver((payload, message) => {
      if (payload.kind === 'crowd') {
        rememberCrowdMessage(crowdMessages.current, payload.message);
        poll.receive(payload.message, message.originPeerId);
        refreshPolls();
        return;
      }
      if (payload.kind === 'score-open') {
        const existing = scorePollMap.current.get(payload.poll.id);
        if (!existing || existing.createdAt < payload.poll.createdAt) {
          scorePollMap.current.set(payload.poll.id, payload.poll);
        }
        refreshScore();
        return;
      }
      if (payload.kind === 'score-vote') {
        const vote = payload.vote;
        const pollItem = scorePollMap.current.get(vote.pollId);
        if (!pollItem || vote.ts > pollItem.closesAt || !normaliseScore(vote.home, vote.away)) return;
        const key = `${vote.pollId}:${vote.voterId}`;
        const existing = scoreVotes.current.get(key);
        if (!existing || existing.ts < vote.ts) scoreVotes.current.set(key, vote);
        refreshScore();
        return;
      }
      if (payload.kind === 'score-close') {
        const pollItem = scorePollMap.current.get(payload.pollId);
        if (pollItem) scorePollMap.current.set(payload.pollId, { ...pollItem, closesAt: payload.ts });
        refreshScore();
        return;
      }
      if (payload.kind === 'shoutout-pending') {
        pendingMap.current.set(payload.shoutout.id, payload.shoutout);
        refreshShoutouts();
        return;
      }
      if (payload.kind === 'shoutout-approved') {
        approvedIds.current.add(payload.shoutoutId);
        refreshShoutouts();
      }
    });

    const unsubTally = poll.onTallyChange(refreshPolls);
    refreshPolls();
    refreshScore();
    refreshShoutouts();

    return () => {
      unsubStatus();
      unsubGossip();
      unsubTally();
      room.destroy();
      roomRef.current = null;
      pollRef.current = null;
      queueRef.current = null;
      crowdMessages.current.clear();
      lastPeerCount.current = 0;
      scorePollMap.current.clear();
      scoreVotes.current.clear();
      pendingMap.current.clear();
      approvedIds.current.clear();
    };
  }, [opts.peerId, opts.roomId, opts.roomKey, opts.signalBase]);

  return useMemo(() => ({
    peerId: opts.peerId,
    status,
    polls,
    tallies,
    scorePolls,
    scoreTallies,
    pendingShoutouts,
    approvedShoutouts,
    async openChoicePoll(question, options, durationSeconds) {
      const poll = pollRef.current;
      if (!poll) return;
      await poll.openPoll({
        id: randomId('poll'),
        kind: 'choice',
        question,
        options,
        closesAt: Date.now() + durationSeconds * 1000,
        organiserId: opts.peerId,
      });
    },
    async openRatingPoll(question, durationSeconds) {
      const poll = pollRef.current;
      if (!poll) return;
      await poll.openPoll({
        id: randomId('poll'),
        kind: 'rating',
        question,
        options: [],
        closesAt: Date.now() + durationSeconds * 1000,
        organiserId: opts.peerId,
      });
    },
    async openScorePoll(input) {
      const payload: MatchdayPayload = {
        kind: 'score-open',
        poll: {
          id: randomId('score'),
          question: input.question,
          homeLabel: input.homeLabel,
          awayLabel: input.awayLabel,
          closesAt: Date.now() + input.durationSeconds * 1000,
          createdAt: Date.now(),
          organiserId: opts.peerId,
        },
      };
      await roomRef.current?.broadcast(payload);
    },
    async closeCrowdPoll(pollId) {
      const message: PollMessage = { kind: 'poll-close', pollId };
      rememberCrowdMessage(crowdMessages.current, message);
      pollRef.current?.receive(message, opts.peerId);
      await roomRef.current?.broadcast({ kind: 'crowd', message });
    },
    async closeScorePoll(pollId) {
      await roomRef.current?.broadcast({ kind: 'score-close', pollId, ts: Date.now() });
    },
    async voteCrowd(poll, value) {
      const vote: Vote = { pollId: poll.id, voterId: opts.peerId, value, ts: Date.now() };
      const message: PollMessage = { kind: 'poll-vote', vote };
      rememberCrowdMessage(crowdMessages.current, message);
      pollRef.current?.receive(message, opts.peerId);
      const payload: MatchdayPayload = { kind: 'crowd', message };
      const relayed = await roomRef.current?.broadcast(payload);
      if (!relayed) await queueRef.current?.add({ id: `crowd:${poll.id}:${opts.peerId}`, payload, createdAt: vote.ts });
    },
    async voteScore(poll, home, away) {
      const normalised = normaliseScore(home, away);
      if (!normalised || Date.now() > poll.closesAt) return;
      const vote: ScoreVote = { pollId: poll.id, voterId: opts.peerId, ...normalised, ts: Date.now() };
      const payload: MatchdayPayload = { kind: 'score-vote', vote };
      const relayed = await roomRef.current?.broadcast(payload);
      if (!relayed) await queueRef.current?.add({ id: `score:${poll.id}:${opts.peerId}`, payload, createdAt: vote.ts });
    },
    async submitShoutout(text) {
      const clean = cleanShoutoutText(text);
      if (!clean) return false;
      const shoutout: Shoutout = { id: randomId('shout'), voterId: opts.peerId, text: clean, ts: Date.now() };
      const payload: MatchdayPayload = { kind: 'shoutout-pending', shoutout };
      const relayed = await roomRef.current?.broadcast(payload);
      if (!relayed) await queueRef.current?.add({ id: shoutout.id, payload, createdAt: shoutout.ts });
      return true;
    },
    async approveShoutout(shoutoutId) {
      await roomRef.current?.broadcast({ kind: 'shoutout-approved', shoutoutId, ts: Date.now() });
    },
  }), [
    opts.peerId,
    status,
    polls,
    tallies,
    scorePolls,
    scoreTallies,
    pendingShoutouts,
    approvedShoutouts,
  ]);
}

function rememberCrowdMessage(messages: Map<string, PollMessage>, message: PollMessage): void {
  if (message.kind === 'poll-open') {
    messages.set(`open:${message.poll.id}`, message);
    return;
  }
  if (message.kind === 'poll-close') {
    messages.set(`close:${message.pollId}`, message);
    return;
  }
  const key = `vote:${message.vote.pollId}:${message.vote.voterId}`;
  const existing = messages.get(key);
  if (existing?.kind === 'poll-vote' && existing.vote.ts >= message.vote.ts) return;
  messages.set(key, message);
}

async function rebroadcastKnownState(
  room: RelayGossipRoom,
  state: {
    crowdMessages: Map<string, PollMessage>;
    scorePolls: Map<string, ScorePoll>;
    scoreVotes: Map<string, ScoreVote>;
    pendingShoutouts: Map<string, Shoutout>;
    approvedIds: Set<string>;
  },
): Promise<void> {
  for (const message of state.crowdMessages.values()) {
    await room.broadcast({ kind: 'crowd', message });
  }
  for (const poll of state.scorePolls.values()) {
    await room.broadcast({ kind: 'score-open', poll });
  }
  for (const vote of state.scoreVotes.values()) {
    await room.broadcast({ kind: 'score-vote', vote });
  }
  for (const shoutout of state.pendingShoutouts.values()) {
    await room.broadcast({ kind: 'shoutout-pending', shoutout });
    if (state.approvedIds.has(shoutout.id)) {
      await room.broadcast({ kind: 'shoutout-approved', shoutoutId: shoutout.id, ts: Date.now() });
    }
  }
}
