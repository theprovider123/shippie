/**
 * Catalogue of the 8 showcase apps the C2 launch demo features.
 * Each entry pins which capability it must prove end-to-end so the
 * release pipeline can run a per-capability assertion before the
 * 2-minute demo recording is re-cut.
 */
import type { AppTemplate } from './types.ts';

export interface ShowcaseAppEntry extends AppTemplate {
  /** Cluster grouping for the demo recording's narrative arc. */
  cluster: 'food' | 'health';
}

export const showcaseCatalog: readonly ShowcaseAppEntry[] = [
  // ---- Food cluster ----
  {
    id: 'recipe-saver',
    name: 'Recipe Saver',
    description: 'Save recipes, read offline, keep cooking notes on this device.',
    category: 'crud-with-search',
    cluster: 'food',
    shippieCategory: 'cooking',
    themeColor: '#E8603C',
    proves: {
      capability: 'dom-auto-enhancement + local-db + vision-ai',
      assertion: 'Photo upload tagged via vision-ai; recipes persist via local-db; zero shippie.json rules required for textures + wakelock.',
    },
    intents: { provides: ['shopping-list', 'cooked-meal'] },
  },
  {
    id: 'pantry-scanner',
    name: 'Pantry Scanner',
    description: 'Scan barcodes, recognize products with on-device vision, track what you have.',
    category: 'camera-and-ai',
    cluster: 'food',
    shippieCategory: 'cooking',
    themeColor: '#74A57F',
    proves: {
      capability: 'device-api (barcode) + local-vision-ai + camera-as-sensor',
      assertion: 'Barcode scan resolves via local model; no network round-trip required for recognition.',
    },
    intents: { provides: ['pantry-inventory'] },
  },
  {
    id: 'meal-planner',
    name: 'Meal Planner',
    description: 'Plan a week of meals from your saved recipes and pantry contents.',
    category: 'crud-with-search',
    cluster: 'food',
    shippieCategory: 'cooking',
    themeColor: '#E8603C',
    proves: {
      capability: 'cross-app-intents (consumes recipes + pantry + budget) + local-agent-insights',
      assertion: 'On open, agent insight "Plan meals from your new recipes" appears; tapping deep-links to /new.',
    },
    intents: {
      provides: ['shopping-list'],
      consumes: ['shopping-list', 'pantry-inventory', 'budget-limit'],
    },
  },
  {
    id: 'shopping-list',
    name: 'Shopping List',
    description: 'A live shopping list that pulls from your meal plan and shares with people in the room.',
    category: 'collaborative',
    cluster: 'food',
    shippieCategory: 'tools',
    themeColor: '#4E7C9A',
    proves: {
      capability: 'cross-app-intents (consumes meal-plan) + mesh-sharing',
      assertion: 'Receives shopping-list rows from meal-planner; shares state across mesh group; works fully offline.',
    },
    intents: { consumes: ['shopping-list'] },
  },

  // ---- Health cluster ----
  {
    id: 'workout-logger',
    name: 'Workout Logger',
    description: 'Log strength sets, cardio intervals, and notice patterns in your training.',
    category: 'tracker',
    cluster: 'health',
    shippieCategory: 'fitness',
    themeColor: '#E8603C',
    proves: {
      capability: 'behavioural-pattern-learning + temporal-context + local-db',
      assertion: 'After 7 sessions, app suggests rest-day cadence inferred from row timestamps.',
    },
    intents: { provides: ['workout-completed'] },
  },
  {
    id: 'sleep-logger',
    name: 'Sleep Logger',
    description: 'Track sleep quality and surface correlations with workouts and caffeine.',
    category: 'tracker',
    cluster: 'health',
    shippieCategory: 'fitness',
    themeColor: '#4E7C9A',
    proves: {
      capability: 'cross-app-correlation (sleep × workout × caffeine)',
      assertion: 'Reads workout-completed + caffeine-logged intents; surfaces correlation only when 14+ days of overlap exist.',
    },
    intents: { consumes: ['workout-completed', 'caffeine-logged'] },
  },
  {
    id: 'body-metrics',
    name: 'Body Metrics',
    description: 'Track weight + body composition with private on-device photos for visual progress.',
    category: 'camera-and-ai',
    cluster: 'health',
    shippieCategory: 'fitness',
    themeColor: '#74A57F',
    proves: {
      capability: 'privacy-showcase (photos never leave device) + local-vision-ai',
      assertion: 'Photo capture stored in local-files only; no network egress on photo upload; vision-ai runs in worker.',
    },
  },
  {
    id: 'habit-tracker',
    name: 'Habit Tracker',
    description: 'Daily habits that auto-check from other apps when you complete the activity.',
    category: 'tracker',
    cluster: 'health',
    shippieCategory: 'fitness',
    themeColor: '#E8603C',
    proves: {
      capability: 'cross-cluster auto-completion via cross-app intents',
      assertion: 'When recipe-saver fires cooked-meal intent, "cooked-dinner" habit auto-checks; when workout-logger fires workout-completed, "exercise" habit auto-checks.',
    },
    intents: { consumes: ['cooked-meal', 'workout-completed'] },
  },
];

export const foodCluster = showcaseCatalog.filter((e) => e.cluster === 'food');
export const healthCluster = showcaseCatalog.filter((e) => e.cluster === 'health');

/**
 * The C2 cross-cluster acceptance test: an intent fired by a Food-cluster
 * app must reach a Health-cluster consumer. This pair is the minimal
 * proof point for the "ecosystem compounds" claim.
 */
export const crossClusterAcceptancePair = {
  provider: 'recipe-saver', // food cluster
  consumer: 'habit-tracker', // health cluster
  intent: 'cooked-meal',
} as const;
