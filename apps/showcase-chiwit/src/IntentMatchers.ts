/**
 * Cross-app intent matchers — when a sibling Shippie app emits one of
 * these intents, IntentToastHost surfaces a toast and Chiwit folds an
 * ambient signal into Today.
 *
 * NOTE: the spec table at §4.1 uses dot-namespaced kinds
 * (`coffee.brewed`, `workout.completed` …) but the actual emitted
 * intent kinds across this monorepo are hyphenated (verified against
 * `apps/showcase-coffee/shippie.json`, `apps/showcase-lift/shippie.json`,
 * `apps/showcase-breath/shippie.json`, `apps/showcase-cooking/shippie.json`,
 * and Chiwit's own `shippie.json#intents.consumes`). The matchers below
 * use the hyphenated names actually emitted, plus a dot-namespaced
 * alias for each so a future schema migration is non-breaking.
 *
 * Each matcher returns a `ToastSpec` for IntentToastHost. The "small
 * sibling-app icon" referenced in the brief is an emoji glyph passed
 * through `ToastSpec.icon` so we don't pull in an icon set.
 */
import type { IntentLike, IntentMatcher, ToastSpec } from '@shippie/showcase-kit-v2';

/** Map of canonical intent kind → which Chiwit ambient category it maps to. */
export type AmbientSignalKind = 'hydration' | 'movement' | 'mindful' | 'body' | 'sleep';

export interface AmbientMatch {
  /** Chiwit signal kind to write into the local DB. */
  signal: AmbientSignalKind;
  /** Sibling app slug (used for `source: 'app_<slug>'` + icon). */
  sourceApp: string;
  /** Display label written onto the signal note. */
  label: string;
  /** Sibling-app glyph used in toast + Today icon. */
  icon: string;
}

/**
 * Stable lookup from intent kind → ambient match. App.tsx imports this
 * alongside MATCHERS so it can resolve the ambient-write side of the
 * toast pipeline.
 */
export const AMBIENT_BY_KIND: Record<string, AmbientMatch> = {
  // Coffee — hydration boost, also implies a small energy nudge but
  // we keep the write narrow (hydration only) to avoid double-counting.
  'coffee-brewed': {
    signal: 'hydration',
    sourceApp: 'coffee',
    label: 'Coffee (Coffee Brewer)',
    icon: '☕',
  },
  'coffee.brewed': {
    signal: 'hydration',
    sourceApp: 'coffee',
    label: 'Coffee (Coffee Brewer)',
    icon: '☕',
  },
  'caffeine-logged': {
    signal: 'hydration',
    sourceApp: 'coffee',
    label: 'Caffeine logged',
    icon: '☕',
  },

  // Workout — movement factor.
  'workout-completed': {
    signal: 'movement',
    sourceApp: 'lift',
    label: 'Workout (Lift)',
    icon: '🏋️',
  },
  'workout.completed': {
    signal: 'movement',
    sourceApp: 'lift',
    label: 'Workout (Lift)',
    icon: '🏋️',
  },

  // Mindful — Mind factor (also Recovery in pulse breakdown).
  'mindful-session': {
    signal: 'mindful',
    sourceApp: 'breath',
    label: 'Breath session',
    icon: '🌬',
  },
  'mindful.completed': {
    signal: 'mindful',
    sourceApp: 'breath',
    label: 'Breath session',
    icon: '🌬',
  },

  // Meal cooked — Foundations factor (mapped to body signal).
  'cooked-meal': {
    signal: 'body',
    sourceApp: 'palate',
    label: 'Cooked meal (Palate)',
    icon: '🍲',
  },
  'meal.cooked': {
    signal: 'body',
    sourceApp: 'palate',
    label: 'Cooked meal (Palate)',
    icon: '🍲',
  },

  // Sleep — Recovery factor.
  'sleep-logged': {
    signal: 'sleep',
    sourceApp: 'sleep',
    label: 'Sleep logged elsewhere',
    icon: '🌙',
  },
  'sleep.logged': {
    signal: 'sleep',
    sourceApp: 'sleep',
    label: 'Sleep logged elsewhere',
    icon: '🌙',
  },

  // Hydration — direct boost. Already partial in Chiwit (sibling apps
  // can already broadcast hydration); kept for completeness.
  'hydration-logged': {
    signal: 'hydration',
    sourceApp: 'hydro',
    label: 'Hydration logged elsewhere',
    icon: '💧',
  },
  'hydration.logged': {
    signal: 'hydration',
    sourceApp: 'hydro',
    label: 'Hydration logged elsewhere',
    icon: '💧',
  },
};

function intentTitle(label: string): string {
  return `${label} folded into today`;
}

function intentBody(spec: AmbientMatch): string {
  switch (spec.signal) {
    case 'hydration': return 'folded into your garden · hydration';
    case 'movement':  return 'folded into your garden · movement';
    case 'mindful':   return 'folded into your garden · mind';
    case 'body':      return 'folded into your garden · body';
    case 'sleep':     return 'folded into your garden · sleep';
  }
}

function toToast(spec: AmbientMatch): (intent: IntentLike) => ToastSpec {
  return (_intent) => ({
    title: intentTitle(spec.label),
    body: intentBody(spec),
    href: `?tab=today&source=intent-${encodeURIComponent(spec.sourceApp)}`,
    icon: spec.icon,
  });
}

/**
 * The 6 intent kinds called out in spec §4.1 (one matcher per row in
 * the table). Each matcher resolves to a toast spec; the ambient-write
 * side reads `AMBIENT_BY_KIND` directly in App.tsx.
 */
export const MATCHERS: IntentMatcher[] = [
  { kind: 'coffee-brewed',     toast: toToast(AMBIENT_BY_KIND['coffee-brewed']!),     throttleMs: 60_000 },
  { kind: 'workout-completed', toast: toToast(AMBIENT_BY_KIND['workout-completed']!), throttleMs: 60_000 },
  { kind: 'mindful-session',   toast: toToast(AMBIENT_BY_KIND['mindful-session']!),   throttleMs: 60_000 },
  { kind: 'cooked-meal',       toast: toToast(AMBIENT_BY_KIND['cooked-meal']!),       throttleMs: 60_000 },
  { kind: 'sleep-logged',      toast: toToast(AMBIENT_BY_KIND['sleep-logged']!),      throttleMs: 60_000 },
  { kind: 'hydration-logged',  toast: toToast(AMBIENT_BY_KIND['hydration-logged']!),  throttleMs: 60_000 },
];

/** Kinds we care about — used by the App.tsx adapter to subscribe. */
export const MATCHED_KINDS: readonly string[] = MATCHERS.map((m) => m.kind);

/**
 * Build a `ToastSpec` for a given kind without going through the
 * IntentToastHost pipeline — used by `elevation.test.tsx`.
 */
export function specForKind(kind: string): ToastSpec | null {
  const match = AMBIENT_BY_KIND[kind];
  if (!match) return null;
  return toToast(match)({ kind });
}
