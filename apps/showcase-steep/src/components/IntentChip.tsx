/**
 * Intent chip — used as a filter (clickable) and as a read-only tag.
 *
 * Eight intents seeded; new intents extend by adding to `IntentTag` in
 * schema.ts and to the labels map below.
 */
import type { IntentTag } from '../db/schema.ts';

const INTENT_LABELS: Record<IntentTag, string> = {
  sleep: 'Sleep',
  calm: 'Calm',
  focus: 'Focus',
  digestion: 'Digestion',
  energy: 'Energy',
  immune: 'Immune',
  cycle: 'Cycle',
  breath: 'Breath',
};

export const ALL_INTENTS: IntentTag[] = [
  'sleep',
  'calm',
  'focus',
  'digestion',
  'energy',
  'immune',
  'cycle',
  'breath',
];

export function intentLabel(tag: IntentTag): string {
  return INTENT_LABELS[tag] ?? tag;
}

interface IntentChipProps {
  tag: IntentTag;
  active?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
}

export function IntentChip({ tag, active, onClick, size = 'md' }: IntentChipProps) {
  const className = `intent-chip intent-chip-${size}${active ? ' active' : ''}`;
  if (!onClick) return <span className={className}>{intentLabel(tag)}</span>;
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-pressed={active ?? false}
    >
      {intentLabel(tag)}
    </button>
  );
}
