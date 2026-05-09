/**
 * Steep data-safety + backup-prompt machinery.
 *
 * Mirrors apps/showcase-recipe/src/db/data-safety.ts. Both apps will
 * graduate to a shared @shippie/durability package once the abstraction
 * proves out — see the recipe storage v2 plan.
 *
 * Surfaces three things to the App / panel:
 *   - `RecipeStorageHealth`-style status: mode, persistence, iOS risk,
 *     and a four-tier headline (`safe` / `protected-locally` /
 *     `only-on-this-device` / `at-risk`).
 *   - Backup prompts on first save, fifth save, and 30-day-stale.
 *   - Install nudge for iOS Safari (non-standalone) on first save.
 */
import type { LocalDbUsage, ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  detectInstallMethod,
  detectStandalone,
  type InstallMethod,
} from '@shippie/sdk/wrapper';
import { isMemoryLocalDb } from './runtime.ts';
import { BLENDS_TABLE, BLEND_INGREDIENTS_TABLE, HERBS_TABLE } from './schema.ts';
import { ensureSchema } from './queries.ts';
import type { SteepBackupInfo } from './backup.ts';

export const BACKUP_META_KEY = 'shippie:steep:backup-meta:v1';
export const PROMPT_STATE_KEY = 'shippie:steep:safety-prompts:v1';
export const PERSISTENCE_META_KEY = 'shippie:steep:persistence:v1';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface BackupMeta {
  lastBackupAt: string;
  blendCount: number;
  ingredientCount: number;
  contentHash?: string;
}

export interface SafetyPromptState {
  userSaves: number;
  firstSavePrompted: boolean;
  fiveSavesPrompted: boolean;
  lastStalePromptAt?: string;
  installNudgeDismissed?: boolean;
}

export type IosRiskLevel = 'none' | 'low' | 'critical';
export type StorageStatus = 'safe' | 'protected-locally' | 'only-on-this-device' | 'at-risk';

export interface SteepStorageHealth {
  mode: 'opfs' | 'memory';
  blendCount: number;
  herbCount: number;
  ingredientCount: number;
  usedBytes: number;
  quotaBytes?: number;
  persisted: boolean | null;
  lastBackupAt: string | null;
  backupAgeDays: number | null;
  iosRiskLevel: IosRiskLevel;
  status: StorageStatus;
  /** Internal — derived from quota pressure. Use `status` for UI. */
  warningLevel: 'none' | 'high' | 'critical';
}

export type BackupPromptReason = 'first-save' | 'five-saves' | 'stale-backup';

export interface RecipeSafetyEnv {
  installMethod: InstallMethod;
  standalone: boolean;
}

export interface PersistenceMeta {
  requestedAt: string;
  granted: boolean;
}

// ── backup metadata ─────────────────────────────────────────────────

