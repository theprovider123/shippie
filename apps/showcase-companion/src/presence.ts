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
    short: 'Just words',
    description: 'Plain text, no orb, no motion.',
  },
  {
    id: 'simple',
    label: 'Simple',
    short: 'Warm orb',
    description: 'A soft breathing orb with simple tools.',
  },
  {
    id: 'vivid',
    label: 'Vivid',
    short: 'Colour motion',
    description: 'A colourful moving field with the same simple tools.',
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
