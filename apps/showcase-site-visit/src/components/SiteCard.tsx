/**
 * Site card — the unit of the site library. Tap-target sized for a
 * gloved finger. Address sits below the name; tapping anywhere on the
 * card opens the site detail page.
 */

import type { Site } from '../db/schema.ts';

export interface SiteCardProps {
  site: Site;
  visitCount: number;
  onOpen: () => void;
}

export function SiteCard({ site, visitCount, onOpen }: SiteCardProps) {
  return (
    <button type="button" className="site-card" onClick={onOpen}>
      <span className="site-card__name">{site.name}</span>
      {site.address ? <span className="site-card__address">{site.address}</span> : null}
      <span className="site-card__meta">
        {visitCount === 0
          ? 'no visits yet'
          : visitCount === 1
            ? '1 visit'
            : `${visitCount} visits`}
      </span>
    </button>
  );
}
