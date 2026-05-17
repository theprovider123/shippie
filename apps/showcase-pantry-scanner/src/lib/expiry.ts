/**
 * Expiry helpers — pure functions over `Item.expiresOn`.
 *
 * Bucketing is the kitchen-counter view: "use today", "use this week",
 * "fresh", "no date", "expired". Sorting is "soonest first" with
 * undated items pushed to the bottom.
 */
import type { Item } from './types.ts';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type ExpiryBucket =
  | 'expired'
  | 'use-today'
  | 'use-soon'
  | 'this-week'
  | 'fresh'
  | 'no-date';

export const BUCKET_LABELS: Record<ExpiryBucket, string> = {
  expired: 'expired',
  'use-today': 'use today',
  'use-soon': 'use within 3 days',
  'this-week': 'use this week',
  fresh: 'fresh',
  'no-date': 'no date',
};

export const BUCKET_ORDER: readonly ExpiryBucket[] = [
  'expired',
  'use-today',
  'use-soon',
  'this-week',
  'fresh',
  'no-date',
];

/**
 * Days from `now` until `dateStr`. Negative when the date is in the past.
 * Returns `Number.POSITIVE_INFINITY` for unparseable input so callers
 * can treat "no date" as "infinitely fresh" without a branch.
 */
export function daysUntil(dateStr: string, now: number = Date.now()): number {
  const target = Date.parse(dateStr);
  if (!Number.isFinite(target)) return Number.POSITIVE_INFINITY;
  // Normalise both sides to local-midnight so a row scanned at 11pm
  // doesn't read as "expires in 0 days" the morning of the use-by.
  const targetMidnight = new Date(target);
  targetMidnight.setHours(0, 0, 0, 0);
  const nowMidnight = new Date(now);
  nowMidnight.setHours(0, 0, 0, 0);
  return Math.round(
    (targetMidnight.getTime() - nowMidnight.getTime()) / ONE_DAY_MS,
  );
}

export function bucketFor(item: Item, now: number = Date.now()): ExpiryBucket {
  if (!item.expiresOn) return 'no-date';
  const days = daysUntil(item.expiresOn, now);
  if (!Number.isFinite(days)) return 'no-date';
  if (days < 0) return 'expired';
  if (days === 0) return 'use-today';
  if (days <= 3) return 'use-soon';
  if (days <= 7) return 'this-week';
  return 'fresh';
}

/**
 * Sort key for "soonest first". Undated rows get a large finite key so
 * they fall to the bottom but stable-sort within themselves.
 */
export function expirySortKey(item: Item): number {
  if (!item.expiresOn) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(item.expiresOn);
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

export function sortBySoonestExpiry<T extends Item>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => expirySortKey(a) - expirySortKey(b));
}

/**
 * Items that need attention "now-ish" — anything in the use-today,
 * use-soon, or expired buckets, sorted soonest-first.
 */
export function urgentItems<T extends Item>(
  items: readonly T[],
  now: number = Date.now(),
): T[] {
  return sortBySoonestExpiry(
    items.filter((it) => {
      const b = bucketFor(it, now);
      return b === 'expired' || b === 'use-today' || b === 'use-soon';
    }),
  );
}

/**
 * Group items by bucket. Bucket keys appear in BUCKET_ORDER even when
 * empty — callers can render headers in stable order without sorting.
 */
export function groupByBucket<T extends Item>(
  items: readonly T[],
  now: number = Date.now(),
): Record<ExpiryBucket, T[]> {
  const out: Record<ExpiryBucket, T[]> = {
    expired: [],
    'use-today': [],
    'use-soon': [],
    'this-week': [],
    fresh: [],
    'no-date': [],
  };
  for (const it of sortBySoonestExpiry(items)) {
    out[bucketFor(it, now)].push(it);
  }
  return out;
}

/**
 * Format a days-until count as a kitchen-pragmatic phrase.
 * No exclamation marks. No coaching.
 */
export function phraseDays(days: number): string {
  if (!Number.isFinite(days)) return 'no date';
  if (days < 0) {
    const ago = Math.abs(days);
    return ago === 1 ? '1 day past' : `${ago} days past`;
  }
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}
