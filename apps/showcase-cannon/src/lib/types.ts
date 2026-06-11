// ── Community (D1-backed) ────────────────────────────────────────────────────
export type Thread = 'MATCH' | 'ANALYSIS' | 'HISTORY';
export type Heat = 'scorching' | 'warm' | 'cold';
export type VoteDir = 'up' | 'down' | null;
export type Mood = 'buzzing' | 'relieved' | 'anxious' | 'frustrated';
export type PredictionPick = 'W' | 'D' | 'L';
export type ReportReason = 'abuse' | 'spam' | 'off-topic' | 'other';

export interface Take {
  id: string;
  handle: string;
  thread: Thread;
  text: string;
  matchId: string | null;
  up: number;
  down: number;
  createdAt: number;
  myVote: VoteDir;
}

export interface GaugeSummary {
  avg: number | null;
  count: number;
  moods: Record<Mood, number>;
  mine: { rating: number | null; mood: Mood | null; moment: string | null } | null;
}

export interface PredictionSummary {
  counts: Record<PredictionPick, number>;
  total: number;
  /** % of fans picking a win, null until someone has picked. Never fabricated. */
  confidence: number | null;
  mine: PredictionPick | null;
}

// ── Season feeds (Feed Protocol payloads) ────────────────────────────────────
export type MatchPhase = 'idle' | 'pre' | 'live' | 'ht' | 'ft';
export type FixtureStatus = 'scheduled' | 'live' | 'ft' | 'postponed';
export type Availability = 'fit' | 'doubt' | 'injured' | 'suspended';
export type Difficulty = 'hard' | 'mid' | 'winnable';
export type ResultLetter = 'W' | 'D' | 'L';

export interface Score {
  home: number;
  away: number;
}

export interface Fixture {
  id: string;
  kickoffUtc: string;
  comp: string;
  opponent: string;
  opponentShort: string;
  venue: 'H' | 'A' | 'N';
  ground?: string | null;
  tv?: string | null;
  status: FixtureStatus;
  score?: Score | null;
  difficulty?: Difficulty;
}

export interface H2HMeeting {
  date: string;
  home: boolean;
  score: string;
  r: ResultLetter;
}

export interface H2HRecord {
  record: { w: number; d: number; l: number };
  recent: H2HMeeting[];
  insight: string;
}

export interface FixturesFeed {
  season: string;
  club?: string;
  clubShort?: string;
  tablePosition?: number | null;
  fixtures: Fixture[];
  h2h?: Record<string, H2HRecord>;
}

export interface MatchEvent {
  min: number;
  type: 'goal' | 'own-goal' | 'pen' | 'red' | 'yellow' | 'sub' | 'var' | 'note';
  player?: string;
  ours?: boolean;
  detail?: string;
}

export interface LastResult {
  matchId: string;
  label: string;
  opponent: string;
  opponentShort?: string;
  venue?: string;
  comp?: string;
  score: Score | null;
  playedAt?: string;
  postMatch?: string;
}

export interface MatchFeed {
  phase: MatchPhase;
  matchId: string;
  kickoffUtc: string;
  comp?: string;
  opponent: string;
  opponentShort?: string;
  venue?: string;
  ground?: string | null;
  score: Score | null;
  minute: number | null;
  events: MatchEvent[];
  lineups?: unknown;
  preview?: { quote: string; confidence: number; keyBattle: string } | null;
  lastResult?: LastResult | null;
}

export interface Player {
  id: string;
  num: number;
  name: string;
  full: string;
  nat: string;
  pos: string;
  group: string;
  availability: Availability;
  availabilityNote?: string | null;
  stats: { apps: number; goals: number; assists: number; rating: number };
  form: ResultLetter[];
  note?: string;
}

export interface SquadFeed {
  season: string;
  players: Player[];
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  tag?: string;
}

export interface NewsFeed {
  items: NewsItem[];
}

export interface Trophy {
  year: string;
  title: string;
  note: string;
  gold: boolean;
}

export interface RecentResult {
  opp: string;
  score: string;
  r: ResultLetter;
  home: boolean;
  date: string;
  xg: string;
  shots: number;
  poss: number;
}

export interface ClubFeed {
  lastSeason?: {
    label: string;
    row: { p: number; w: number; d: number; l: number; pts: number };
    headline: string;
    headlineStats: Array<{ v: string; l: string }>;
    last10: ResultLetter[];
    keyMetrics: Array<{ l: string; v: string; s: string }>;
    scorers: Record<'goals' | 'assists', Array<{ n: string; v: number }>>;
    results: RecentResult[];
  };
  trophies: Trophy[];
  thisDay?: Record<string, { year: string; text: string }>;
}
