import type { Mood } from '../lib/types';

/** The Gauge's current subject — the most recent result. */
export const CURRENT_MATCH = {
  id: 'arsenal-newcastle-2026-05',
  label: 'Arsenal 2–1 Newcastle',
};

/** The Oracle's next-match card. */
export const NEXT_MATCH = {
  comp: 'Community Shield',
  dateLabel: '16 Aug 2026',
  kickoffISO: '2026-08-16T00:00:00',
  opponent: 'Man City',
  opponentShort: 'MCI',
  fanConfidence: 73,
};

/** Static Oracle copy — the AI Gateway briefing is out of scope for v1. */
export const ORACLE = {
  phase: 'Pre-Season',
  quote:
    "City have rebuilt in silence. But Arteta's press has evolved into something genuinely elite — and this squad carries the mentality of champions now. We fancy this.",
  confidence: 74,
  keyBattle: 'Rice vs Rodri',
  postMatch:
    'Slightly nervy but ultimately convincing. Raya was immense. Two half-chances City will punish need addressing before September.',
};

export const THIS_DAY = {
  day: '09',
  month: 'JUN',
  year: '2004',
  text: 'The Invincibles confirmed as champions. 26 wins, 12 draws, 0 defeats. Henry. Bergkamp. Vieira. Football had never seen anything like it.',
};

export const MOODS: Array<{ id: Mood; label: string }> = [
  { id: 'buzzing', label: 'Buzzing' },
  { id: 'relieved', label: 'Relieved' },
  { id: 'anxious', label: 'Anxious' },
  { id: 'frustrated', label: 'Frustrated' },
];
