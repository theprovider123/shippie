/**
 * Recovery drill — exercises the full restore path on every PR.
 *
 * The user's first encounter with a backup is at the worst possible
 * moment: storage was wiped, panic is in the air, they need their
 * blends back. So the only test that really matters is "if I export
 * and then wipe everything, can I get it back deep-equal." Anything
 * less leaves a backup format unverified at the boundary that counts.
 *
 * Mirrors apps/showcase-recipe/src/db/backup.recovery.test.ts.
 */
import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import {
  addBlendIngredient,
  appendBrewLog,
  createBlend,
  getBlend,
  listBlends,
  listInventory,
  setInventory,
  upsertHerb,
} from './queries.ts';
import { exportSteepBackup, restoreSteepBackup } from './backup.ts';
import {
  BLENDS_TABLE,
  BLEND_INGREDIENTS_TABLE,
  BREW_LOG_TABLE,
  HERBS_TABLE,
  INVENTORY_TABLE,
  type Blend,
  type BlendIngredient,
  type BlendWithIngredients,
  type BrewLogEntry,
  type InventoryRow,
} from './schema.ts';
import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';

describe('steep backup recovery drill', () => {
  it('round-trips multiple blends + ingredients + inventory + brew log after a full wipe', async () => {
    const db = new MemoryLocalDb();

    const cham = await upsertHerb(db, {
      slug: 'chamomile',
      common_name: 'Chamomile',
      tastes: ['sweet'],
      actions: ['calming'],
      source: 'seed',
    });
    const lav = await upsertHerb(db, {
      slug: 'lavender',
      common_name: 'Lavender',
      tastes: ['bitter'],
      actions: ['calming', 'aromatic'],
      source: 'seed',
    });
    const homeMint = await upsertHerb(db, {
      slug: 'home-mint',
      common_name: 'Home-grown mint',
      tastes: ['pungent'],
      actions: ['cooling'],
      source: 'user',
    });

    const evening = await createBlend(db, {
      name: 'Evening calm',
      intent_tags: ['sleep', 'calm'],
      default_temp_c: 95,
      default_steep_minutes: 6,
      default_batch: 'cup',
    });
    await addBlendIngredient(db, { blend_id: evening.id, herb_id: cham.id, parts: 3 });
    await addBlendIngredient(db, { blend_id: evening.id, herb_id: lav.id, parts: 1 });

    const afterDinner = await createBlend(db, {
      name: 'After dinner',
      intent_tags: ['digestion'],
      default_temp_c: 100,
      default_steep_minutes: 7,
      default_batch: 'cup',
    });
    await addBlendIngredient(db, { blend_id: afterDinner.id, herb_id: homeMint.id, parts: 2 });

    await setInventory(db, { herb_id: cham.id, grams_on_hand: 30, low_threshold_g: 5 });
    await setInventory(db, { herb_id: homeMint.id, grams_on_hand: 12, low_threshold_g: 3 });

    await appendBrewLog(db, {
      blend_id: evening.id,
      brewed_at: '2026-05-08T22:00:00.000Z',
      batch_label: 'cup',
      note: 'slept well',
    });
    await appendBrewLog(db, {
      blend_id: afterDinner.id,
      brewed_at: '2026-05-09T20:30:00.000Z',
      batch_label: 'cup',
    });

    const beforeMeta = stripVolatile(await fetchAll(db));
    const beforeInventory = sortInventory(await listInventory(db));
    const beforeBrewLog = (await fetchBrewLog(db)).map(stripBrewVolatile);

    const { blob, info } = await exportSteepBackup(db, 'drill-passphrase');
    expect(info.blendCount).toBe(2);
    expect(info.ingredientCount).toBe(3);
    expect(info.inventoryCount).toBe(2);
    expect(info.brewLogCount).toBe(2);
    expect(info.herbCount).toBe(1); // user-added only

    // Wipe every table — what the user sees after Safari evicts site
    // data, the browser profile is reset, or quota pressure clears the
    // vault. Seed herbs would re-seed on cold start; the rest must
    // come back from the backup.
    for (const t of [
      BREW_LOG_TABLE,
      INVENTORY_TABLE,
      BLEND_INGREDIENTS_TABLE,
      BLENDS_TABLE,
      HERBS_TABLE,
    ]) {
      const rows = (await db.query<LocalDbRecord>(t)) as LocalDbRecord[];
      for (const row of rows) await db.delete(t, String(row.id));
    }
    expect(await listBlends(db)).toHaveLength(0);

    await restoreSteepBackup(db, blob, 'drill-passphrase');

    expect(stripVolatile(await fetchAll(db))).toEqual(beforeMeta);
    expect(sortInventory(await listInventory(db))).toEqual(beforeInventory);
    expect((await fetchBrewLog(db)).map(stripBrewVolatile)).toEqual(beforeBrewLog);
  });

  it('aborts cleanly on a wrong passphrase without touching existing rows', async () => {
    const source = new MemoryLocalDb();
    await createBlend(source, { name: 'Source', intent_tags: ['calm'] });
    const { blob } = await exportSteepBackup(source, 'right');

    const target = new MemoryLocalDb();
    await createBlend(target, { name: 'Target survivor', intent_tags: ['focus'] });

    await expect(restoreSteepBackup(target, blob, 'wrong')).rejects.toThrow();
    const survivors = await listBlends(target);
    expect(survivors).toHaveLength(1);
    expect(survivors[0]?.name).toBe('Target survivor');
  });
});

async function fetchAll(db: ShippieLocalDb): Promise<BlendWithIngredients[]> {
  const blends = await listBlends(db);
  const sorted = [...blends].sort((a, b) => a.name.localeCompare(b.name));
  const result: BlendWithIngredients[] = [];
  for (const blend of sorted) {
    const full = await getBlend(db, blend.id);
    if (full) result.push(full);
  }
  return result;
}

async function fetchBrewLog(db: ShippieLocalDb): Promise<BrewLogEntry[]> {
  return (await db.query<BrewLogEntry & LocalDbRecord>(BREW_LOG_TABLE, {
    orderBy: { brewed_at: 'asc' },
  })) as BrewLogEntry[];
}

function sortInventory(rows: InventoryRow[]): InventoryRow[] {
  return [...rows].sort((a, b) => a.herb_id.localeCompare(b.herb_id));
}

interface ComparableBlend extends Omit<Blend, 'created_at' | 'updated_at'> {
  ingredients: Array<Omit<BlendIngredient, never>>;
}

function stripVolatile(blends: BlendWithIngredients[]): ComparableBlend[] {
  return blends.map(({ created_at: _c, updated_at: _u, ingredients, ...rest }) => ({
    ...rest,
    ingredients: [...ingredients]
      .map(({ herb: _h, ...ing }) => ing)
      .sort((a, b) => a.herb_id.localeCompare(b.herb_id)),
  }));
}

function stripBrewVolatile(entry: BrewLogEntry): Omit<BrewLogEntry, 'id'> & { id: string } {
  return entry;
}
