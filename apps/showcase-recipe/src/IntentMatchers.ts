/**
 * Cross-app intent matchers for Palate (spec §5.6).
 *
 *   - `pantry-low` from Pantry Scanner → badge "<item> low (via Pantry Scanner)"
 *   - `cooked-meal` from another Palate household device → cheer toast
 *   - `cooking-now` from another Palate device → cook-along invite toast
 *
 * Match Room's intent-bridge precedent (apps/showcase-match-room/src/lib/intent-bridge.ts)
 * inspired the shape: matchers return a `ToastSpec` keyed by intent.kind,
 * then the kit's IntentToastHost de-dupes + throttles + renders.
 */
import type { IntentMatcher, ToastSpec, IntentLike } from '@shippie/showcase-kit-v2';

/** Read a string field out of an intent payload row, if present. */
function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = (value as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : undefined;
}

function firstRow(intent: IntentLike): Record<string, unknown> | undefined {
  const payload = intent.payload;
  if (!payload || typeof payload !== 'object') return undefined;
  const rows = (payload as { rows?: unknown }).rows;
  if (!Array.isArray(rows) || rows.length === 0) return undefined;
  const first = rows[0];
  return first && typeof first === 'object' ? (first as Record<string, unknown>) : undefined;
}

/** `pantry-low` → "garlic low (via Pantry Scanner)" badge on the Pantry tab. */
export const pantryLowMatcher: IntentMatcher = {
  kind: 'pantry-low',
  throttleMs: 30_000,
  toast: (intent) => {
    const row = firstRow(intent);
    const item = readString(row, 'name') ?? 'a pantry staple';
    const source = intent.sourceAppId === 'app_pantry-scanner' ? ' (via Pantry Scanner)' : '';
    const spec: ToastSpec = {
      title: `${item} low${source}`,
      body: 'Tap to open Pantry.',
      href: '?tab=pantry',
      icon: '🥫',
    };
    return spec;
  },
};

/** Another Palate device in the household just finished cooking. */
export const cookedMealMatcher: IntentMatcher = {
  kind: 'cooked-meal',
  throttleMs: 30_000,
  toast: (intent) => {
    const row = firstRow(intent);
    const title = readString(row, 'title') ?? 'a planned meal';
    const spec: ToastSpec = {
      title: `Someone cooked ${title}`,
      body: 'Household update.',
      icon: '🍲',
    };
    return spec;
  },
};

/** Another Palate device just opened CookMode — offer to cook together. */
export const cookingNowMatcher: IntentMatcher = {
  kind: 'cooking-now',
  throttleMs: 15_000,
  toast: (intent) => {
    const row = firstRow(intent);
    const title = readString(row, 'title') ?? 'a recipe';
    const spec: ToastSpec = {
      title: `Cook ${title} together?`,
      body: 'Another phone is following the same recipe.',
      href: '?tab=today&cookalong=1',
      icon: '🌿',
    };
    return spec;
  },
};

/** Bundled matcher set the App wires into <IntentToastHost>. */
export const palateMatchers: IntentMatcher[] = [
  pantryLowMatcher,
  cookedMealMatcher,
  cookingNowMatcher,
];
