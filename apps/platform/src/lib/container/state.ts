/**
 * Container shell — types, constants, pure helpers, and crypto helpers.
 *
 * Phase A1 of the post-codex plan splits `+page.svelte` (1389 lines) into
 * focused modules. This module owns everything that has no reactive state
 * or DOM dependency: data shapes, defaults, persistence schema, key
 * derivation, encrypted backup encode/decode.
 *
 * The Svelte component still owns reactive runes (`$state`, `$derived`,
 * `$effect`), DOM event listeners, and orchestration. Anything pure
 * lives here and can be unit-tested without a DOM.
 */

import {
  SHIPPIE_BACKUP_SCHEMA,
  SHIPPIE_PERMISSIONS_SCHEMA,
  createAppReceipt,
  type AppKind,
  type AppPermissions,
  type AppReceipt,
  type TrustReport,
} from '@shippie/app-package-contract';

export type ContainerSection = 'home' | 'create' | 'data';

export type ContainerApp = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  description: string;
  appKind: AppKind;
  entry: string;
  labelKind: 'Local' | 'Connected' | 'Cloud';
  icon: string;
  accent: string;
  version: string;
  packageHash: string;
  standaloneUrl: string;
  permissions: AppPermissions;
  trust?: Pick<TrustReport, 'containerEligibility' | 'privacy' | 'security'>;
  /** AppProfile category, used by C1 agent strategies. Optional. */
  category?: string;
  /**
   * Dev-only URL for the showcase's Vite dev server. When set, the
   * container loads this URL in the iframe instead of synthesising a
   * fixture page via `appSrcdoc`. Leave undefined in production.
   */
  devUrl?: string;
};

export type BridgeLog = {
  id: string;
  appId: string;
  at: string;
  capability: string;
  method: string;
  summary: string;
};

export type LocalRow = {
  id: string;
  table: string;
  payload: unknown;
  createdAt: string;
};

export type UpdateCard = {
  app: ContainerApp;
  receipt: AppReceipt;
  versionChanged: boolean;
  packageHashChanged: boolean;
  permissionsChanged: boolean;
  kindChanged: boolean;
  addedPermissions: string[];
  removedPermissions: string[];
  addedNetworkDomains: string[];
  removedNetworkDomains: string[];
  latestSecurityScore: number | null;
  latestPrivacyGrade: string | null;
  containerEligibility: string | null;
};

export type PackageFileCache = {
  mimeType: string;
  text?: string;
  dataUrl: string;
};

export type ContainerState = {
  openAppIds: string[];
  importedApps?: ContainerApp[];
  packageFilesByApp?: Record<string, Record<string, PackageFileCache>>;
  receiptsByApp: Record<string, AppReceipt>;
  rowsByApp: Record<string, LocalRow[]>;
  /** Phase A2 — cross-app intent grants. Per-pair `consumer → provider`. */
  intentGrants?: Record<string, Record<string, boolean>>;
  /** Phase P1A.3 — transferDrop grants. Per-pair `source → target`. */
  transferGrants?: Record<string, Record<string, boolean>>;
  /** Phase C1 — dismissed insight ids → ms timestamp of dismissal. */
  dismissedInsightIds?: Record<string, number>;
};

export const STORAGE_KEY = 'shippie.container.v1';

export const localPermissions = (
  namespace: string,
  intents?: {
    provides?: string[];
    consumes?: string[];
    /** P1A.3 — declared transfer-drop kinds this app can accept. */
    acceptsTransfer?: string[];
  },
): AppPermissions => ({
  schema: SHIPPIE_PERMISSIONS_SCHEMA,
  capabilities: {
    localDb: { enabled: true, namespace },
    localFiles: { enabled: true, namespace },
    feedback: { enabled: true },
    analytics: { enabled: true, mode: 'aggregate-only' },
    ...(intents && (intents.provides || intents.consumes)
      ? {
          crossAppIntents: {
            provides: intents.provides ?? [],
            consumes: intents.consumes ?? [],
          },
        }
      : {}),
    ...(intents?.acceptsTransfer && intents.acceptsTransfer.length > 0
      ? { acceptsTransfer: { kinds: intents.acceptsTransfer } }
      : {}),
  },
});

