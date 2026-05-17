import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import {
  addBlendIngredient,
  appendBrewLog,
  brewCount,
  createBlend,
  deleteBlend,
  getBlend,
  getHerb,
  getHerbBySlug,
  listBlends,
  listBrewLog,
  listHerbs,
  listInventory,
  setInventory,
  upsertHerb,
} from './queries.ts';

describe('herbs', () => {
  it('round-trips array tag fields through encode/decode', async () => {
    const db = new MemoryLocalDb();
    await upsertHerb(db, {
      slug: 'chamomile',
      common_name: 'Chamomile',
      latin_name: 'Matricaria chamomilla',
      tastes: ['sweet', 'bitter'],
      actions: ['calming', 'digestive'],
      source: 'seed',
    });
    const herb = await getHerbBySlug(db, 'chamomile');
    expect(herb?.tastes).toEqual(['sweet', 'bitter']);
    expect(herb?.actions).toEqual(['calming', 'digestive']);
  });

  it('upsert by slug updates the existing row instead of inserting', async () => {
    const db = new MemoryLocalDb();
    const first = await upsertHerb(db, {
      slug: 'rose',
      common_name: 'Rose petals',
      tastes: ['sweet'],
      actions: ['cooling'],
      source: 'seed',
    });
    await upsertHerb(db, {
      slug: 'rose',
      common_name: 'Rose petals',
      tastes: ['sweet', 'astringent'],
      actions: ['cooling', 'aromatic'],
      source: 'seed',
    });
    const all = await listHerbs(db);
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(first.id);
    expect(all[0]?.tastes).toEqual(['sweet', 'astringent']);
  });
});

describe('blends', () => {
  it('creates a blend, attaches ingredients, fetches it with herb expansion', async () => {
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
      tastes: ['sweet', 'bitter'],
      actions: ['calming', 'aromatic'],
      source: 'seed',
    });
    const blend = await createBlend(db, {
      name: 'Evening calm',
      intent_tags: ['sleep', 'calm'],
      default_temp_c: 95,
      default_steep_minutes: 5,
      default_batch: 'cup',
    });
    await addBlendIngredient(db, { blend_id: blend.id, herb_id: cham.id, parts: 3 });
    await addBlendIngredient(db, { blend_id: blend.id, herb_id: lav.id, parts: 1 });

    const full = await getBlend(db, blend.id);
    expect(full?.intent_tags).toEqual(['sleep', 'calm']);
    expect(full?.ingredients).toHaveLength(2);
    expect(full?.ingredients[0]?.herb?.common_name).toBeTruthy();
    expect(full?.ingredients.reduce((sum, ing) => sum + ing.parts, 0)).toBe(4);
  });

  it('deleting a blend removes its ingredient rows too', async () => {
    const db = new MemoryLocalDb();
    const herb = await upsertHerb(db, {
      slug: 'mint',
      common_name: 'Peppermint',
      tastes: ['pungent'],
      actions: ['cooling', 'digestive'],
      source: 'seed',
    });
    const blend = await createBlend(db, { name: 'After dinner', intent_tags: ['digestion'] });
    await addBlendIngredient(db, { blend_id: blend.id, herb_id: herb.id, parts: 1 });

    await deleteBlend(db, blend.id);

    expect(await listBlends(db)).toHaveLength(0);
    const remaining = await getBlend(db, blend.id);
    expect(remaining).toBeNull();
  });
});

describe('inventory', () => {
  it('setInventory upserts on herb_id', async () => {
    const db = new MemoryLocalDb();
    const herb = await upsertHerb(db, {
      slug: 'tulsi',
      common_name: 'Tulsi',
      tastes: ['pungent', 'astringent'],
      actions: ['uplifting', 'aromatic'],
      source: 'seed',
    });
    await setInventory(db, { herb_id: herb.id, grams_on_hand: 25, low_threshold_g: 5 });
    await setInventory(db, { herb_id: herb.id, grams_on_hand: 50, low_threshold_g: 10 });

    const all = await listInventory(db);
    expect(all).toHaveLength(1);
    expect(all[0]?.grams_on_hand).toBe(50);
    expect(all[0]?.low_threshold_g).toBe(10);
  });
});

describe('brew log', () => {
  it('appends entries and counts per blend', async () => {
    const db = new MemoryLocalDb();
    const blend = await createBlend(db, { name: 'Daily focus', intent_tags: ['focus'] });
    const at = (n: number) => new Date(Date.UTC(2026, 4, n)).toISOString();
    await appendBrewLog(db, { blend_id: blend.id, brewed_at: at(1), batch_label: 'cup' });
    await appendBrewLog(db, { blend_id: blend.id, brewed_at: at(2), batch_label: 'pot', note: 'gave me focus through the meeting' });
    await appendBrewLog(db, { blend_id: 'other-blend', brewed_at: at(3) });

    expect(await brewCount(db, blend.id)).toBe(2);
    const entries = await listBrewLog(db, { blendId: blend.id });
    expect(entries[0]?.note).toContain('meeting');
  });
});

describe('herbs vs blends are independent', () => {
  it('listHerbs orders by common_name; listBlends orders by updated_at desc', async () => {
    const db = new MemoryLocalDb();
    await upsertHerb(db, { slug: 'rose', common_name: 'Rose', tastes: ['sweet'], actions: ['cooling'], source: 'seed' });
    await upsertHerb(db, { slug: 'cham', common_name: 'Chamomile', tastes: ['sweet'], actions: ['calming'], source: 'seed' });
    expect((await listHerbs(db)).map((h) => h.common_name)).toEqual(['Chamomile', 'Rose']);

    const first = await createBlend(db, { name: 'A', intent_tags: ['sleep'] });
    await new Promise((r) => setTimeout(r, 5));
    const second = await createBlend(db, { name: 'B', intent_tags: ['focus'] });
    const blends = await listBlends(db);
    expect(blends[0]?.id).toBe(second.id);
    expect(blends[1]?.id).toBe(first.id);
    expect(await getHerb(db, 'no-such-id')).toBeNull();
  });
});
