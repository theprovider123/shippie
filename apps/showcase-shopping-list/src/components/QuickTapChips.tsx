/**
 * One-tap pills above the list. Tap a chip → adds to the live list.
 * The chip set is recomputed from the user's tally (and seeds) any
 * time the live list changes — so once "milk" is on the list, the
 * chip disappears until checked-cleared.
 */
import type { ReactNode } from 'react';

interface QuickTapChipsProps {
  chips: readonly string[];
  onTap: (name: string) => void;
  /** Optional trailing slot — used to host the photo/voice button. */
  trailing?: ReactNode;
}

export function QuickTapChips({ chips, onTap, trailing }: QuickTapChipsProps) {
  if (chips.length === 0 && !trailing) return null;
  return (
    <div className="quick-tap" role="toolbar" aria-label="Quick add">
      {chips.map((name) => (
        <button
          type="button"
          key={name}
          className="chip"
          onClick={() => onTap(name)}
          aria-label={`Add ${name}`}
        >
          + {name}
        </button>
      ))}
      {trailing}
    </div>
  );
}
