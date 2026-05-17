/**
 * One aisle group in the list. Just a heading + slot for ItemRows.
 * Lives as its own component so we can drop in animation later
 * without churning the page.
 */
import type { ReactNode } from 'react';
import type { Aisle } from '../AisleClassifier.tsx';
import { aisleLabel } from '../AisleClassifier.tsx';

interface AisleSectionProps {
  aisle: Aisle;
  count: number;
  children: ReactNode;
}

export function AisleSection({ aisle, count, children }: AisleSectionProps) {
  return (
    <section className="aisle-group" aria-label={`Aisle: ${aisleLabel(aisle)}`}>
      <h3>
        <span>{aisleLabel(aisle)}</span>
        <span className="aisle-count">{count}</span>
      </h3>
      <ul>{children}</ul>
    </section>
  );
}
