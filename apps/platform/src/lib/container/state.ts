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
  /** Phase C1 — dismissed insight ids → ms timestamp of dismissal. */
  dismissedInsightIds?: Record<string, number>;
};

export const STORAGE_KEY = 'shippie.container.v1';

export const localPermissions = (
  namespace: string,
  intents?: { provides?: string[]; consumes?: string[] },
): AppPermissions => ({
  schema: SHIPPIE_PERMISSIONS_SCHEMA,
  capabilities: {
    localDb: { enabled: true, namespace },
    localFiles: { enabled: true, namespace },
    feedback: { enabled: true },
    analytics: { enabled: true, mode: 'aggregate-only' },
    ...(intents
      ? {
          crossAppIntents: {
            provides: intents.provides ?? [],
            consumes: intents.consumes ?? [],
          },
        }
      : {}),
  },
});

export const curatedApps: ContainerApp[] = [
  {
    id: 'app_recipe_saver',
    slug: 'recipe-saver',
    name: 'Recipe Saver',
    shortName: 'Recipe',
    description: 'Save recipes, read them offline, and keep cooking notes on this device.',
    appKind: 'connected',
    entry: 'app/index.html',
    labelKind: 'Connected',
    icon: 'RS',
    accent: '#E8603C',
    version: '1',
    packageHash: `sha256:${'1'.repeat(64)}`,
    standaloneUrl: '/apps/recipe-saver',
    permissions: localPermissions('recipe-saver', { provides: ['shopping-list', 'cooked-meal'] }),
    category: 'cooking',
    devUrl: 'http://localhost:5180/',
  },
  {
    id: 'app_journal',
    slug: 'journal',
    name: 'Journal',
    shortName: 'Journal',
    description: 'A private local journal that never needs an account. Pulls in shopping lists from Recipe Saver.',
    appKind: 'local',
    entry: 'app/index.html',
    labelKind: 'Local',
    icon: 'J',
    accent: '#74A57F',
    version: '1',
    packageHash: `sha256:${'2'.repeat(64)}`,
    standaloneUrl: '/apps/journal',
    permissions: localPermissions('journal', { consumes: ['shopping-list'] }),
    category: 'journal',
    devUrl: 'http://localhost:5181/',
  },
  {
    id: 'app_whiteboard',
    slug: 'whiteboard',
    name: 'Whiteboard',
    shortName: 'Board',
    description: 'A shared sketch space for nearby groups and venue sessions.',
    appKind: 'connected',
    entry: 'app/index.html',
    labelKind: 'Connected',
    icon: 'WB',
    accent: '#4E7C9A',
    version: '1',
    packageHash: `sha256:${'3'.repeat(64)}`,
    standaloneUrl: '/apps/whiteboard',
    permissions: localPermissions('whiteboard'),
    devUrl: 'http://localhost:5182/',
  },
  {
    id: 'app_habit_tracker',
    slug: 'habit-tracker',
    name: 'Habit Tracker',
    shortName: 'Habits',
    description: 'Daily habits that auto-check when you complete activities in other Shippie apps.',
    appKind: 'local',
    entry: 'app/index.html',
    labelKind: 'Local',
    icon: 'HT',
    accent: '#5EA777',
    version: '1',
    packageHash: `sha256:${'4'.repeat(64)}`,
    standaloneUrl: '/apps/habit-tracker',
    permissions: localPermissions('habit-tracker', { consumes: ['cooked-meal', 'workout-completed'] }),
    category: 'fitness',
    devUrl: 'http://localhost:5184/',
  },
  {
    id: 'app_workout_logger',
    slug: 'workout-logger',
    name: 'Workout Logger',
    shortName: 'Workouts',
    description: 'Log strength sets and cardio sessions. Detect your weekly cadence.',
    appKind: 'local',
    entry: 'app/index.html',
    labelKind: 'Local',
    icon: 'WL',
    accent: '#E8603C',
    version: '1',
    packageHash: `sha256:${'5'.repeat(64)}`,
    standaloneUrl: '/apps/workout-logger',
    permissions: localPermissions('workout-logger', { provides: ['workout-completed'] }),
    category: 'fitness',
    devUrl: 'http://localhost:5185/',
  },
  {
    id: 'app_pantry_scanner',
    slug: 'pantry-scanner',
    name: 'Pantry Scanner',
    shortName: 'Pantry',
    description: 'Scan barcodes and identify pantry items with on-device vision.',
    appKind: 'local',
    entry: 'app/index.html',
    labelKind: 'Local',
    icon: 'PS',
    accent: '#74A57F',
    version: '1',
    packageHash: `sha256:${'6'.repeat(64)}`,
    standaloneUrl: '/apps/pantry-scanner',
    permissions: localPermissions('pantry-scanner', { provides: ['pantry-inventory'] }),
    category: 'cooking',
    devUrl: 'http://localhost:5186/',
  },
  {
    id: 'app_meal_planner',
    slug: 'meal-planner',
    name: 'Meal Planner',
    shortName: 'Meals',
    description: 'Plan a week of meals from your saved recipes and pantry contents.',
    appKind: 'local',
    entry: 'app/index.html',
    labelKind: 'Local',
    icon: 'MP',
    accent: '#E8603C',
    version: '1',
    packageHash: `sha256:${'7'.repeat(64)}`,
    standaloneUrl: '/apps/meal-planner',
    permissions: localPermissions('meal-planner', {
      provides: ['shopping-list'],
      consumes: ['shopping-list', 'pantry-inventory', 'budget-limit'],
    }),
    category: 'cooking',
    devUrl: 'http://localhost:5187/',
  },
  {
    id: 'app_shopping_list',
    slug: 'shopping-list',
    name: 'Shopping List',
    shortName: 'Shopping',
    description: 'A live shopping list that pulls from your meal plan.',
    appKind: 'local',
    entry: 'app/index.html',
    labelKind: 'Local',
    icon: 'SH',
    accent: '#4E7C9A',
    version: '1',
    packageHash: `sha256:${'8'.repeat(64)}`,
    standaloneUrl: '/apps/shopping-list',
    permissions: localPermissions('shopping-list', { consumes: ['shopping-list'] }),
    category: 'tools',
    devUrl: 'http://localhost:5188/',
  },
  {
    id: 'app_sleep_logger',
    slug: 'sleep-logger',
    name: 'Sleep Logger',
    shortName: 'Sleep',
    description: 'Track sleep quality. Surface correlations with workouts and caffeine.',
    appKind: 'local',
    entry: 'app/index.html',
    labelKind: 'Local',
    icon: 'SP',
    accent: '#4E7C9A',
    version: '1',
    packageHash: `sha256:${'9'.repeat(64)}`,
    standaloneUrl: '/apps/sleep-logger',
    permissions: localPermissions('sleep-logger', { consumes: ['workout-completed', 'caffeine-logged'] }),
    category: 'fitness',
    devUrl: 'http://localhost:5189/',
  },
  {
    id: 'app_body_metrics',
    slug: 'body-metrics',
    name: 'Body Metrics',
    shortName: 'Body',
    description: 'Track weight + body photos. Photos never leave the device.',
    appKind: 'local',
    entry: 'app/index.html',
    labelKind: 'Local',
    icon: 'BM',
    accent: '#74A57F',
    version: '1',
    packageHash: `sha256:${'a'.repeat(64)}`,
    standaloneUrl: '/apps/body-metrics',
    permissions: localPermissions('body-metrics'),
    category: 'fitness',
    devUrl: 'http://localhost:5190/',
  },
];

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
