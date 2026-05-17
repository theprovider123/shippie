/**
 * Per-item per-store price comparison. Shows latest known price at
 * each store and flags the cheapest. Honest about being estimates.
 */
import type { ListItem, StoreProfile } from '../lib/types.ts';
import { cheapestStore, formatPence, latestPerStore } from '../lib/price-track.ts';

interface PriceCompareProps {
  item: ListItem;
  profiles: readonly StoreProfile[];
}

export function PriceCompare({ item, profiles }: PriceCompareProps) {
  const latest = latestPerStore(item.prices);
  const cheapest = cheapestStore(item.prices);
  const entries = profiles
    .map((p) => ({ profile: p, pence: latest[p.id] }))
    .filter((e): e is { profile: StoreProfile; pence: number } => e.pence !== undefined)
    .sort((a, b) => a.pence - b.pence);

  if (entries.length === 0) {
    return (
      <div className="price-compare empty">
        <strong>{item.name}</strong>
        <span className="hint">no prices logged yet</span>
      </div>
    );
  }
  return (
    <div className="price-compare">
      <strong>{item.name}</strong>
      <ul>
        {entries.map(({ profile, pence }) => (
          <li key={profile.id} className={cheapest?.storeId === profile.id ? 'cheapest' : ''}>
            <span>{profile.name}</span>
            <span className="pence">{formatPence(pence)}</span>
            {cheapest?.storeId === profile.id && entries.length > 1 ? (
              <span className="badge">cheapest</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