type CuratedAppSpec = {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  appKind: ContainerApp['appKind'];
  icon?: string;
  accent: string;
  category?: string;
  port: number;
  intents?: Parameters<typeof localPermissions>[1];
};

function labelKindForAppKind(kind: AppKind): ContainerApp['labelKind'] {
  if (kind === 'local') return 'Local';
  if (kind === 'cloud') return 'Cloud';
  return 'Connected';
}

function curatedApp(spec: CuratedAppSpec, index: number): ContainerApp {
  return {
    id: `app_${spec.slug.replace(/-/g, '_')}`,
    slug: spec.slug,
    name: spec.name,
    shortName: spec.shortName,
    description: spec.description,
    appKind: spec.appKind,
    entry: 'app/index.html',
    labelKind: labelKindForAppKind(spec.appKind),
    icon: spec.icon ?? initials(spec.name),
    accent: spec.accent,
    version: '1',
    packageHash: `sha256:${(index + 1).toString(16).slice(-1).repeat(64)}`,
    standaloneUrl: `/run/${spec.slug}`,
    permissions: localPermissions(spec.slug, spec.intents),
    category: spec.category,
    devUrl: `http://localhost:${spec.port}/`,
  };
}

const curatedAppSpecs: CuratedAppSpec[] = [
  {
    slug: 'recipe',
    name: 'Recipe Saver',
    shortName: 'Recipe',
    description: 'Save recipes, read them offline, and keep cooking notes on this device.',
    appKind: 'connected',
    icon: 'RS',
    accent: '#E8603C',
    category: 'cooking',
    port: 5180,
    intents: {
      provides: ['shopping-list', 'cooked-meal', 'cooking-now'],
      consumes: ['pantry-inventory'],
    },
  },
  {
    slug: 'journal',
    name: 'Journal',
    shortName: 'Journal',
    description: 'A private local journal with on-device sentiment and local-only entries.',
    appKind: 'local',
    icon: 'J',
    accent: '#3F6EE0',
    category: 'journal',
    port: 5181,
    intents: {
      consumes: ['shopping-list', 'cooked-meal', 'workout-completed', 'body-metrics-logged'],
    },
  },
  {
    slug: 'whiteboard',
    name: 'Whiteboard',
    shortName: 'Board',
    description: 'A shared sketch space for nearby groups and venue sessions.',
    appKind: 'connected',
    icon: 'WB',
    accent: '#4E7C9A',
    category: 'creativity',
    port: 5182,
  },
  {
    slug: 'live-room',
    name: 'Live Room',
    shortName: 'Live',
    description: 'Same-room quiz and buzzer sessions over the local mesh.',
    appKind: 'connected',
    icon: 'LR',
    accent: '#E8603C',
    category: 'social',
    port: 5183,
  },
  {
    slug: 'habit-tracker',
    name: 'Habit Tracker',
    shortName: 'Habits',
    description: 'Daily habits that auto-check when other Shippie apps emit matching events.',
    appKind: 'local',
    icon: 'HT',
    accent: '#5EA777',
    category: 'fitness',
    port: 5184,
    intents: { consumes: ['cooked-meal', 'workout-completed', 'mindful-session'] },
  },
  {
    slug: 'workout-logger',
    name: 'Workout Logger',
    shortName: 'Workouts',
    description: 'Log strength sets and cardio sessions. Detect your weekly cadence.',
    appKind: 'local',
    icon: 'WL',
    accent: '#E8603C',
    category: 'fitness',
    port: 5185,
    intents: {
      provides: ['workout-completed'],
      consumes: ['sleep-logged', 'run-planned'],
    },
  },
  {
    slug: 'pantry-scanner',
    name: 'Pantry Scanner',
    shortName: 'Pantry',
    description: 'Scan barcodes and identify pantry items with on-device vision.',
    appKind: 'local',
    icon: 'PS',
    accent: '#74A57F',
    category: 'cooking',
    port: 5186,
    intents: { provides: ['pantry-inventory', 'pantry-low'] },
  },
  {
    slug: 'meal-planner',
    name: 'Meal Planner',
    shortName: 'Meals',
    description: 'Plan a week of meals from your saved recipes and pantry contents.',
    appKind: 'local',
    icon: 'MP',
    accent: '#E8603C',
    category: 'cooking',
    port: 5187,
    intents: {
      provides: ['shopping-list'],
      consumes: ['shopping-list', 'pantry-inventory', 'budget-limit', 'cooked-meal'],
      acceptsTransfer: ['recipe'],
    },
  },
  {
    slug: 'shopping-list',
    name: 'Shopping List',
    shortName: 'Shopping',
    description: 'A live shopping list that pulls from meal plans and pantry lows.',
    appKind: 'local',
    icon: 'SH',
    accent: '#4E7C9A',
    category: 'tools',
    port: 5188,
    intents: {
      provides: ['needs-restocking'],
      consumes: ['shopping-list', 'pantry-low'],
    },
  },
  {
    slug: 'sleep-logger',
    name: 'Sleep Logger',
    shortName: 'Sleep',
    description: 'Track sleep quality. Surface correlations with workouts and caffeine.',
    appKind: 'local',
    icon: 'SL',
    accent: '#4E7C9A',
    category: 'fitness',
    port: 5189,
    intents: {
      provides: ['sleep-logged'],
      consumes: ['workout-completed', 'caffeine-logged'],
    },
  },
  {
    slug: 'body-metrics',
    name: 'Body Metrics',
    shortName: 'Body',
    description: 'Track weight and body photos. Photos never leave the device.',
    appKind: 'local',
    icon: 'BM',
    accent: '#74A57F',
    category: 'fitness',
    port: 5190,
    intents: { provides: ['body-metrics-logged'] },
  },
  {
    slug: 'mevrouw',
    name: 'Mevrouw',
    shortName: 'Mevrouw',
    description: 'A private space for two phones. Local-first; no server holds anything between you.',
    appKind: 'connected',
    icon: 'MV',
    accent: '#1F2A24',
    category: 'social',
    port: 5191,
  },
  {
    slug: 'breath',
    name: 'Breath',
    shortName: 'Breath',
    description: 'Quiet breathing patterns with a visual rhythm and no account.',
    appKind: 'local',
    icon: 'BR',
    accent: '#5E7B5C',
    category: 'wellness',
    port: 5192,
    intents: { provides: ['mindful-session'] },
  },
  {
    slug: 'mood-pulse',
    name: 'Mood Pulse',
    shortName: 'Mood',
    description: 'Three-second mood tap with local rhythm over time.',
    appKind: 'local',
    icon: 'MO',
    accent: '#E8C547',
    category: 'wellness',
    port: 5193,
    intents: {
      provides: ['mood-logged'],
      consumes: ['caffeine-logged', 'workout-completed', 'sleep-logged'],
    },
  },
  {
    slug: 'pomodoro',
    name: 'Pomodoro',
    shortName: 'Focus',
    description: 'Classic 25/5 focus cycle with local history and focus-session events.',
    appKind: 'local',
    icon: 'PO',
    accent: '#E8603C',
    category: 'productivity',
    port: 5194,
    intents: { provides: ['focus-session'] },
  },
  {
    slug: 'read-later',
    name: 'Read Later',
    shortName: 'Read',
    description: 'Save articles through the guarded proxy, extract them, and read offline.',
    appKind: 'connected',
    icon: 'RE',
    accent: '#3F51B5',
    category: 'productivity',
    port: 5195,
    intents: { consumes: ['mood-logged'] },
  },
  {
    slug: 'daily-briefing',
    name: 'Daily Briefing',
    shortName: 'Daily',
    description: 'The home-base surface for cross-app intent summaries and local insights.',
    appKind: 'local',
    icon: 'DB',
    accent: '#74A57F',
    category: 'productivity',
    port: 5196,
    intents: {
      consumes: [
        'cooked-meal',
        'cooking-now',
        'workout-completed',
        'run-planned',
        'sleep-logged',
        'coffee-brewed',
        'caffeine-logged',
        'hydration-logged',
        'dough-ready',
        'mood-logged',
        'mindful-session',
        'body-metrics-logged',
        'symptom-logged',
        'therapy-checkin',
        'cycle-logged',
        'household-note',
        'chore-done',
        'dinner-planned',
        'handover-note',
        'meds-logged',
        'custody-event',
        'story-shared',
        'story-draft',
        'focus-session',
        'needs-restocking',
        'dined-out',
        'trip-note',
        'place-pinned',
        'expense-logged',
        'budget-limit',
      ],
    },
  },
  {
    slug: 'restaurant-memory',
    name: 'Restaurant Memory',
    shortName: 'Eats',
    description: 'Photos and notes per restaurant, on-device only.',
    appKind: 'local',
    icon: 'RM',
    accent: '#A86060',
    category: 'memory',
    port: 5197,
    intents: {
      provides: ['dined-out'],
      consumes: ['cooked-meal'],
    },
  },
  {
    slug: 'show-and-tell',
    name: 'Show and Tell',
    shortName: 'Show',
    description: 'Mesh-only ephemeral scratchpad. Auto-clears when the room empties.',
    appKind: 'connected',
    icon: 'ST',
    accent: '#E0B345',
    category: 'social',
    port: 5198,
  },
  {
    slug: 'sip-log',
    name: 'Sip Log',
    shortName: 'Sips',
    description: 'One-tap water, coffee, and tea logging with hydration and caffeine intents.',
    appKind: 'local',
    icon: 'SI',
    accent: '#5EA777',
    category: 'wellness',
    port: 5199,
    intents: { provides: ['hydration-logged', 'caffeine-logged'] },
  },
  {
    slug: 'coffee',
    name: 'Coffee',
    shortName: 'Coffee',
    description: 'Ratio dial, bean presets, brew timer, and caffeine history.',
    appKind: 'local',
    icon: 'CO',
    accent: '#8B5A3C',
    category: 'cooking',
    port: 5200,
    intents: { provides: ['coffee-brewed', 'caffeine-logged'] },
  },
  {
    slug: 'cooking',
    name: 'Cooking',
    shortName: 'Cooking',
    description: 'Food temps and timing for sous vide, smoking, roasting, grilling, and pan cooking.',
    appKind: 'local',
    icon: 'CK',
    accent: '#E8603C',
    category: 'cooking',
    port: 5201,
    intents: { provides: ['cooking-now', 'cooked-meal'] },
  },
  {
    slug: 'dough',
    name: 'Dough',
    shortName: 'Dough',
    description: "Baker's percentages, dough planning, and ready-time scheduling.",
    appKind: 'local',
    icon: 'DO',
    accent: '#E8C547',
    category: 'cooking',
    port: 5202,
    intents: { provides: ['dough-ferment-started', 'dough-ready'] },
  },
  {
    slug: 'pace',
    name: 'Pace',
    shortName: 'Pace',
    description: 'Distance, time, and pace planning for runs, walks, and rides.',
    appKind: 'local',
    icon: 'PA',
    accent: '#5EA777',
    category: 'fitness',
    port: 5203,
    intents: {
      provides: ['run-planned'],
      consumes: ['workout-completed'],
    },
  },
  {
    slug: 'matchday',
    name: 'Matchday',
    shortName: 'Match',
    description: 'Sport-flavoured group play today; crowd aggregation later.',
    appKind: 'connected',
    icon: 'MD',
    accent: '#17694D',
    category: 'social',
    port: 5204,
  },
  {
    slug: 'quiet',
    name: 'Quiet',
    shortName: 'Quiet',
    description: 'Breath, focus, and mood in one local ritual surface.',
    appKind: 'local',
    icon: 'QU',
    accent: '#5E7B5C',
    category: 'wellness',
    port: 5205,
    intents: {
      provides: ['mindful-session', 'focus-session', 'mood-logged'],
      consumes: ['caffeine-logged', 'workout-completed', 'sleep-logged'],
    },
  },
  {
    slug: 'move',
    name: 'Move',
    shortName: 'Move',
    description: 'Pace, workout, and sleep correlations in one local log.',
    appKind: 'local',
    icon: 'MV',
    accent: '#5EA777',
    category: 'fitness',
    port: 5206,
    intents: {
      provides: ['run-planned', 'workout-completed', 'sleep-logged'],
      consumes: ['caffeine-logged'],
    },
  },
  {
    slug: 'hearth',
    name: 'Hearth',
    shortName: 'Hearth',
    description: 'Household chores, fridge notes, and dinner plans over the local mesh.',
    appKind: 'connected',
    icon: 'HE',
    accent: '#5EA777',
    category: 'home',
    port: 5207,
    intents: {
      provides: ['household-note', 'chore-done', 'dinner-planned'],
      consumes: ['needs-restocking', 'cooked-meal'],
    },
  },
  {
    slug: 'co-pilot',
    name: 'Co-Pilot',
    shortName: 'CoPilot',
    description: 'Separated co-parent schedules, meds, and handover notes.',
    appKind: 'connected',
    icon: 'CP',
    accent: '#4E7C9A',
    category: 'family',
    port: 5208,
    intents: {
      provides: ['custody-event', 'meds-logged', 'handover-note'],
    },
  },
  {
    slug: 'story-studio',
    name: 'Story Studio',
    shortName: 'Stories',
    description: 'Kids draw, dictate, and mesh-share stories with family.',
    appKind: 'connected',
    icon: 'SS',
    accent: '#E0B345',
    category: 'creativity',
    port: 5209,
    intents: {
      provides: ['story-shared', 'story-draft'],
    },
  },
  {
    slug: 'therapy-notes',
    name: 'Therapy Notes',
    shortName: 'Therapy',
    description: 'Local CBT worksheets, check-ins, and therapist handoff exports.',
    appKind: 'local',
    icon: 'TN',
    accent: '#5E7B5C',
    category: 'wellness',
    port: 5210,
    intents: {
      provides: ['therapy-checkin', 'mood-logged'],
      consumes: ['sleep-logged', 'mindful-session'],
    },
  },
  {
    slug: 'cycle',
    name: 'Cycle',
    shortName: 'Cycle',
    description: 'Local menstrual and fertility tracking with optional partner mesh.',
    appKind: 'local',
    icon: 'CY',
    accent: '#A86060',
    category: 'health',
    port: 5211,
    intents: {
      provides: ['cycle-logged'],
      consumes: ['body-metrics-logged', 'mood-logged'],
    },
  },
  {
    slug: 'symptom-diary',
    name: 'Symptom Diary',
    shortName: 'Symptoms',
    description: 'Chronic illness symptoms, triggers, medications, and exportable history.',
    appKind: 'local',
    icon: 'SD',
    accent: '#74A57F',
    category: 'health',
    port: 5212,
    intents: {
      provides: ['symptom-logged'],
      consumes: ['sleep-logged', 'mood-logged', 'cooked-meal', 'body-metrics-logged'],
    },
  },
  {
    slug: 'atlas',
    name: 'Atlas',
    shortName: 'Atlas',
    description: 'Offline trip companion for maps, places, photos, and notes.',
    appKind: 'connected',
    icon: 'AT',
    accent: '#4E7C9A',
    category: 'travel',
    port: 5213,
    intents: {
      provides: ['trip-note', 'place-pinned'],
      consumes: ['dined-out'],
    },
  },
  {
    slug: 'ledger',
    name: 'Ledger',
    shortName: 'Ledger',
    description: 'Private expense tracking without bank scraping or aggregators.',
    appKind: 'local',
    icon: 'LE',
    accent: '#17694D',
    category: 'money',
    port: 5214,
    intents: {
      provides: ['expense-logged', 'budget-limit'],
      consumes: ['dined-out', 'shopping-list'],
    },
  },
];

