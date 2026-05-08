import { describeEatBy } from '../lib/leftover-tracker.ts';
import type { LeftoverRow } from '../lib/types.ts';

interface LeftoverBadgeProps {
  row: LeftoverRow;
  onDismiss?: (id: string) => void;
}

export function LeftoverBadge({ row, onDismiss }: LeftoverBadgeProps) {
  const phrase = describeEatBy(row.eatBy);
  return (
    <div className="leftover" role="status">
      <div className="leftover-text">
        <strong>{row.recipeName}</strong>
        <span>
          {row.servings} serving{row.servings === 1 ? '' : 's'} in fridge — {phrase}
        </span>
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="ghost link"
          onClick={() => onDismiss(row.id)}
          aria-label="Dismiss leftover"
        >
          Eaten
        </button>
      ) : null}
    </div>
  );
}
