import type { GameKind, FeatureKey, PulseKind } from '../types';

export const gamePresets: Record<GameKind, { label: string; title: string; points: number }> = {
  photo: { label: 'Photo hunt', title: 'Upload the best proof-of-trip photo', points: 10 },
  bingo: { label: 'Bingo', title: 'Complete a trip bingo square', points: 6 },
  prediction: { label: 'Prediction', title: 'Predict the next crew decision', points: 5 },
  award: { label: 'Award', title: 'Nominate a crew award winner', points: 4 },
  mission: { label: 'Mission', title: 'Complete a secret crew mission', points: 8 },
  challenge: { label: 'Challenge', title: 'Complete a host challenge', points: 8 },
};

export const pulseActions: Array<{ kind: PulseKind; label: string; detail: string }> = [
  { kind: 'hype', label: 'Hype', detail: 'Bring the energy' },
  { kind: 'ready', label: 'Ready', detail: 'Good to move' },
  { kind: 'hungry', label: 'Hungry', detail: 'Food soon' },
  { kind: 'lost', label: 'Lost', detail: 'Need help' },
  { kind: 'vote', label: 'Need vote', detail: 'Decide together' },
  { kind: 'moment', label: 'Best moment', detail: 'Save this' },
];

export const featureOptions: Array<{ key: FeatureKey; label: string; hint: string }> = [
  { key: 'crew', label: 'Crew names', hint: 'Guests can add themselves' },
  { key: 'plan', label: 'Plan', hint: 'Shared itinerary' },
  { key: 'polls', label: 'Polls', hint: 'Quick decisions' },
  { key: 'games', label: 'Games', hint: 'Challenges and points' },
  { key: 'requests', label: 'Requests', hint: 'Crew can ask the host' },
  { key: 'memories', label: 'Memories', hint: 'Text, photos, videos' },
  { key: 'chat', label: 'Chat', hint: 'All-crew and group messages' },
  { key: 'wrap', label: 'Trip wrap', hint: 'Share the end-of-trip recap' },
  { key: 'scores', label: 'Energy', hint: 'Score and vibe tracking' },
];