export const curatedApps: ContainerApp[] = curatedAppSpecs.map(curatedApp);

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function labelForKind(kind: AppKind): ContainerApp['labelKind'] {
  if (kind === 'local') return 'Local';
  if (kind === 'cloud') return 'Cloud';
  return 'Connected';
}

export function accentForKind(kind: AppKind): string {
  if (kind === 'local') return '#74A57F';
  if (kind === 'cloud') return '#B6472D';
  return '#4E7C9A';
}

export function readPayloadTable(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'items';
  const table = (payload as Record<string, unknown>).table;
  return typeof table === 'string' && table.length > 0 ? table : 'items';
}

export function sectionTitle(section: ContainerSection): string {
  if (section === 'home') return 'Home';
  if (section === 'create') return 'Create';
  return 'Your Data';
}

export function createReceiptFor(app: ContainerApp): AppReceipt {
  return createAppReceipt({
    appId: app.id,
    name: app.name,
    version: app.version,
    packageHash: app.packageHash,
    source: 'marketplace',
    domains: [new URL(app.standaloneUrl, 'https://shippie.app').href],
    kind: app.appKind,
    permissions: app.permissions.capabilities as unknown as Record<string, unknown>,
  });
}

export function buildUpdateCard(
  app: ContainerApp,
  receipt: AppReceipt | undefined,
): UpdateCard | null {
  if (!receipt) return null;
  if (receipt.packageHash === app.packageHash && receipt.version === app.version) return null;
  const receiptPermissions = permissionKeys(receipt.permissions);
  const appPermissions = permissionKeys(app.permissions.capabilities as unknown as Record<string, unknown>);
  const receiptDomains = networkDomainsFromCapabilities(receipt.permissions);
  const appDomains = networkDomainsFromCapabilities(app.permissions.capabilities as unknown as Record<string, unknown>);
  return {
    app,
    receipt,
    versionChanged: receipt.version !== app.version,
    packageHashChanged: receipt.packageHash !== app.packageHash,
    permissionsChanged: JSON.stringify(receipt.permissions) !== JSON.stringify(app.permissions.capabilities),
    kindChanged: receipt.kind !== app.appKind,
    addedPermissions: appPermissions.filter((permission) => !receiptPermissions.includes(permission)),
    removedPermissions: receiptPermissions.filter((permission) => !appPermissions.includes(permission)),
    addedNetworkDomains: appDomains.filter((domain) => !receiptDomains.includes(domain)),
    removedNetworkDomains: receiptDomains.filter((domain) => !appDomains.includes(domain)),
    latestSecurityScore: app.trust?.security.score ?? null,
    latestPrivacyGrade: app.trust?.privacy.grade ?? null,
    containerEligibility: app.trust?.containerEligibility ?? null,
  };
}

