/**
 * Location filter strip — chips for fridge / pantry / freezer / spice
 * rack plus an "all" reset. Counts on the chip make the inventory
 * scannable without expanding the rows.
 */
import type { Item, Location } from '../lib/types.ts';
import { LOCATIONS, LOCATION_LABELS } from '../lib/types.ts';

interface LocationFilterProps {
  items: readonly Item[];
  active: Location | 'all';
  onChange: (next: Location | 'all') => void;
}

export function LocationFilter({
  items,
  active,
  onChange,
}: LocationFilterProps) {
  const counts: Record<Location | 'all', number> = {
    all: items.length,
    fridge: 0,
    pantry: 0,
    freezer: 0,
    'spice-rack': 0,
  };
  for (const it of items) counts[it.location] += 1;

  return (
    <div className="loc-filter" role="tablist" aria-label="Filter by location">
      <button
        type="button"
        role="tab"
        aria-selected={active === 'all'}
        className={`loc-chip ${active === 'all' ? 'active' : ''}`}
        onClick={() => onChange('all')}
      >
        All <span className="loc-count">{counts.all}</span>
      </button>
      {LOCATIONS.map((loc) => (
        <button
          key={loc}
          type="button"
          role="tab"
          aria-selected={active === loc}
          className={`loc-chip ${active === loc ? 'active' : ''}`}
          onClick={() => onChange(loc)}
        >
          {LOCATION_LABELS[loc]}{' '}
          <span className="loc-count">{counts[loc]}</span>
        </button>
      ))}
    </div>
  );
}
