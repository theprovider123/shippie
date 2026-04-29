/**
 * Catalogue of the 8 showcase apps the C2 launch demo features.
 * Each entry pins which capability it must prove end-to-end so the
 * release pipeline can run a per-capability assertion before the
 * 2-minute demo recording is re-cut.
 */
import type { AppTemplate } from './types.ts';

export interface ShowcaseAppEntry extends AppTemplate {
  /**
   * Cluster grouping for the demo recording's narrative arc. P4
   * introduced productivity + memory clusters on top of the original
   * food + health pair.
   */
  cluster: 'food' | 'health' | 'productivity' | 'memory';
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
    intents: {
      provides: ['shopping-list', 'cooked-meal', 'cooking-now'],
      consumes: ['pantry-inventory'],
    },
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
    intents: { provides: ['pantry-inventory', 'pantry-low'] },
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
      consumes: ['shopping-list', 'pantry-inventory', 'budget-limit', 'cooked-meal'],
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
    intents: {
      provides: ['needs-restocking'],
      consumes: ['shopping-list', 'pantry-low'],
    },
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
    intents: { provides: ['workout-completed'], consumes: ['sleep-logged'] },
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
    intents: {
      provides: ['sleep-logged'],
      consumes: ['workout-completed', 'caffeine-logged'],
    },
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
    intents: { provides: ['body-metrics-logged'] },
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

  // ---- P4A — micro-logger configs (single-tap loggers) ----
  {
    id: 'caffeine-log',
    name: 'Caffeine Log',
    description: 'Single-tap to log a coffee or tea. Sleep Logger correlates the timing.',
    category: 'tracker',
    cluster: 'health',
    shippieCategory: 'fitness',
    themeColor: '#8B5A3C',
    proves: {
      capability: 'micro-logger config (sparkline) + cross-app intent',
      assertion: 'Tapping the button broadcasts caffeine-logged. Sleep Logger and Mood Pulse subscribers see the event.',
    },
    intents: { provides: ['caffeine-logged'] },
  },
  {
    id: 'hydration',
    name: 'Hydration',
    description: 'Daily water target with cooked-meal subscription that nudges +1 glass.',
    category: 'tracker',
    cluster: 'health',
    shippieCategory: 'fitness',
    themeColor: '#4E7C9A',
    proves: {
      capability: 'micro-logger config (count chart) + cross-cluster subscription',
      assertion: 'Each tap broadcasts hydration-logged; cooked-meal subscription nudges the daily target.',
    },
    intents: { provides: ['hydration-logged'], consumes: ['cooked-meal'] },
  },
  {
    id: 'mood-pulse',
    name: 'Mood Pulse',
    description: 'Three-second mood tap. Correlates against caffeine, workouts, and sleep.',
    category: 'tracker',
    cluster: 'health',
    shippieCategory: 'fitness',
    themeColor: '#B45CB6',
    proves: {
      capability: 'micro-logger config (sparkline) + 3-intent subscription',
      assertion: 'Score broadcasts mood-logged; live correlation overlay surfaces against caffeine + workout + sleep events.',
    },
    intents: {
      provides: ['mood-logged'],
      consumes: ['caffeine-logged', 'workout-completed', 'sleep-logged'],
    },
  },
  {
    id: 'symptom-tracker',
    name: 'Symptom Tracker',
    description: 'Aches, allergies, headaches with severity. Heatmap surfaces patterns over weeks.',
    category: 'tracker',
    cluster: 'health',
    shippieCategory: 'fitness',
    themeColor: '#C97A4B',
    proves: {
      capability: 'micro-logger config (heatmap) + multi-week pattern view',
      assertion: 'Each entry broadcasts symptom-logged; heatmap renders 8-week severity grid.',
    },
    intents: { provides: ['symptom-logged'] },
  },
  {
    id: 'steps-counter',
    name: 'Steps Counter',
    description: "DeviceMotion-driven step count. Doesn't double-count gym sessions.",
    category: 'tracker',
    cluster: 'health',
    shippieCategory: 'fitness',
    themeColor: '#5EA777',
    proves: {
      capability: 'micro-logger config (sparkline) + workout-completed subtraction',
      assertion: 'Subscribes to workout-completed and excludes overlapping windows from the daily count.',
    },
    intents: { provides: ['walked'], consumes: ['workout-completed'] },
  },

