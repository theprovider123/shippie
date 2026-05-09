/**
 * Encrypted .shippiebak export + restore for Steep.
 *
 * Mirrors apps/showcase-recipe/src/db/backup.ts. Both apps will lift
 * these into @shippie/durability once the abstraction is proved by
 * having two adopters.
 *
 * The backup wraps every user-owned row across all five tables. Seed
 * library copies are not included — they re-seed on a fresh device.
 * User-added herbs (source: 'user') are included.
 */
import { decodeEncryptedBackup, encodeEncryptedBackup } from '@shippie/local-db';
import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  BLENDS_TABLE,
  BLEND_INGREDIENTS_TABLE,
  BREW_LOG_TABLE,
  HERBS_TABLE,
  INVENTORY_TABLE,
  blendIngredientsSchema,
  blendsSchema,
  brewLogSchema,
  herbsSchema,
  inventorySchema,
  type Blend,
  type BlendIngredient,
  type BrewLogEntry,
  type Herb,
  type InventoryRow,
} from './schema.ts';
import { ensureSchema } from './queries.ts';

export const STEEP_BACKUP_KIND = 'shippie.steep.backup.v1';

interface BackupTable<TSchema, TRow> {
  schema: TSchema;
  rows: TRow[];
}

export interface SteepBackupPlaintext {
  kind: typeof STEEP_BACKUP_KIND;
  exportedAt: string;
  tables: {
    herbs: BackupTable<typeof herbsSchema, Herb>;
    blends: BackupTable<typeof blendsSchema, Blend>;
    blend_ingredients: BackupTable<typeof blendIngredientsSchema, BlendIngredient>;
    inventory: BackupTable<typeof inventorySchema, InventoryRow>;
    brew_log: BackupTable<typeof brewLogSchema, BrewLogEntry>;
  };
}

export interface SteepBackupInfo {
  createdAt: string;
  encrypted: true;
  herbCount: number;
  blendCount: number;
  ingredientCount: number;
  inventoryCount: number;
  brewLogCount: number;
  contentHash?: string;
}

