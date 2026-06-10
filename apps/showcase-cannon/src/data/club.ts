import type { RecentResult, Trophy } from '../lib/types';

export const RECENT: RecentResult[] = [
  { opp: 'Wolves', score: '3–0', r: 'W', home: true, date: '3 May', xg: '3.2', shots: 22, poss: 64 },
  { opp: 'Man City', score: '2–0', r: 'W', home: false, date: '26 Apr', xg: '1.8', shots: 14, poss: 48 },
  { opp: 'Spurs', score: '4–1', r: 'W', home: true, date: '12 Apr', xg: '3.9', shots: 25, poss: 61 },
  { opp: 'Newcastle', score: '2–1', r: 'W', home: false, date: '5 Apr', xg: '2.1', shots: 18, poss: 55 },
  { opp: 'Chelsea', score: '1–1', r: 'D', home: true, date: '22 Mar', xg: '1.4', shots: 12, poss: 53 },
];

export const TROPHIES: Trophy[] = [
  { year: '1989', title: 'Division One Champions', note: 'Thomas. One minute to go. Anfield.', gold: true },
  { year: '1991', title: 'Division One Champions', note: 'Lost only once. The forgotten title.', gold: false },
  { year: '1998', title: 'The Double', note: "Wenger's first. Vieira, Bergkamp, Overmars.", gold: true },
  { year: '2002', title: 'The Double', note: 'The most complete side before the Invincibles.', gold: true },
  { year: '2004', title: 'Premier League Unbeaten', note: '26W 12D 0L. The Invincibles. Never been done.', gold: true },
  { year: '2014', title: 'FA Cup', note: 'The drought ends. 3–2 vs Hull. Extra time.', gold: false },
  { year: '2020', title: 'FA Cup', note: 'The Arteta era begins. Chelsea 2–1.', gold: false },
  { year: '2026', title: 'Premier League Champions', note: 'Twenty-two years. The title is home.', gold: true },
];

export const SCORERS: Record<'goals' | 'assists', Array<{ n: string; v: number }>> = {
  goals: [
    { n: 'Havertz', v: 36 },
    { n: 'Saka', v: 24 },
    { n: 'Martinelli', v: 21 },
    { n: 'Trossard', v: 11 },
    { n: 'Ødegaard', v: 14 },
    { n: 'Rice', v: 9 },
  ],
  assists: [
    { n: 'Ødegaard', v: 22 },
    { n: 'Saka', v: 18 },
    { n: 'Rice', v: 15 },
    { n: 'Havertz', v: 13 },
    { n: 'Martinelli', v: 11 },
    { n: 'White', v: 9 },
  ],
};

export const KEY_METRICS = [
  { l: 'xG per Game', v: '2.34', s: '2nd in league' },
  { l: 'xGA per Game', v: '0.82', s: 'Best in league' },
  { l: 'Avg Possession', v: '57%', s: 'Top 3' },
  { l: 'Clean Sheets', v: '18', s: 'Out of 38' },
];

export const SEASON_ROW: Array<[string, string]> = [
  ['P', '38'],
  ['W', '28'],
  ['D', '7'],
  ['L', '3'],
  ['PTS', '91'],
];

export const LAST_10: Array<'W' | 'D' | 'L'> = ['W', 'W', 'W', 'D', 'W', 'W', 'W', 'L', 'W', 'W'];
