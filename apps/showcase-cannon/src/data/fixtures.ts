import type { Difficulty, Fixture } from '../lib/types';

export const FIXTURES: Fixture[] = [
  { id: 1, date: '16 Aug', day: 'Sat', opponent: 'Man City', venue: 'N', comp: 'Community Shield', diff: 'hard' },
  { id: 2, date: '22 Aug', day: 'Sat', opponent: 'Fulham', venue: 'H', comp: 'Premier League', diff: 'winnable' },
  { id: 3, date: '26 Aug', day: 'Wed', opponent: 'Wolves', venue: 'A', comp: 'Premier League', diff: 'winnable' },
  { id: 4, date: '30 Aug', day: 'Sun', opponent: 'Chelsea', venue: 'H', comp: 'Premier League', diff: 'hard' },
  { id: 5, date: '13 Sep', day: 'Sat', opponent: 'Liverpool', venue: 'A', comp: 'Premier League', diff: 'hard' },
  { id: 6, date: '20 Sep', day: 'Sat', opponent: 'Spurs', venue: 'H', comp: 'Premier League', diff: 'hard' },
  { id: 7, date: '24 Sep', day: 'Wed', opponent: 'PSG', venue: 'H', comp: 'Champions League', diff: 'hard' },
  { id: 8, date: '27 Sep', day: 'Sat', opponent: 'Leicester', venue: 'H', comp: 'Premier League', diff: 'winnable' },
  { id: 9, date: '30 Sep', day: 'Tue', opponent: 'Man City', venue: 'A', comp: 'Premier League', diff: 'hard' },
  { id: 10, date: '4 Oct', day: 'Sat', opponent: 'Aston Villa', venue: 'H', comp: 'Premier League', diff: 'mid' },
  { id: 11, date: '7 Oct', day: 'Tue', opponent: 'Atlético Madrid', venue: 'A', comp: 'Champions League', diff: 'hard' },
  { id: 12, date: '18 Oct', day: 'Sat', opponent: 'Everton', venue: 'A', comp: 'Premier League', diff: 'winnable' },
  { id: 13, date: '25 Oct', day: 'Sat', opponent: 'Brighton', venue: 'H', comp: 'Premier League', diff: 'mid' },
  { id: 14, date: '1 Nov', day: 'Sat', opponent: 'Man United', venue: 'H', comp: 'Premier League', diff: 'mid' },
  { id: 15, date: '8 Nov', day: 'Sat', opponent: 'Newcastle', venue: 'A', comp: 'Premier League', diff: 'hard' },
  { id: 16, date: '22 Nov', day: 'Sat', opponent: 'Brentford', venue: 'H', comp: 'Premier League', diff: 'winnable' },
  { id: 17, date: '29 Nov', day: 'Sat', opponent: 'Crystal Palace', venue: 'A', comp: 'Premier League', diff: 'mid' },
  { id: 18, date: '6 Dec', day: 'Sat', opponent: 'Nottm Forest', venue: 'H', comp: 'Premier League', diff: 'winnable' },
  { id: 19, date: '13 Dec', day: 'Sat', opponent: 'West Ham', venue: 'A', comp: 'Premier League', diff: 'mid' },
  { id: 20, date: '21 Dec', day: 'Sun', opponent: 'Liverpool', venue: 'H', comp: 'Premier League', diff: 'hard' },
  { id: 21, date: '26 Dec', day: 'Fri', opponent: 'Bournemouth', venue: 'A', comp: 'Premier League', diff: 'mid' },
  { id: 22, date: '29 Dec', day: 'Mon', opponent: 'Man City', venue: 'H', comp: 'Premier League', diff: 'hard' },
];

export const MONTHS = ['All', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MONTH_DATA = [
  { m: 'AUG', score: 0.72 },
  { m: 'SEP', score: 0.95 },
  { m: 'OCT', score: 0.68 },
  { m: 'NOV', score: 0.52 },
  { m: 'DEC', score: 0.8 },
];

export const DIFF: Record<Difficulty, { bar: string; badge: string; text: string; label: string }> = {
  hard: { bar: '#EF0107', badge: 'rgba(239,1,7,0.1)', text: '#EF0107', label: 'HARD' },
  mid: { bar: '#C4982A', badge: 'rgba(196,152,42,0.1)', text: 'var(--gold-light)', label: 'MID' },
  winnable: { bar: '#4ADE80', badge: 'rgba(74,222,128,0.1)', text: '#2ABD60', label: 'WIN' },
};

// Competition abbreviation — prevents wrapping
export const COMP_SHORT: Record<string, string> = {
  'Premier League': 'PL',
  'Champions League': 'UCL',
  'Community Shield': 'Shield',
};