function permissionKeys(capabilities: Record<string, unknown>): string[] {
  return Object.keys(capabilities).filter((key) => capabilities[key] !== undefined).sort();
}

function networkDomainsFromCapabilities(capabilities: Record<string, unknown>): string[] {
  const network = capabilities.network;
  if (!network || typeof network !== 'object') return [];
  const allowedDomains = (network as { allowedDomains?: unknown }).allowedDomains;
  return Array.isArray(allowedDomains)
    ? allowedDomains.filter((domain): domain is string => typeof domain === 'string').sort()
    : [];
}

// ---------------------------------------------------------------------------
// Type guards + persistence
// ---------------------------------------------------------------------------

export function isPackageArchiveShape(value: unknown): value is { schema: string } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { schema?: string }).schema === 'shippie.archive.v1',
  );
}

export function isContainerApp(value: unknown): value is ContainerApp {
  if (!value || typeof value !== 'object') return false;
  const app = value as Partial<ContainerApp>;
  return Boolean(
    typeof app.id === 'string' &&
      typeof app.slug === 'string' &&
      typeof app.name === 'string' &&
      typeof app.packageHash === 'string' &&
      app.permissions,
  );
}

export function loadContainerState(storage: Storage): ContainerState | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ContainerState>;
    if (!Array.isArray(parsed.openAppIds) || !parsed.receiptsByApp || !parsed.rowsByApp) {
      return null;
    }
    return {
      openAppIds: parsed.openAppIds.filter((appId): appId is string => typeof appId === 'string'),
      importedApps: Array.isArray(parsed.importedApps)
        ? parsed.importedApps.filter(isContainerApp)
        : [],
      packageFilesByApp: normalizePackageFilesByApp(parsed.packageFilesByApp),
      receiptsByApp: parsed.receiptsByApp,
      rowsByApp: parsed.rowsByApp,
      intentGrants: parsed.intentGrants ?? {},
      transferGrants: parsed.transferGrants ?? {},
      dismissedInsightIds: parsed.dismissedInsightIds ?? {},
    };
  } catch {
    return null;
  }
}

