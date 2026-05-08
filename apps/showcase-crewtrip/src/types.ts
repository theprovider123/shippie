export type Role = 'host' | 'eventee';
export type Tab = 'now' | 'crew' | 'vote' | 'games' | 'requests' | 'memories' | 'chat' | 'wrap' | 'host' | 'more';
export type StopStatus = 'now' | 'next' | 'later';
export type RequestStatus = 'new' | 'shared' | 'done';
export type MemoryKind = 'text' | 'image' | 'video' | 'award';
export type FeatureKey = 'crew' | 'plan' | 'polls' | 'games' | 'tournaments' | 'requests' | 'memories' | 'chat' | 'wrap' | 'scores' | 'soundtrack' | 'surprises';
export type GameKind = 'photo' | 'bingo' | 'prediction' | 'award' | 'mission' | 'challenge';
export type MessageScope = 'all' | 'group';
export type HostSection = 'setup' | 'manage' | 'fun' | 'wrap';
export type Language = 'en' | 'fr';
export type MemoryFilter = 'all' | 'media' | 'awards' | 'mine';
export type ThemeKey = 'sunset' | 'coast' | 'garden' | 'night';
export type PulseKind = 'hype' | 'ready' | 'hungry' | 'lost' | 'vote' | 'moment';
export type SurpriseUnlock = 'time' | 'submissions' | 'first-photo' | 'manual';
export type EventFormat = 'bracket' | 'round_robin' | 'open_scoreboard';
export type EventMode = 'individual' | 'team';
export type TournamentStatus = 'setup' | 'live' | 'done';
export type MatchStatus = 'pending' | 'live' | 'done' | 'forfeit';
export type LeaderboardView = 'points' | 'medals';
export type TournamentScoringMode = 'placement' | 'winner_take_all' | 'participation' | 'medals_only';
export type TournamentPairingMode = 'automatic' | 'host_defined';

export type FeatureSettings = Record<FeatureKey, boolean>;

export interface ItineraryStop {
  id: string;
  dayId?: string;
  groupId?: string;
  time: string;
  title: string;
  place: string;
  status: StopStatus;
}

export interface PollOption {
  id: string;
  label: string;
  votes: number;
  voterIds?: string[];
}

export interface Poll {
  id: string;
  question: string;
  closes: string;
  open: boolean;
  options: PollOption[];
}

export interface Player {
  id: string;
  name: string;
  team: string;
  groupId?: string;
  color: string;
  score: number;
  avatarDataUrl?: string;
  avatarName?: string;
}

export interface GameSubmission {
  id: string;
  playerId: string;
  playerName: string;
  groupId?: string;
  text: string;
  at: string;
  mediaDataUrl?: string;
  mediaKind?: 'image' | 'video';
  mediaName?: string;
  cheers: string[];
}

export interface Challenge {
  id: string;
  kind?: GameKind;
  dayId?: string;
  groupId?: string;
  deadline?: string;
  status?: 'open' | 'closed';
  title: string;
  points: number;
  doneBy: string[];
  submissions?: GameSubmission[];
}

export interface SoundtrackSlot {
  id: string;
  dayId?: string;
  time: string;
  title: string;
  dj: string;
  link?: string;
  note?: string;
  status: StopStatus;
}

export interface TripTimelineItem {
  id: string;
  time: string;
  kind: 'plan' | 'host' | 'poll' | 'game' | 'tournament' | 'memory' | 'soundtrack';
  title: string;
  detail: string;
  status?: string;
  tab?: Tab;
  challengeId?: string;
  tournamentEventId?: string;
  matchId?: string;
  locked?: boolean;
}

export interface LiveActivity {
  id: string;
  text: string;
  at: string;
  kind: 'presence' | 'pulse' | 'host' | 'memory' | 'game' | 'poll' | 'surprise' | 'soundtrack' | 'tournament';
}

export interface CrewAward {
  playerId: string;
  name: string;
  groupName: string;
  color: string;
  title: string;
  detail: string;
  score: number;
  trophy: string;
  effect: AwardEffect;
}

export type AwardEffect = 'gold' | 'spark' | 'heart' | 'star' | 'camera';

export interface AssignedCrewAward {
  id: string;
  playerId: string;
  title: string;
  detail: string;
  trophy: string;
  effect: AwardEffect;
  updatedAt: number;
  updatedBy: string;
}

