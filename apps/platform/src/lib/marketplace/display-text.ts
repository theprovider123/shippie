/**
 * Display text normalisation for marketplace surfaces.
 *
 * Server + client both import from here. No string munging inside
 * components — call the helpers so the rules stay in one place.
 */

import type { AppKind } from '$lib/types/app-kind';

// One label per controlled category in VALID_CATEGORIES, plus a few
// surface/legacy aliases that still surface in older data. `displayCategory`
// title-cases anything missing, so this only needs the friendlier names.
export const CATEGORY_LABELS: Record<string, string> = {
  // Controlled vocab (keep in sync with curation/schema.ts VALID_CATEGORIES)
  'food-drink': 'Food & drink',
  'health-fitness': 'Health & fitness',
  social: 'Social',
  games: 'Games',
  tools: 'Tools',
  creative: 'Creative',
  productivity: 'Productivity',
  lifestyle: 'Lifestyle',
  // Surface alias (the /arcade rail labels its surface this way)
  arcade: 'Arcade',
};

/**
 * Slug → human label. Unknown slugs are title-cased on the wire so a
 * new category doesn't render as `ux-research` until someone updates
 * the table.
 */
export function displayCategory(slug: string | null | undefined): string {
  if (!slug) return 'Tools';
  const known = CATEGORY_LABELS[slug];
  if (known) return known;
  return slug
    .split(/[-_\s]+/)
    .map((part) => (part.length ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

export const TITLE_MAX = 32;

/**
 * Trim and hard-cap title to TITLE_MAX. The card itself wraps to two
 * lines via line-clamp; this is the catastrophic-input floor.
 */
export function titleCap(name: string | null | undefined, max = TITLE_MAX): string {
  const cleaned = (name ?? '').trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1).trimEnd() + '…';
}

export const BLURB_MIN = 80;
export const BLURB_MAX = 110;

/**
 * Clip description to BLURB_MAX with a soft word-boundary break. We
 * never expand short blurbs — that's a content job, not a runtime one.
 * The card uses line-clamp for visual fade; this cap is the data floor
 * so screen-reader output and og:description don't run away.
 */
export function normaliseBlurb(text: string | null | undefined, max = BLURB_MAX): string {
  const cleaned = (text ?? '').trim().replace(/\s+/g, ' ');
  if (cleaned.length <= max) return cleaned;
  const slice = cleaned.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  const trimmed = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return trimmed.replace(/[.,;:!?-]+$/, '') + '…';
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Recency label for a "last opened" timestamp. Returns null past the
 * 7-day window so cards stop carrying stale recency.
 */
export function formatRecency(
  lastOpened: number | string | Date | null | undefined,
  now: number = Date.now(),
): string | null {
  if (lastOpened == null) return null;
  const opened = lastOpened instanceof Date ? lastOpened.getTime() : new Date(lastOpened).getTime();
  if (!Number.isFinite(opened)) return null;
  const diff = now - opened;
  if (diff < 0) return 'Just now';
  if (diff < HOUR_MS) return 'Just now';
  if (diff < DAY_MS) return 'Opened today';
  const days = Math.floor(diff / DAY_MS);
  if (days >= 7) return null;
  if (days === 1) return 'Opened 1 day ago';
  return `Opened ${days} days ago`;
}

export function kindPillLabel(kind: AppKind | null | undefined): string | null {
  if (kind === 'connected') return 'connected';
  if (kind === 'cloud') return 'cloud';
  return null;
}

export function kindAriaLabel(kind: AppKind | null | undefined): string {
  if (kind === 'local') return 'Local app — runs on this device, works offline';
  if (kind === 'connected') return 'Connected app — local data plus live signals';
  if (kind === 'cloud') return 'Cloud app — needs internet, data lives at the maker';
  return 'App kind not yet verified';
}
