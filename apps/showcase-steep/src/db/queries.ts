/**
 * Query helpers around `shippie.local.db`. Async because the real engine
 * is wa-sqlite + OPFS off the main thread. Helpers keep components free
 * of SQL-shaped knowledge and round-trip the array-tag fields through
 * the encode/decode pair from schema.ts.
 */
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
  decodeTags,
  encodeTags,
  herbsSchema,
  inventorySchema,
  type ActionTag,
  type BatchSize,
  type Blend,
  type BlendIngredient,
  type BlendWithIngredients,
  type BrewLogEntry,
  type Herb,
  type IntentTag,
  type InventoryRow,
  type TasteTag,
} from './schema.ts';

type RowOf<T> = T & LocalDbRecord;
const asRow = <T>(value: T): RowOf<T> => value as RowOf<T>;

const initCache = new WeakMap<ShippieLocalDb, Promise<void>>();

export async function ensureSchema(db: ShippieLocalDb): Promise<void> {
  let pending = initCache.get(db);
  if (!pending) {
    pending = (async () => {
      await db.create(HERBS_TABLE, herbsSchema);
      await db.create(BLENDS_TABLE, blendsSchema);
      await db.create(BLEND_INGREDIENTS_TABLE, blendIngredientsSchema);
      await db.create(INVENTORY_TABLE, inventorySchema);
      await db.create(BREW_LOG_TABLE, brewLogSchema);
    })();
    initCache.set(db, pending);
  }
  await pending;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── herbs ────────────────────────────────────────────────────────────

interface HerbRow extends LocalDbRecord {
  id: string;
  slug: string;
  common_name: string;
  latin_name?: string | null;
  tastes?: string | null;
  actions?: string | null;
  energetics?: string | null;
  traditional_uses?: string | null;
  default_brew_temp_c?: number | null;
  default_steep_minutes?: number | null;
  max_resteeps?: number | null;
  notes?: string | null;
  source: 'seed' | 'user';
  created_at?: string;
  updated_at?: string;
}

function herbFromRow(row: HerbRow): Herb {
  return {
    ...row,
    tastes: decodeTags<TasteTag>(row.tastes),
    actions: decodeTags<ActionTag>(row.actions),
  };
}

function herbToRow(herb: Herb): HerbRow {
  return {
    ...herb,
    tastes: encodeTags(herb.tastes),
    actions: encodeTags(herb.actions),
  };
}

export async function listHerbs(db: ShippieLocalDb): Promise<Herb[]> {
  await ensureSchema(db);
  const rows = await db.query<HerbRow>(HERBS_TABLE, { orderBy: { common_name: 'asc' } });
  return rows.map(herbFromRow);
}

export async function getHerb(db: ShippieLocalDb, id: string): Promise<Herb | null> {
  await ensureSchema(db);
  const rows = await db.query<HerbRow>(HERBS_TABLE, { where: { id }, limit: 1 });
  return rows[0] ? herbFromRow(rows[0]) : null;
}

export async function getHerbBySlug(db: ShippieLocalDb, slug: string): Promise<Herb | null> {
  await ensureSchema(db);
  const rows = await db.query<HerbRow>(HERBS_TABLE, { where: { slug }, limit: 1 });
  return rows[0] ? herbFromRow(rows[0]) : null;
}

export async function upsertHerb(
  db: ShippieLocalDb,
  input: Omit<Herb, 'id' | 'created_at' | 'updated_at'> & { id?: string },
): Promise<Herb> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const existing = input.id ? await getHerb(db, input.id) : await getHerbBySlug(db, input.slug);
  if (existing) {
    const merged: Herb = { ...existing, ...input, id: existing.id, updated_at: now };
    await db.update<HerbRow>(HERBS_TABLE, existing.id, asRow(herbToRow(merged)));
    return merged;
  }
  const herb: Herb = {
    id: input.id ?? newId(),
    slug: input.slug,
    common_name: input.common_name,
    latin_name: input.latin_name ?? null,
    tastes: input.tastes ?? [],
    actions: input.actions ?? [],
    energetics: input.energetics ?? null,
    traditional_uses: input.traditional_uses ?? null,
    default_brew_temp_c: input.default_brew_temp_c ?? null,
    default_steep_minutes: input.default_steep_minutes ?? null,
    max_resteeps: input.max_resteeps ?? null,
    notes: input.notes ?? null,
    source: input.source,
    created_at: now,
    updated_at: now,
  };
  await db.insert(HERBS_TABLE, asRow(herbToRow(herb)));
  return herb;
}

export async function deleteHerb(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(HERBS_TABLE, id);
}

// ── blends ───────────────────────────────────────────────────────────

interface BlendRow extends LocalDbRecord {
  id: string;
  name: string;
  notes?: string | null;
  intent_tags?: string | null;
  default_temp_c?: number | null;
  default_steep_minutes?: number | null;
  max_resteeps?: number | null;
  default_batch?: BatchSize | null;
  created_at?: string;
  updated_at?: string;
}

function blendFromRow(row: BlendRow): Blend {
  return {
    ...row,
    intent_tags: decodeTags<IntentTag>(row.intent_tags),
  };
}

function blendToRow(blend: Blend): BlendRow {
  return {
    ...blend,
    intent_tags: encodeTags(blend.intent_tags),
  };
}

export async function listBlends(db: ShippieLocalDb): Promise<Blend[]> {
  await ensureSchema(db);
  const rows = await db.query<BlendRow>(BLENDS_TABLE, { orderBy: { updated_at: 'desc' } });
  return rows.map(blendFromRow);
}

