export type Thread = 'MATCH' | 'ANALYSIS' | 'HISTORY';
export type Heat = 'scorching' | 'warm' | 'cold';
export type VoteDir = 'up' | 'down' | null;
export type Mood = 'buzzing' | 'relieved' | 'anxious' | 'frustrated';

export interface Take {
  id: string;
  handle: string;
  thread: Thread;
  text: string;
  up: number;
  down: number;
  createdAt: number;
  myVote: VoteDir;
}

export type Difficulty = 'hard' | 'mid' | 'winnable';

export interface Fixture {
  id: number;
  date: string;
  day: string;
  opponent: string;
  venue: 'H' | 'A' | 'N';
  comp: string;
  diff: Difficulty;
}

export interface H2HMeeting {
  date: string;
  home: boolean;
  score: string;
  r: 'W' | 'D' | 'L';
}

export interface H2HRecord {
  record: { w: number; d: number; l: number };
  recent: H2HMeeting[];
  insight: string;
}

export interface Player {
  num: number;
  name: string;
  full: string;
  nat: string;
  pos: string;
  apps: number;
  goals: number;
  assists: number;
  rating: number;
  form: Array<'W' | 'D' | 'L'>;
}

export interface SquadGroup {
  group: string;
  players: Player[];
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
  r: 'W' | 'D' | 'L';
  home: boolean;
  date: string;
  xg: string;
  shots: number;
  poss: number;
}

export interface GaugeSummary {
  avg: number | null;
  count: number;
  moods: Record<Mood, number>;
  mine: { rating: number | null; mood: Mood | null; moment: string | null } | null;
}
