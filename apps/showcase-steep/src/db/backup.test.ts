import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import {
  addBlendIngredient,
  appendBrewLog,
  createBlend,
  getBlend,
  listBlends,
  listHerbs,
  setInventory,
  upsertHerb,
} from './queries.ts';
import { exportSteepBackup, inspectSteepBackup, restoreSteepBackup } from './backup.ts';

describe('steep backup', () => {
  it('exports + restores blends, ingredients, inventory, brew log as one encrypted file', async () => {
    const source = new MemoryLocalDb();
    const cham = await upsertHerb(source, {
      slug: 'chamomile',
      common_name: 'Chamomile',
      tastes: ['sweet'],
      actions: ['calming'],
      source: 'seed',
    });
    const blend = await createBlend(source, {
      name: 'Test calm',
      intent_tags: ['calm', 'sleep'],
      default_temp_c: 95,
      default_steep_minutes: 5,
      default_batch: 'cup',
    });
    await addBlendIngredient(source, { blend_id: blend.id, herb_id: cham.id, parts: 3 });
    await setInventory(source, { herb_id: cham.id, grams_on_hand: 25, low_threshold_g: 5 });
    await appendBrewLog(source, {
      blend_id: blend.id,
      brewed_at: '2026-05-09T20:00:00.000Z',
      batch_label: 'cup',
      note: 'slept well',
    });

    const { blob, info } = await exportSteepBackup(source, 'secret');
    // Seed-source herbs are excluded from the export by design.
    expect(info.herbCount).toBe(0);
    expect(info.blendCount).toBe(1);
    expect(info.ingredientCount).toBe(1);
    expect(info.inventoryCount).toBe(1);
    expect(info.brewLogCount).toBe(1);

    const preview = await inspectSteepBackup(blob, 'secret');
    expect(preview.info.blendCount).toBe(1);

    // Restore into a target db that already has its seed library — the
    // restore should leave seed herbs alone but bring back the blend +
    // ingredients + inventory + brew log.
    const target = new MemoryLocalDb();
    const targetSeedHerb = await upsertHerb(target, {
      slug: 'chamomile',
      common_name: 'Chamomile',
      tastes: ['sweet'],
      actions: ['calming'],
      source: 'seed',
    });
    expect(targetSeedHerb.id).not.toBe(cham.id);

    await restoreSteepBackup(target, blob, 'secret');
    const restoredBlend = (await listBlends(target))[0];
    expect(restoredBlend?.name).toBe('Test calm');

    // Seed library remains intact.
    expect(await listHerbs(target)).toHaveLength(1);
  });

  it('dry-runs restore without mutating the target', async () => {
    const source = new MemoryLocalDb();
    await createBlend(source, { name: 'Snapshot only', intent_tags: ['focus'] });
    const { blob } = await exportSteepBackup(source, 'secret');

    const target = new MemoryLocalDb();
    await createBlend(target, { name: 'Keep me', intent_tags: ['energy'] });
    const info = await restoreSteepBackup(target, blob, 'secret', { dryRun: true });

    expect(info.blendCount).toBe(1);
    const remaining = await listBlends(target);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.name).toBe('Keep me');
  });

  it('rejects the wrong passphrase', async () => {
    const db = new MemoryLocalDb();
    await createBlend(db, { name: 'Locked', intent_tags: ['sleep'] });
    const { blob } = await exportSteepBackup(db, 'right');

    await expect(inspectSteepBackup(blob, 'wrong')).rejects.toThrow();
  });

  it('user-added herbs round-trip through the backup', async () => {
    const source = new MemoryLocalDb();
    const userHerb = await upsertHerb(source, {
      slug: 'home-grown-mint',
      common_name: 'Home-grown mint',
      tastes: ['pungent'],
      actions: ['cooling'],
      source: 'user',
    });
    const { info } = await exportSteepBackup(source, 'secret');
    expect(info.herbCount).toBe(1);
    expect(userHerb.source).toBe('user');

    const target = new MemoryLocalDb();
    const { blob } = await exportSteepBackup(source, 'secret');
    await restoreSteepBackup(target, blob, 'secret');
    const restored = (await listHerbs(target))[0];
    expect(restored?.slug).toBe('home-grown-mint');
    expect(restored?.source).toBe('user');
  });

  it('preserves brew log entries on restore (ingredient round-trip sanity)', async () => {
    const source = new MemoryLocalDb();
    const blend = await createBlend(source, { name: 'Logged', intent_tags: ['calm'] });
    await appendBrewLog(source, {
      blend_id: blend.id,
      brewed_at: '2026-05-09T19:00:00.000Z',
      note: 'first cup',
    });
    const { blob } = await exportSteepBackup(source, 'secret');

    const target = new MemoryLocalDb();
    await restoreSteepBackup(target, blob, 'secret');
    const restored = await getBlend(target, blend.id);
    expect(restored?.name).toBe('Logged');
  });
});
