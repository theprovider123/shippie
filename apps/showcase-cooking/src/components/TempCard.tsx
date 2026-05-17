/**
 * Tiny temp-card chip — surfaces the safe + ideal pull-temp for a cut
 * inline on each method guide. Tap to expand the full reference card.
 */

import type { Cut } from '../data.ts';
import { tempCardFor } from '../data.ts';

interface TempCardProps {
  cut: Cut;
  /** When true, render the full note. Otherwise show inline pill only. */
  expanded?: boolean;
}

export function TempCard({ cut, expanded = false }: TempCardProps) {
  const entry = tempCardFor(cut);
  if (!entry) return null;
  return (
    <div className={`temp-card ${expanded ? 'temp-card--expanded' : ''}`}>
      <div className="temp-card-row">
        <span className="eyebrow">safe</span>
        <span className="temp-pill">{entry.safe_c}°C</span>
        <span className="eyebrow">ideal pull</span>
        <span className="temp-pill temp-pill--ideal">{entry.ideal_c}°C</span>
      </div>
      {expanded ? <p className="muted small temp-note">{entry.note}</p> : null}
    </div>
  );
}
