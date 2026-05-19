import type { RoomTemplate } from '../shared/types.ts';

export interface RoomTemplateConfig {
  id: RoomTemplate;
  tone: 'family' | 'friendly' | 'pub' | 'spicy';
  title: string;
  tagline: string;
  defaultPolls: string[];
}

export const ROOM_TEMPLATE_CONFIG: Record<RoomTemplate, RoomTemplateConfig> = {
  friends: {
    id: 'friends',
    tone: 'friendly',
    title: 'Friends Room',
    tagline: 'Fast picks, group receipts, and just enough chaos.',
    defaultPolls: ['Exact score', 'First goal', 'Room verdict'],
  },
  pub: {
    id: 'pub',
    tone: 'pub',
    title: 'Pub Room',
    tagline: 'Quick QR joins, rowdy votes, and a display for the table.',
    defaultPolls: ['VAR verdict', 'Player of the match', 'Next goal'],
  },
  family: {
    id: 'family',
    tone: 'family',
    title: 'Family Room',
    tagline: 'Gentler prompts, easy trivia, and no harsh callouts.',
    defaultPolls: ['Score pick', 'Flag quiz', 'Cheer rating'],
  },
  office: {
    id: 'office',
    tone: 'friendly',
    title: 'Office Room',
    tagline: 'Sweepstakes, lunch quizzes, and Monday recap bragging.',
    defaultPolls: ['Daily five', 'Leaderboard', 'Coffee-run draw'],
  },
  hardcore: {
    id: 'hardcore',
    tone: 'spicy',
    title: 'Just Me',
    tagline: 'Track your own score picks first, then invite friends whenever the room earns it.',
    defaultPolls: ['Exact score', 'Upset pick', 'Receipts'],
  },
  'watch-party': {
    id: 'watch-party',
    tone: 'pub',
    title: 'Watch Party',
    tagline: 'One big screen, phones as controllers, everyone in the room.',
    defaultPolls: ['Next goal', 'Rate that goal', 'Room shout'],
  },
};

export function templateConfig(template: RoomTemplate): RoomTemplateConfig {
  return ROOM_TEMPLATE_CONFIG[template];
}