export function loadBackupMeta(storage: Storage | undefined = browserStorage()): BackupMeta | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(BACKUP_META_KEY);
    return raw ? normalizeBackupMeta(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveBackupMeta(
  info: SteepBackupInfo,
  storage: Storage | undefined = browserStorage(),
): BackupMeta | null {
  if (!storage) return null;
  const meta: BackupMeta = {
    lastBackupAt: info.createdAt,
    blendCount: info.blendCount,
    ingredientCount: info.ingredientCount,
    contentHash: info.contentHash,
  };
  try {
    storage.setItem(BACKUP_META_KEY, JSON.stringify(meta));
    return meta;
  } catch {
    return null;
  }
}

// ── prompt state ────────────────────────────────────────────────────

export function loadPromptState(storage: Storage | undefined = browserStorage()): SafetyPromptState {
  if (!storage) return defaultPromptState();
  try {
    const raw = storage.getItem(PROMPT_STATE_KEY);
    if (!raw) return defaultPromptState();
    const parsed = JSON.parse(raw) as Partial<SafetyPromptState>;
    return {
      userSaves: Number.isFinite(parsed.userSaves) ? Number(parsed.userSaves) : 0,
      firstSavePrompted: parsed.firstSavePrompted === true,
      fiveSavesPrompted: parsed.fiveSavesPrompted === true,
      lastStalePromptAt:
        typeof parsed.lastStalePromptAt === 'string' ? parsed.lastStalePromptAt : undefined,
      installNudgeDismissed: parsed.installNudgeDismissed === true,
    };
  } catch {
    return defaultPromptState();
  }
}

export function recordBlendSaveAndChoosePrompt(
  backup: BackupMeta | null,
  now = new Date(),
  storage: Storage | undefined = browserStorage(),
): BackupPromptReason | null {
  const state = loadPromptState(storage);
  state.userSaves += 1;
  let reason: BackupPromptReason | null = null;
  if (!state.firstSavePrompted) {
    state.firstSavePrompted = true;
    state.lastStalePromptAt = now.toISOString();
    reason = 'first-save';
  } else if (state.userSaves >= 5 && !state.fiveSavesPrompted) {
    state.fiveSavesPrompted = true;
    state.lastStalePromptAt = now.toISOString();
    reason = 'five-saves';
  } else if (isBackupStale(backup, now) && shouldPromptForStaleBackup(state, now)) {
    state.lastStalePromptAt = now.toISOString();
    reason = 'stale-backup';
  }
  savePromptState(state, storage);
  return reason;
}

export function chooseStartupBackupPrompt(
  backup: BackupMeta | null,
  now = new Date(),
  storage: Storage | undefined = browserStorage(),
): BackupPromptReason | null {
  const state = loadPromptState(storage);
  if (state.userSaves === 0) return null;
  if (!isBackupStale(backup, now) || !shouldPromptForStaleBackup(state, now)) return null;
  state.lastStalePromptAt = now.toISOString();
  savePromptState(state, storage);
  return 'stale-backup';
}

// ── storage health ──────────────────────────────────────────────────

export async function collectStorageHealth(
  db: ShippieLocalDb,
  env: RecipeSafetyEnv = detectRecipeSafetyEnv(),
): Promise<SteepStorageHealth> {
  await ensureSchema(db);
  const usage: LocalDbUsage = await db
    .usage()
    .catch(() => ({ usedBytes: 0, warningLevel: 'none' as const }));
  const blendCount = await db.count(BLENDS_TABLE).catch(() => 0);
  const herbCount = await db.count(HERBS_TABLE).catch(() => 0);
  const ingredientCount = await db.count(BLEND_INGREDIENTS_TABLE).catch(() => 0);
  const backup = loadBackupMeta();
  const persisted = await readPersistedStatus(usage.persisted);
  const mode = isMemoryLocalDb(db) ? 'memory' : 'opfs';
  const ageDays = backup ? backupAgeDays(backup, new Date()) : null;
  const iosRiskLevel = deriveIosRiskLevel(env);
  const status = deriveStorageStatus({
    mode,
    persisted,
    lastBackupAgeDays: ageDays,
    iosRiskLevel,
    warningLevel: usage.warningLevel ?? 'none',
  });
  return {
    mode,
    blendCount,
    herbCount,
    ingredientCount,
    usedBytes: usage.usedBytes,
    quotaBytes: usage.quotaBytes,
    persisted,
    lastBackupAt: backup?.lastBackupAt ?? null,
    backupAgeDays: ageDays,
    iosRiskLevel,
    status,
    warningLevel: usage.warningLevel ?? 'none',
  };
}

export async function requestDurableSteepStorage(db: ShippieLocalDb): Promise<boolean | null> {
  if (isMemoryLocalDb(db)) return false;
  try {
    const granted = await db.requestPersistence();
    persistPersistenceMeta(granted);
    return granted;
  } catch {
    return null;
  }
}

// ── env detection ──────────────────────────────────────────────────

export function detectRecipeSafetyEnv(): RecipeSafetyEnv {
  if (typeof navigator === 'undefined') {
    return { installMethod: 'manual', standalone: false };
  }
  const ua = navigator.userAgent ?? '';
  const match = (q: string): { matches: boolean } =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(q)
      : { matches: false };
  return {
    installMethod: detectInstallMethod(ua),
    standalone: detectStandalone(navigator as { standalone?: boolean }, match),
  };
}

export function deriveIosRiskLevel(env: RecipeSafetyEnv): IosRiskLevel {
  const isIos =
    env.installMethod === 'ios-safari' ||
    env.installMethod === 'ios-chrome' ||
    env.installMethod === 'ios-other';
  if (!isIos) return 'none';
  return env.standalone ? 'low' : 'critical';
}

interface StatusInputs {
  mode: 'opfs' | 'memory';
  persisted: boolean | null;
  lastBackupAgeDays: number | null;
  iosRiskLevel: IosRiskLevel;
  warningLevel: 'none' | 'high' | 'critical';
}

export function deriveStorageStatus(input: StatusInputs): StorageStatus {
  if (
    input.mode === 'memory' ||
    input.iosRiskLevel === 'critical' ||
    input.warningLevel === 'critical'
  ) {
    return 'at-risk';
  }
  const hasFreshBackup =
    input.lastBackupAgeDays !== null && input.lastBackupAgeDays <= 30;
  if (input.persisted === true && hasFreshBackup && input.iosRiskLevel === 'none') {
    return 'safe';
  }
  if (input.persisted === true) return 'protected-locally';
  return 'only-on-this-device';
}

// ── install nudge ──────────────────────────────────────────────────

export function shouldNudgeInstall(
  env: RecipeSafetyEnv = detectRecipeSafetyEnv(),
  storage: Storage | undefined = browserStorage(),
): boolean {
  if (env.installMethod !== 'ios-safari') return false;
  if (env.standalone) return false;
  return loadPromptState(storage).installNudgeDismissed !== true;
}

export function dismissInstallNudge(storage: Storage | undefined = browserStorage()): void {
  const state = loadPromptState(storage);
  if (state.installNudgeDismissed === true) return;
  state.installNudgeDismissed = true;
  savePromptState(state, storage);
}

// ── persistence metadata ────────────────────────────────────────────

export function loadPersistenceMeta(
  storage: Storage | undefined = browserStorage(),
): PersistenceMeta | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PERSISTENCE_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistenceMeta>;
    if (typeof parsed?.requestedAt !== 'string' || typeof parsed?.granted !== 'boolean') {
      return null;
    }
    return { requestedAt: parsed.requestedAt, granted: parsed.granted };
  } catch {
    return null;
  }
}