export function createPackageFileCache(path: string, bytes: Uint8Array): PackageFileCache {
  const mimeType = mimeForPackagePath(path);
  const text = isTextMime(mimeType) ? new TextDecoder().decode(bytes) : undefined;
  return {
    mimeType,
    text,
    dataUrl: `data:${mimeType};base64,${bytesToBase64(bytes)}`,
  };
}

function normalizePackageFilesByApp(raw: unknown): Record<string, Record<string, PackageFileCache>> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, Record<string, PackageFileCache>> = {};
  for (const [appId, files] of Object.entries(raw as Record<string, unknown>)) {
    if (!files || typeof files !== 'object') continue;
    const appFiles: Record<string, PackageFileCache> = {};
    for (const [path, value] of Object.entries(files as Record<string, unknown>)) {
      if (typeof value === 'string') {
        appFiles[path] = createTextPackageFileCache(path, value);
      } else if (isPackageFileCache(value)) {
        appFiles[path] = value;
      }
    }
    out[appId] = appFiles;
  }
  return out;
}

function createTextPackageFileCache(path: string, text: string): PackageFileCache {
  const mimeType = mimeForPackagePath(path);
  return {
    mimeType,
    text,
    dataUrl: `data:${mimeType};base64,${bytesToBase64(new TextEncoder().encode(text))}`,
  };
}

