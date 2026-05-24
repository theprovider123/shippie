import type { RoutePoiKind } from '../data/parade-2026';

/**
 * One-tap chips above the map for the five most-asked questions during the
 * parade — "where's a toilet / water / station / pub / food?" Tapping a chip
 * surfaces the nearest matches on the map and draws a walking line to the
 * closest one. Tapping again clears.
 */
export type QuickFindCategory = 'toilet' | 'water' | 'station' | 'pub' | 'food';

interface QuickFindChipsProps {
  active: QuickFindCategory | null;
  onPick: (category: QuickFindCategory | null) => void;
}

const CHIP_LABEL: Record<QuickFindCategory, string> = {
  toilet: 'Toilet',
  water: 'Water',
  station: 'Station',
  pub: 'Pub',
  food: 'Food',
};

const CHIP_ORDER: QuickFindCategory[] = ['toilet', 'water', 'station', 'pub', 'food'];

export function QuickFindChips({ active, onPick }: QuickFindChipsProps) {
  return (
    <div className="quick-find" role="group" aria-label="Find nearby">
      <span className="quick-find__label" aria-hidden>
        Find
      </span>
      {CHIP_ORDER.map((category) => {
        const isActive = active === category;
        return (
          <button
            key={category}
            type="button"
            className={`quick-find__chip ${isActive ? 'is-active' : ''}`}
            aria-pressed={isActive}
            onClick={() => onPick(isActive ? null : category)}
          >
            {CHIP_LABEL[category]}
          </button>
        );
      })}
    </div>
  );
}

/** Map a chip category to the set of POI kinds it surfaces. */
export function kindsForCategory(category: QuickFindCategory): RoutePoiKind[] {
  if (category === 'station') return ['station', 'tube-exit'];
  if (category === 'toilet') return ['toilet'];
  if (category === 'water') return ['water'];
  if (category === 'pub') return ['pub'];
  if (category === 'food') return ['food'];
  return [];
}
