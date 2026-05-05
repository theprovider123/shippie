import type { PollMessage } from '@shippie/proximity';

export type Role = 'host' | 'play' | 'display';

export interface RoomParams {
  role: Role | null;
  roomId: string | null;
  signalBase: string;
  roomKey: string | null;
}

export interface ScorePoll {
  id: string;
  question: string;
  homeLabel: string;
  awayLabel: string;
  closesAt: number;
  createdAt: number;
  organiserId: string;
}

export interface ScoreVote {
  pollId: string;
  voterId: string;
  home: number;
  away: number;
  ts: number;
}

export interface Shoutout {
  id: string;
  voterId: string;
  text: string;
  ts: number;
}

export type MatchdayPayload =
  | { kind: 'crowd'; message: PollMessage }
  | { kind: 'score-open'; poll: ScorePoll }
  | { kind: 'score-vote'; vote: ScoreVote }
  | { kind: 'score-close'; pollId: string; ts: number }
  | { kind: 'shoutout-pending'; shoutout: Shoutout }
  | { kind: 'shoutout-approved'; shoutoutId: string; ts: number }
  | { kind: 'host-presence'; hostId: string; ts: number };

export interface ScoreTally {
  pollId: string;
  totalVotes: number;
  leaders: Array<{ score: string; count: number }>;
  updatedAt: number;
}

export interface RoomStatus {
  connection: 'connecting' | 'open' | 'closed';
  peerCount: number;
  lastActivity: number | null;
  error: string | null;
}