function isPackageFileCache(value: unknown): value is PackageFileCache {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<PackageFileCache>;
  return typeof file.mimeType === 'string' && typeof file.dataUrl === 'string';
}

function isTextMime(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/javascript' ||
    mimeType === 'application/json' ||
    mimeType === 'image/svg+xml'
  );
}

function mimeForPackagePath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'application/javascript';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  if (lower.endsWith('.otf')) return 'font/otf';
  if (lower.endsWith('.wasm')) return 'application/wasm';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  return 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Bytes <-> base64 (used by encrypted backup)
// ---------------------------------------------------------------------------

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Encrypted backup encode/decode
//
// PBKDF2-SHA256 → AES-GCM-256. 100k iterations, 16-byte salt, 12-byte IV,
// schema-versioned envelope so future cipher upgrades stay forward-compatible.
// ---------------------------------------------------------------------------

const BACKUP_ENVELOPE_SCHEMA = 'shippie.encrypted-backup.v1';
const PBKDF2_ITERATIONS = 100_000;

export interface BackupArchive {
  manifest: {
    schema: typeof SHIPPIE_BACKUP_SCHEMA;
    createdAt: string;
    encrypted: true;
    receipts: AppReceipt[];
    apps: Array<{ appId: string; packageHash: string; dataPath: string; settingsPath: string }>;
  };
  rowsByApp: Record<string, LocalRow[]>;
}

