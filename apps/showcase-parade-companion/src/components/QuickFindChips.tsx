import type { RoutePoiKind } from '../data/parade-2026';

/**
 * One-tap chips above the map for stable, offline-safe needs. We deliberately
 * keep volatile food/pub "open now" data out of this static surface; pop-ups
 * and open/closed places travel through peer reports instead.
 */
export type QuickFindCategory = 'toilet' | 'water' | 'station' | 'atm';

interface QuickFindChipsProps {
  active: QuickFindCategory | null;
  onPick: (category: QuickFindCategory | null) => void;
}

const CHIP_LABEL: Record<QuickFindCategory, string> = {
  toilet: 'WC',
  water: 'Water',
  station: 'Station',
  atm: 'ATM',
};

const CHIP_ORDER: QuickFindCategory[] = ['toilet', 'water', 'station', 'atm'];

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
  if (category === 'atm') return ['atm'];
  return [];
}