export async function getBlend(db: ShippieLocalDb, id: string): Promise<BlendWithIngredients | null> {
  await ensureSchema(db);
  const rows = await db.query<BlendRow>(BLENDS_TABLE, { where: { id }, limit: 1 });
  const blend = rows[0];
  if (!blend) return null;
  const ingredients = (await db.query<BlendIngredient & LocalDbRecord>(BLEND_INGREDIENTS_TABLE, {
    where: { blend_id: id },
  })) as BlendIngredient[];
  const enriched = await Promise.all(
    ingredients.map(async (ing) => ({ ...ing, herb: await getHerb(db, ing.herb_id) })),
  );
  return { ...blendFromRow(blend), ingredients: enriched };
}

export async function createBlend(
  db: ShippieLocalDb,
  input: Omit<Blend, 'id' | 'created_at' | 'updated_at'> & { id?: string },
): Promise<Blend> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const blend: Blend = {
    id: input.id ?? newId(),
    name: input.name,
    notes: input.notes ?? null,
    intent_tags: input.intent_tags ?? [],
    default_temp_c: input.default_temp_c ?? null,
    default_steep_minutes: input.default_steep_minutes ?? null,
    max_resteeps: input.max_resteeps ?? null,
    default_batch: input.default_batch ?? null,
    created_at: now,
    updated_at: now,
  };
  await db.insert(BLENDS_TABLE, asRow(blendToRow(blend)));
  return blend;
}

export async function updateBlend(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<Omit<Blend, 'id' | 'created_at'>>,
): Promise<void> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const existing = await db.query<BlendRow>(BLENDS_TABLE, { where: { id }, limit: 1 });
  const current = existing[0] ? blendFromRow(existing[0]) : null;
  if (!current) return;
  const merged: Blend = { ...current, ...patch, id: current.id, updated_at: now };
  await db.update<BlendRow>(BLENDS_TABLE, id, asRow(blendToRow(merged)));
}

export async function deleteBlend(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  const ingredients = await db.query<BlendIngredient & LocalDbRecord>(BLEND_INGREDIENTS_TABLE, {
    where: { blend_id: id },
  });
  for (const ing of ingredients) await db.delete(BLEND_INGREDIENTS_TABLE, ing.id);
  await db.delete(BLENDS_TABLE, id);
}

export async function addBlendIngredient(
  db: ShippieLocalDb,
  input: Omit<BlendIngredient, 'id'> & { id?: string },
): Promise<BlendIngredient> {
  await ensureSchema(db);
  const ing: BlendIngredient = {
    id: input.id ?? newId(),
    blend_id: input.blend_id,
    herb_id: input.herb_id,
    parts: input.parts,
    notes: input.notes ?? null,
  };
  await db.insert(BLEND_INGREDIENTS_TABLE, asRow(ing));
  return ing;
}

export async function deleteBlendIngredient(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(BLEND_INGREDIENTS_TABLE, id);
}

// ── inventory ────────────────────────────────────────────────────────

export async function listInventory(db: ShippieLocalDb): Promise<InventoryRow[]> {
  await ensureSchema(db);
  return (await db.query<InventoryRow & LocalDbRecord>(INVENTORY_TABLE, {
    orderBy: { last_restocked_at: 'desc' },
  })) as InventoryRow[];
}

export async function getInventoryFor(
  db: ShippieLocalDb,
  herbId: string,
): Promise<InventoryRow | null> {
  await ensureSchema(db);
  const rows = await db.query<InventoryRow & LocalDbRecord>(INVENTORY_TABLE, {
    where: { herb_id: herbId },
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function setInventory(
  db: ShippieLocalDb,
  input: Omit<InventoryRow, 'id'> & { id?: string },
): Promise<InventoryRow> {
  await ensureSchema(db);
  const existing = await getInventoryFor(db, input.herb_id);
  if (existing) {
    const merged: InventoryRow = {
      ...existing,
      ...input,
      id: existing.id,
      last_restocked_at: input.last_restocked_at ?? new Date().toISOString(),
    };
    await db.update<InventoryRow & LocalDbRecord>(INVENTORY_TABLE, existing.id, asRow(merged));
    return merged;
  }
  const row: InventoryRow = {
    id: input.id ?? newId(),
    herb_id: input.herb_id,
    grams_on_hand: input.grams_on_hand,
    low_threshold_g: input.low_threshold_g ?? null,
    last_restocked_at: input.last_restocked_at ?? new Date().toISOString(),
  };
  await db.insert(INVENTORY_TABLE, asRow(row));
  return row;
}

// ── brew log ─────────────────────────────────────────────────────────

export async function appendBrewLog(
  db: ShippieLocalDb,
  input: Omit<BrewLogEntry, 'id'> & { id?: string },
): Promise<BrewLogEntry> {
  await ensureSchema(db);
  const entry: BrewLogEntry = {
    id: input.id ?? newId(),
    blend_id: input.blend_id,
    brewed_at: input.brewed_at,
    batch_label: input.batch_label ?? null,
    note: input.note ?? null,
  };
  await db.insert(BREW_LOG_TABLE, asRow(entry));
  return entry;
}

export async function listBrewLog(
  db: ShippieLocalDb,
  opts: { blendId?: string; limit?: number } = {},
): Promise<BrewLogEntry[]> {
  await ensureSchema(db);
  return (await db.query<BrewLogEntry & LocalDbRecord>(BREW_LOG_TABLE, {
    where: opts.blendId ? { blend_id: opts.blendId } : undefined,
    orderBy: { brewed_at: 'desc' },
    limit: opts.limit,
  })) as BrewLogEntry[];
}

export async function brewCount(db: ShippieLocalDb, blendId: string): Promise<number> {
  return (await listBrewLog(db, { blendId })).length;
}
