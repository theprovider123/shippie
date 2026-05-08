import type { LocalDbUsage, ShippieLocalDb } from '@shippie/local-runtime-contract';
import { isMemoryLocalDb } from './runtime.ts';
import { INGREDIENTS_TABLE, RECIPES_TABLE } from './schema.ts';
import { ensureSchema } from './queries.ts';
import type { RecipeBackupInfo } from './backup.ts';

export const BACKUP_META_KEY = 'shippie:recipe-saver:backup-meta:v1';
export const PROMPT_STATE_KEY = 'shippie:recipe-saver:safety-prompts:v1';
export const PERSISTENCE_META_KEY = 'shippie:recipe-saver:persistence:v1';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface BackupMeta {
  lastBackupAt: string;
  recipeCount: number;
  ingredientCount: number;
  contentHash?: string;
}

export interface SafetyPromptState {
  userSaves: number;
  firstSavePrompted: boolean;
  fiveSavesPrompted: boolean;
  lastStalePromptAt?: string;
}

export interface RecipeStorageHealth {
  mode: 'opfs' | 'memory';
  recipeCount: number;
  ingredientCount: number;
  usedBytes: number;
  quotaBytes?: number;
  persisted: boolean | null;
  lastBackupAt: string | null;
  backupAgeDays: number | null;
  warningLevel: 'none' | 'high' | 'critical';
}

export type BackupPromptReason = 'first-save' | 'five-saves' | 'stale-backup';

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
  info: RecipeBackupInfo,
  storage: Storage | undefined = browserStorage(),
): BackupMeta | null {
  if (!storage) return null;
  const meta: BackupMeta = {
    lastBackupAt: info.createdAt,
    recipeCount: info.recipeCount,
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
    };
  } catch {
    return defaultPromptState();
  }
}

export function recordRecipeSaveAndChoosePrompt(
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

export async function collectStorageHealth(db: ShippieLocalDb): Promise<RecipeStorageHealth> {
  await ensureSchema(db);
  const usage: LocalDbUsage = await db
    .usage()
    .catch(() => ({ usedBytes: 0, warningLevel: 'none' as const }));
  const recipeCount = await db.count(RECIPES_TABLE).catch(() => 0);
  const ingredientCount = await db.count(INGREDIENTS_TABLE).catch(() => 0);
  const backup = loadBackupMeta();
  const persisted = await readPersistedStatus(usage.persisted);
  return {
    mode: isMemoryLocalDb(db) ? 'memory' : 'opfs',
    recipeCount,
    ingredientCount,
    usedBytes: usage.usedBytes,
    quotaBytes: usage.quotaBytes,
    persisted,
    lastBackupAt: backup?.lastBackupAt ?? null,
    backupAgeDays: backup ? backupAgeDays(backup, new Date()) : null,
    warningLevel: usage.warningLevel ?? 'none',
  };
}

export async function requestDurableRecipeStorage(db: ShippieLocalDb): Promise<boolean | null> {
  if (isMemoryLocalDb(db)) return false;
  try {
    const granted = await db.requestPersistence();
    persistPersistenceMeta(granted);
    return granted;
  } catch {
    return null;
  }
}

export function promptText(reason: BackupPromptReason): string {
  if (reason === 'first-save') return 'First recipe saved. Make an encrypted backup now.';
  if (reason === 'five-saves') return 'You have a real little cookbook now. Back it up.';
  return 'It has been over 30 days since your last recipe backup.';
}

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

function persistPersistenceMeta(granted: boolean): void {
  try {
    browserStorage()?.setItem(
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
    recipeCount: Number.isFinite(value.recipeCount) ? Number(value.recipeCount) : 0,
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
