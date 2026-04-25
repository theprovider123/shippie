import type { SentimentLabel } from '../db/schema.ts';

const LABELS: Record<SentimentLabel, { text: string; color: string }> = {
  positive: { text: 'Positive', color: '#3FB07C' },
  neutral: { text: 'Neutral', color: '#9A938A' },
  negative: { text: 'Negative', color: '#D8624A' },
};

export interface MoodBadgeProps {
  label: SentimentLabel | null | undefined;
  score?: number | null;
}

export function MoodBadge({ label, score }: MoodBadgeProps) {
  if (!label) return null;
  const meta = LABELS[label];
  return (
    <span className="mood-badge" style={{ background: `${meta.color}22`, color: meta.color, borderColor: `${meta.color}55` }}>
      <span className="mood-dot" style={{ background: meta.color }} aria-hidden="true" />
      {meta.text}
      {typeof score === 'number' ? <span className="mood-score">{score.toFixed(2)}</span> : null}
    </span>
  );
}