export interface Memory {
  id: string;
  author: string;
  text: string;
  kind: MemoryKind;
  dayId?: string;
  groupId?: string;
  at?: string;
  mediaPath?: string;
  mediaDataUrl?: string;
  mediaName?: string;
}

export interface Broadcast {
  id: string;
  text: string;
  at: string;
}

export interface CrewRequest {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  status: RequestStatus;
  at: string;
}

export interface TripDay {
  id: string;
  label: string;
  date: string;
}

export interface CrewGroup {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  imageDataUrl?: string;
  imageName?: string;
}

export interface CrewMessage {
  id: string;
  authorId: string;
  authorName: string;
  groupId?: string;
  scope: MessageScope;
  text: string;
  at: string;
}

export interface CrewPulse {
  id: string;
  playerId: string;
  playerName: string;
  groupId?: string;
  kind: PulseKind;
  label: string;
  at: string;
}

export interface SurpriseDrop {
  id: string;
  title: string;
  message: string;
  unlockType: SurpriseUnlock;
  unlockValue: string;
  createdAt: string;
  revealedAt?: string;
}

export interface WrapUpSettings {
  published: boolean;
  title: string;
  note: string;
  includeGames: boolean;
  includePolls: boolean;
  includeTimeline: boolean;
  assignedAwards: AssignedCrewAward[];
}

export interface Tournament {
  id: string;
  name: string;
  hostId: string;
  createdAt: number;
  startedAt?: number;
  status: TournamentStatus;
  leaderboardView: LeaderboardView;
  updatedAt: number;
  updatedBy: string;
}

export interface TournamentEvent {
  id: string;
  tournamentId: string;
  name: string;
  emoji?: string;
  format: EventFormat;
  mode: EventMode;
  participantIds: string[];
  unlockDayId?: string;
  scheduledAt?: number;
  status: TournamentStatus;
  scoringMode?: TournamentScoringMode;
  gamesPerMatch?: number;
  pointTarget?: number;
  winBy?: number;
  pairingMode?: TournamentPairingMode;
  initialPairings?: Array<{ sideAId: string; sideBId?: string }>;
  pointsFirst?: number;
  pointsSecond?: number;
  pointsThird?: number;
  pointsParticipation?: number;
  placement?: string[];
  order: number;
  updatedAt: number;
  updatedBy: string;
}

export interface TournamentMatchSide {
  participantId: string;
  score?: number;
}

export interface TournamentMatch {
  id: string;
  eventId: string;
  roundIndex: number;
  index: number;
  kind: 'head_to_head' | 'score_entry';
  sideA: TournamentMatchSide;
  sideB: TournamentMatchSide;
  winnerId?: string;
  readyParticipantIds?: string[];
  startedAt?: number;
  finishedAt?: number;
  status: MatchStatus;
  updatedAt: number;
  updatedBy: string;
}

export interface CrewtripState {
  updatedAt: number;
  updatedBy: string;
  eventName: string;
  location: string;
  eventCode: string;
  description: string;
  hostNote: string;
  coverImagePath?: string;
  coverImageName?: string;
  coverImageDataUrl?: string;
  energy: number;
  activePlayerId: string;
  days: TripDay[];
  groups: CrewGroup[];
  stops: ItineraryStop[];
  polls: Poll[];
  players: Player[];
  challenges: Challenge[];
  memories: Memory[];
  broadcasts: Broadcast[];
  requests: CrewRequest[];
  messages: CrewMessage[];
  pulses: CrewPulse[];
  surprises: SurpriseDrop[];
  soundtracks: SoundtrackSlot[];
  tournaments: Tournament[];
  tournamentEvents: TournamentEvent[];
  tournamentMatches: TournamentMatch[];
  wrapUp: WrapUpSettings;
  features: FeatureSettings;
  language: Language;
  theme: ThemeKey;
}

export interface SyncState {
  status: 'local' | 'connecting' | 'open' | 'closed';
  peers: number;
  lastSyncedAt: number | null;
}

export interface RecoveryPack {
  app: 'crewtrip';
  version: 1;
  exportedAt: string;
  state: CrewtripState;
}

export interface LocalBackup {
  id: string;
  eventCode: string;
  eventName: string;
  at: number;
  reason: 'auto' | 'manual' | 'restore';
  bytes: number;
  pack: RecoveryPack;
}

export interface EventTemplate {
  id: string;
  name: string;
  location: string;
  description: string;
  hostNote: string;
  stops: ItineraryStop[];
  polls: Poll[];
  challenges: Challenge[];
  soundtracks?: SoundtrackSlot[];
}