export function hasRequestedPersistence(
  storage: Storage | undefined = browserStorage(),
): boolean {
  return loadPersistenceMeta(storage) !== null;
}

// ── prompt copy ─────────────────────────────────────────────────────

export function promptText(reason: BackupPromptReason): string {
  if (reason === 'first-save') return 'First blend saved. Make an encrypted backup now.';
  if (reason === 'five-saves') return 'You have a real little apothecary now. Back it up.';
  return 'It has been over 30 days since your last Steep backup.';
}

// ── helpers ────────────────────────────────────────────────────────

function backupAgeDays(backup: BackupMeta, now: Date): number | null {
  const created = Date.parse(backup.lastBackupAt);
  if (!Number.isFinite(created)) return null;
  return Math.max(0, Math.floor((now.getTime() - created) / (24 * 60 * 60 * 1000)));
}

function isBackupStale(backup: BackupMeta | null, now: Date): boolean {
  if (!backup) return true;
  const created = Date.parse(backup.lastBackupAt);
  if (!Number.isFinite(created)) return true;
  return now.getTime() - created > THIRTY_DAYS_MS;
}

function shouldPromptForStaleBackup(state: SafetyPromptState, now: Date): boolean {
  if (!state.lastStalePromptAt) return true;
  const prompted = Date.parse(state.lastStalePromptAt);
  return !Number.isFinite(prompted) || now.getTime() - prompted > THIRTY_DAYS_MS;
}

function savePromptState(state: SafetyPromptState, storage: Storage | undefined): void {
  try {
    storage?.setItem(PROMPT_STATE_KEY, JSON.stringify(state));
  } catch {
    // Prompting is best-effort. Losing this metadata should never block saving.
  }
}

function persistPersistenceMeta(
  granted: boolean,
  storage: Storage | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(
      PERSISTENCE_META_KEY,
      JSON.stringify({ requestedAt: new Date().toISOString(), granted }),
    );
  } catch {
    // Best-effort metadata only.
  }
}

async function readPersistedStatus(fromUsage: boolean | undefined): Promise<boolean | null> {
  if (typeof fromUsage === 'boolean') return fromUsage;
  if (typeof navigator === 'undefined' || typeof navigator.storage?.persisted !== 'function') return null;
  return navigator.storage.persisted().catch(() => null);
}

function normalizeBackupMeta(value: Partial<BackupMeta>): BackupMeta | null {
  if (!value || typeof value.lastBackupAt !== 'string') return null;
  return {
    lastBackupAt: value.lastBackupAt,
    blendCount: Number.isFinite(value.blendCount) ? Number(value.blendCount) : 0,
    ingredientCount: Number.isFinite(value.ingredientCount) ? Number(value.ingredientCount) : 0,
    contentHash: typeof value.contentHash === 'string' ? value.contentHash : undefined,
  };
}

function defaultPromptState(): SafetyPromptState {
  return {
    userSaves: 0,
    firstSavePrompted: false,
    fiveSavesPrompted: false,
  };
}

function browserStorage(): Storage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage;
}
