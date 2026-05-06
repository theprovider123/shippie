import type { ReactElement } from 'react';
import type { TodayTotals as Totals } from '../db/queries.ts';

interface TodayTotalsProps {
  totals: Totals;
}

/**
 * One short sentence across the bottom showing today's footprint
 * across the four modes. Voice rule: no exclamation points, no
 * pluralization gymnastics — "1 brews" is fine, the user knows.
 */
export function TodayTotals({ totals }: TodayTotalsProps): ReactElement {
  const parts: string[] = [];
  if (totals.brews) parts.push(`${totals.brews} ${plural('brew', totals.brews)}`);
  if (totals.bakes_started) parts.push(`${totals.bakes_started} bake started`);
  if (totals.meals_cooked) parts.push(`${totals.meals_cooked} ${plural('meal', totals.meals_cooked)} cooked`);
  if (totals.drinks) parts.push(`${totals.drinks} ${plural('drink', totals.drinks)}`);

  return (
    <div className="today-totals" aria-label="Today's totals">
      {parts.length === 0 ? (
        <span className="today-totals-empty">Nothing logged today yet.</span>
      ) : (
        <span>{parts.join(' · ')} today</span>
      )}
    </div>
  );
}

function plural(word: string, n: number): string {
  return n === 1 ? word : `${word}s`;
}
