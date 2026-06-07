import type { PresenceLevel } from './types.ts';

export const PRESENCE_LEVELS: Array<{
  id: PresenceLevel;
  label: string;
  short: string;
  description: string;
}> = [
  {
    id: 'minimal',
    label: 'Minimal',
    short: 'Text only',
    description: 'Plain words with no orb or motion.',
  },
  {
    id: 'simple',
    label: 'Simple',
    short: 'Warm orb',
    description: 'A quiet amber breathing orb with the same grounding tools.',
  },
  {
    id: 'vivid',
    label: 'Vivid',
    short: 'Psychedelic visuals',
    description: 'A colourful moving field and patterned orb while keeping controls simple.',
  },
];

export function presenceLabel(level: PresenceLevel): string {
  return PRESENCE_LEVELS.find((item) => item.id === level)?.label ?? 'Simple';
}

export function nextPresenceLevel(level: PresenceLevel): PresenceLevel {
  const order = PRESENCE_LEVELS.map((item) => item.id);
  const index = order.indexOf(level);
  return order[(index + 1) % order.length] ?? 'simple';
}