export interface BackupEnvelope {
  schema: typeof BACKUP_ENVELOPE_SCHEMA;
  algorithm: 'PBKDF2-SHA256+A256GCM';
  kdf: { iterations: number; salt: string };
  iv: string;
  ciphertext: string;
}

export async function encryptBackup(
  passphrase: string,
  archive: BackupArchive,
): Promise<BackupEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(JSON.stringify(archive)),
    ),
  );
  return {
    schema: BACKUP_ENVELOPE_SCHEMA,
    algorithm: 'PBKDF2-SHA256+A256GCM',
    kdf: { iterations: PBKDF2_ITERATIONS, salt: bytesToBase64(salt) },
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };
}

export async function decryptBackup(
  passphrase: string,
  envelope: BackupEnvelope,
): Promise<BackupArchive> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: bytesToArrayBuffer(base64ToBytes(envelope.kdf.salt)),
      iterations: envelope.kdf.iterations ?? PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytesToArrayBuffer(base64ToBytes(envelope.iv)) },
    key,
    bytesToArrayBuffer(base64ToBytes(envelope.ciphertext)),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as BackupArchive;
}

export function isBackupEnvelope(value: unknown): value is BackupEnvelope {
  if (!value || typeof value !== 'object') return false;
  const env = value as Partial<BackupEnvelope>;
  return Boolean(
    env.schema === BACKUP_ENVELOPE_SCHEMA &&
      env.kdf?.salt &&
      env.iv &&
      env.ciphertext,
  );
}