export async function exportSteepBackup(
  db: ShippieLocalDb,
  passphrase: string,
): Promise<{ blob: Blob; info: SteepBackupInfo }> {
  const trimmed = passphrase.trim();
  if (!trimmed) throw new Error('Enter a backup passphrase.');
  await ensureSchema(db);

  // Only include user-added herbs in the backup. Seed-library herbs
  // re-seed on a fresh device, so backing them up would either bloat
  // the file or risk overwriting a future seed update on restore.
  const allHerbs = (await db.query<Herb & LocalDbRecord>(HERBS_TABLE)) as Herb[];
  const herbs = allHerbs.filter((h) => h.source === 'user');

  const blends = (await db.query<Blend & LocalDbRecord>(BLENDS_TABLE)) as Blend[];
  const ingredients = (await db.query<BlendIngredient & LocalDbRecord>(
    BLEND_INGREDIENTS_TABLE,
  )) as BlendIngredient[];
  const inventory = (await db.query<InventoryRow & LocalDbRecord>(
    INVENTORY_TABLE,
  )) as InventoryRow[];
  const brewLog = (await db.query<BrewLogEntry & LocalDbRecord>(BREW_LOG_TABLE)) as BrewLogEntry[];

  const payload: SteepBackupPlaintext = {
    kind: STEEP_BACKUP_KIND,
    exportedAt: new Date().toISOString(),
    tables: {
      herbs: { schema: herbsSchema, rows: herbs },
      blends: { schema: blendsSchema, rows: blends },
      blend_ingredients: { schema: blendIngredientsSchema, rows: ingredients },
      inventory: { schema: inventorySchema, rows: inventory },
      brew_log: { schema: brewLogSchema, rows: brewLog },
    },
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encoded = await encodeEncryptedBackup({
    appId: 'steep',
    schemaVersion: 1,
    tables: [
      HERBS_TABLE,
      BLENDS_TABLE,
      BLEND_INGREDIENTS_TABLE,
      INVENTORY_TABLE,
      BREW_LOG_TABLE,
    ],
    plaintext,
    passphrase: trimmed,
  });
  return {
    blob: encoded.blob,
    info: {
      createdAt: encoded.header.createdAt,
      encrypted: true,
      herbCount: herbs.length,
      blendCount: blends.length,
      ingredientCount: ingredients.length,
      inventoryCount: inventory.length,
      brewLogCount: brewLog.length,
      contentHash: encoded.header.contentHash,
    },
  };
}

export async function inspectSteepBackup(
  file: Blob,
  passphrase: string,
): Promise<{ info: SteepBackupInfo; payload: SteepBackupPlaintext }> {
  const trimmed = passphrase.trim();
  if (!trimmed) throw new Error('Enter the backup passphrase.');
  const decoded = await decodeEncryptedBackup(file, trimmed);
  const payload = JSON.parse(new TextDecoder().decode(decoded.plaintext)) as SteepBackupPlaintext;
  assertSteepBackupPayload(payload);
  return {
    payload,
    info: {
      createdAt: decoded.header.createdAt,
      encrypted: true,
      herbCount: payload.tables.herbs.rows.length,
      blendCount: payload.tables.blends.rows.length,
      ingredientCount: payload.tables.blend_ingredients.rows.length,
      inventoryCount: payload.tables.inventory.rows.length,
      brewLogCount: payload.tables.brew_log.rows.length,
      contentHash: decoded.header.contentHash,
    },
  };
}

export async function restoreSteepBackup(
  db: ShippieLocalDb,
  file: Blob,
  passphrase: string,
  opts: { dryRun?: boolean } = {},
): Promise<SteepBackupInfo> {
  const { payload, info } = await inspectSteepBackup(file, passphrase);
  if (opts.dryRun) return info;
  await ensureSchema(db);

  // Wipe user-owned rows table by table. Seed herbs (source: 'seed')
  // are kept — re-seeding on a clean device handles them.
  for (const t of [BREW_LOG_TABLE, INVENTORY_TABLE, BLEND_INGREDIENTS_TABLE, BLENDS_TABLE]) {
    const rows = (await db.query<LocalDbRecord>(t)) as LocalDbRecord[];
    for (const row of rows) await db.delete(t, String(row.id));
  }
  const userHerbs = ((await db.query<Herb & LocalDbRecord>(HERBS_TABLE)) as Herb[]).filter(
    (h) => h.source === 'user',
  );
  for (const h of userHerbs) await db.delete(HERBS_TABLE, h.id);

  for (const herb of payload.tables.herbs.rows) {
    await db.insert(HERBS_TABLE, herb as unknown as LocalDbRecord);
  }
  for (const blend of payload.tables.blends.rows) {
    await db.insert(BLENDS_TABLE, blend as unknown as LocalDbRecord);
  }
  for (const ing of payload.tables.blend_ingredients.rows) {
    await db.insert(BLEND_INGREDIENTS_TABLE, ing as unknown as LocalDbRecord);
  }
  for (const inv of payload.tables.inventory.rows) {
    await db.insert(INVENTORY_TABLE, inv as unknown as LocalDbRecord);
  }
  for (const log of payload.tables.brew_log.rows) {
    await db.insert(BREW_LOG_TABLE, log as unknown as LocalDbRecord);
  }
  return info;
}

/**
 * Save the encrypted backup blob using the platform's most useful path.
 *
 * On iOS Safari and other Web Share-capable browsers, route through
 * `navigator.share({ files: [...] })` so the user lands directly in
 * Files / iCloud Drive. iOS cannot silently re-write the same file
 * later — that's why this lives outside the cloud-style
 * BackupProviderApi: there is no `list` / `download` to symmetrise.
 *
 * Anchor-download fallback elsewhere.
 *
 * Returns the route taken so the caller can pick appropriate copy.
 */
export async function saveBackupBlob(
  blob: Blob,
  filename: string,
): Promise<{ via: 'share' | 'download' }> {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      const file = new File([blob], filename, {
        type: blob.type || 'application/octet-stream',
      });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return { via: 'share' };
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      // Other share-sheet failures fall through to download.
    }
  }
  if (typeof URL === 'undefined' || typeof document === 'undefined') {
    throw new Error('No supported way to save the backup file in this environment.');
  }
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return { via: 'download' };
}

function assertSteepBackupPayload(value: SteepBackupPlaintext): void {
  if (!value || value.kind !== STEEP_BACKUP_KIND) {
    throw new Error('This is not a Steep backup.');
  }
  const t = value.tables;
  if (
    !t ||
    !Array.isArray(t.herbs?.rows) ||
    !Array.isArray(t.blends?.rows) ||
    !Array.isArray(t.blend_ingredients?.rows) ||
    !Array.isArray(t.inventory?.rows) ||
    !Array.isArray(t.brew_log?.rows)
  ) {
    throw new Error('Steep backup is missing one or more table rows.');
  }
  for (const blend of t.blends.rows) {
    if (typeof blend.id !== 'string' || typeof blend.name !== 'string') {
      throw new Error('Steep backup contains an invalid blend row.');
    }
  }
  for (const ing of t.blend_ingredients.rows) {
    if (
      typeof ing.id !== 'string' ||
      typeof ing.blend_id !== 'string' ||
      typeof ing.herb_id !== 'string' ||
      typeof ing.parts !== 'number'
    ) {
      throw new Error('Steep backup contains an invalid blend ingredient row.');
    }
  }
}
