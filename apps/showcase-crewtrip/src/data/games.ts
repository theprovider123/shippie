import type { GameKind, FeatureKey, PulseKind } from '../types';

export const gamePresets: Record<GameKind, { label: string; title: string; points: number }> = {
  photo: { label: 'Photo hunt', title: 'Upload the best proof-of-trip photo', points: 10 },
  bingo: { label: 'Bingo', title: 'Complete a trip bingo square', points: 6 },
  prediction: { label: 'Prediction', title: 'Predict the next crew decision', points: 5 },
  award: { label: 'Award', title: 'Nominate a crew award winner', points: 4 },
  mission: { label: 'Mission', title: 'Complete a secret crew mission', points: 8 },
  challenge: { label: 'Open game', title: 'Complete a host game', points: 8 },
};

export const pulseActions: Array<{ kind: PulseKind; label: string; detail: string }> = [
  { kind: 'hype', label: 'Hype', detail: 'Bring the energy' },
  { kind: 'ready', label: 'Ready', detail: 'Good to move' },
  { kind: 'hungry', label: 'Hungry', detail: 'Food soon' },
  { kind: 'lost', label: 'Lost', detail: 'Need help' },
  { kind: 'vote', label: 'Need vote', detail: 'Decide together' },
  { kind: 'moment', label: 'Best moment', detail: 'Save this' },
];

export const tabFeatureOptions: Array<{ key: FeatureKey; label: string; hint: string }> = [
  { key: 'crew', label: 'Crew tab', hint: 'Names, photos, and teams' },
  { key: 'games', label: 'Games tab', hint: 'Quick games, proof, and points' },
  { key: 'tournaments', label: 'Tournament', hint: 'Brackets, group stages, and scoreboards' },
  { key: 'memories', label: 'Memories tab', hint: 'Text, photos, videos' },
];

export const detailFeatureOptions: Array<{ key: FeatureKey; label: string; hint: string }> = [
  { key: 'plan', label: 'Plan', hint: 'Shared itinerary' },
  { key: 'polls', label: 'Votes', hint: 'Quick decisions' },
  { key: 'requests', label: 'Requests', hint: 'Crew can ask the host' },
  { key: 'soundtrack', label: 'Soundtrack', hint: 'DJ sets and playlists' },
  { key: 'surprises', label: 'Surprise drops', hint: 'Timed or manual reveals' },
  { key: 'chat', label: 'Chat', hint: 'All-crew and group messages' },
  { key: 'wrap', label: 'Trip wrap', hint: 'Share the end-of-trip recap' },
  { key: 'scores', label: 'Points', hint: 'Scores and leaderboards' },
];

export const featureOptions = [...tabFeatureOptions, ...detailFeatureOptions];

export const featurePresets: Array<{
  key: 'simple' | 'party' | 'festival';
  label: string;
  hint: string;
  features: Record<FeatureKey, boolean>;
}> = [
  {
    key: 'simple',
    label: 'Simple trip',
    hint: 'Plan, crew, soundtrack, memories',
    features: {
      crew: true,
      plan: true,
      polls: false,
      games: false,
      tournaments: false,
      requests: true,
      soundtrack: true,
      surprises: false,
      memories: true,
      chat: false,
      wrap: true,
      scores: false,
    },
  },
  {
    key: 'party',
    label: 'Party trip',
    hint: 'Votes, challenges, drops, wrap',
    features: {
      crew: true,
      plan: true,
      polls: true,
      games: true,
      tournaments: true,
      requests: true,
      soundtrack: true,
      surprises: true,
      memories: true,
      chat: false,
      wrap: true,
      scores: true,
    },
  },
  {
    key: 'festival',
    label: 'Festival trip',
    hint: 'Groups, votes, chat, set clashes',
    features: {
      crew: true,
      plan: true,
      polls: true,
      games: true,
      tournaments: true,
      requests: true,
      soundtrack: true,
      surprises: true,
      memories: true,
      chat: true,
      wrap: true,
      scores: true,
    },
  },
];
