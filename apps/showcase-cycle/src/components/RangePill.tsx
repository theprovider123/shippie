/**
 * RangePill — visual primitive that always renders a date RANGE.
 *
 * Voice doc invariant: predicted dates are never a single point.
 * Even high-confidence predictions show a 2-day window. This
 * component is the place we enforce that — there is no "single date"
 * variant.
 */
import { formatRange } from '../lib/predict.ts';
import type { Confidence } from '../lib/predict.ts';

export interface RangePillProps {
  range: [string, string];
  confidence?: Confidence;
  label?: string;
}

const CONFIDENCE_COPY: Record<Confidence, string> = {
  high: 'tight prediction',
  medium: 'a few days variance',
  low: 'wide window',
};

export function RangePill({ range, confidence, label }: RangePillProps) {
  return (
    <span className={confidence ? `range-pill ${confidence}` : 'range-pill'}>
      {label ? <em>{label}</em> : null}
      <strong>{formatRange(range)}</strong>
      {confidence ? <small>{CONFIDENCE_COPY[confidence]}</small> : null}
    </span>
  );
}