  // ---- P4B — productivity ----
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    description: 'Classic 25/5 cycle with a long break every 4 cycles. Broadcasts focus-session.',
    category: 'tracker',
    cluster: 'productivity',
    shippieCategory: 'productivity',
    themeColor: '#E8603C',
    proves: {
      capability: 'pure state machine + sensory layer + cross-app intent',
      assertion: 'Each completed focus phase broadcasts focus-session; navigate texture fires on every phase boundary.',
    },
    intents: { provides: ['focus-session'] },
  },
  {
    id: 'read-later',
    name: 'Read Later',
    description: 'Save articles via the SSRF-guarded proxy; Readability extraction; mood-suggested short reads.',
    category: 'crud-with-search',
    cluster: 'productivity',
    shippieCategory: 'productivity',
    themeColor: '#3F51B5',
    proves: {
      capability: 'P1C SSRF proxy + Readability extraction + mood-aware sort',
      assertion: 'Fetches go through /__shippie/proxy with full SSRF guards; extracted HTML stored locally; low-mood sort prioritises short reads.',
    },
    intents: { consumes: ['mood-logged'] },
  },
  {
    id: 'daily-briefing',
    name: 'Daily Briefing',
    description: 'Morning rundown. Subscribes to 9 intents from other Shippie apps and renders one screen.',
    category: 'tracker',
    cluster: 'productivity',
    shippieCategory: 'productivity',
    themeColor: '#74A57F',
    proves: {
      capability: '9-intent consumer + agent.insights ribbon',
      assertion: 'Renders 24h activity grid for 9 subscribed intents and surfaces insights from agent.insights with the source-data invariant.',
    },
    intents: {
      consumes: [
        'cooked-meal',
        'workout-completed',
        'sleep-logged',
        'caffeine-logged',
        'mood-logged',
        'hydration-logged',
        'body-metrics-logged',
        'symptom-logged',
        'focus-session',
      ],
    },
  },

  // ---- P4C — memory + social ----
  {
    id: 'restaurant-memory',
    name: 'Restaurant Memory',
    description: 'Photos + notes per restaurant, on-device only. Tracks home-vs-out ratio against cooked-meal.',
    category: 'camera-and-ai',
    cluster: 'memory',
    shippieCategory: 'lifestyle',
    themeColor: '#A86060',
    proves: {
      capability: 'IndexedDB photos + Geolocation (local) + cross-app ratio',
      assertion: 'Photos and coordinates persist in IndexedDB only; dined-out broadcast carries name + rating; cooked-meal subscription drives the home-vs-out ratio.',
    },
    intents: { provides: ['dined-out'], consumes: ['cooked-meal'] },
  },
  {
    id: 'show-and-tell',
    name: 'Show & Tell',
    description: 'Mesh-only ephemeral scratchpad. Auto-clears when the room empties.',
    category: 'collaborative',
    cluster: 'memory',
    shippieCategory: 'social',
    themeColor: '#E0B345',
    proves: {
      capability: '@shippie/proximity Group + ephemeral-only contract',
      assertion: 'Posts broadcast over the mesh group; nothing persists across sessions; local list wipes 30s after the room empties.',
    },
  },
];

export const foodCluster = showcaseCatalog.filter((e) => e.cluster === 'food');
export const healthCluster = showcaseCatalog.filter((e) => e.cluster === 'health');
export const productivityCluster = showcaseCatalog.filter((e) => e.cluster === 'productivity');
export const memoryCluster = showcaseCatalog.filter((e) => e.cluster === 'memory');

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
