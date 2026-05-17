import type { PollMessage } from '@shippie/proximity';
import type { FantasyChip, FantasySquad } from '../fantasy/fpl-rules.ts';
import type { Locale } from '../i18n.ts';
import type { CommentaryPost, FollowedTeam, PredictionReceipt, PulseVote, SavedRoom } from './local-store.ts';

export type Role = 'host' | 'play' | 'display';
export type RoomTemplate = 'friends' | 'pub' | 'family' | 'office' | 'hardcore' | 'watch-party';

export interface RoomParams {
  role: Role | null;
  roomId: string | null;
  signalBase: string;
  roomKey: string | null;
  template: RoomTemplate;
  locale: Locale | null;
  timeZone: string | null;
}

export interface ScorePoll {
  id: string;
  matchId?: string;
  question: string;
  homeLabel: string;
  awayLabel: string;
  closesAt: number;
  createdAt: number;
  organiserId: string;
}

export interface ScoreVote {
  pollId: string;
  matchId?: string;
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

export interface FantasyTeamSaved {
  id: string;
  managerId: string;
  managerName: string;
  squad: FantasySquad;
  freeTransfers: number;
  chipsUsed: {
    group: FantasyChip[];
    knockout: FantasyChip[];
  };
  points: number;
  updatedAt: number;
}

export type MatchdayPayload =
  | { kind: 'crowd'; message: PollMessage }
  | { kind: 'score-open'; poll: ScorePoll }
  | { kind: 'score-vote'; vote: ScoreVote }
  | { kind: 'score-close'; pollId: string; ts: number }
  | { kind: 'shoutout-pending'; shoutout: Shoutout }
  | { kind: 'shoutout-approved'; shoutoutId: string; ts: number }
  | { kind: 'fantasy-team-save'; team: FantasyTeamSaved }
  | { kind: 'fantasy-chip-play'; teamId: string; chip: FantasyChip; phase: 'group' | 'knockout'; ts: number }
  | { kind: 'legacy-local-snapshot'; snapshot: LegacyLocalSnapshot }
  | { kind: 'host-presence'; hostId: string; ts: number };

export interface LegacyLocalSnapshot {
  schema: 'shippie.match-room.legacy-local-snapshot.v1';
  roomId: string;
  migratedAt: string;
  receipts: PredictionReceipt[];
  savedRooms: SavedRoom[];
  followedTeam: FollowedTeam | null;
  commentaryPosts: CommentaryPost[];
  pulseVotes: PulseVote[];
}

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

export interface MatchRoomArchiveState {
  crowdMessages: PollMessage[];
  scorePolls: ScorePoll[];
  scoreVotes: ScoreVote[];
  pendingShoutouts: Shoutout[];
  approvedShoutoutIds: string[];
  fantasyTeams: FantasyTeamSaved[];
  legacySnapshots: LegacyLocalSnapshot[];
}
