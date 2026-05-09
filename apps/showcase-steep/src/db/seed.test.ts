import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import { getBlend, getHerbBySlug, listBlends, listHerbs } from './queries.ts';
import { SEED_BLENDS, SEED_HERBS, seedIfEmpty } from './seed.ts';

describe('seed library', () => {
  it('every blend ingredient slug resolves to a seeded herb', () => {
    const slugs = new Set(SEED_HERBS.map((h) => h.slug));
    for (const blend of SEED_BLENDS) {
      for (const ing of blend.ingredients) {
        expect(slugs.has(ing.slug)).toBe(true);
      }
    }
  });

  it('every seeded herb has unique slug, has tastes + actions, sane brew defaults', () => {
    const seenSlugs = new Set<string>();
    for (const herb of SEED_HERBS) {
      expect(seenSlugs.has(herb.slug)).toBe(false);
      seenSlugs.add(herb.slug);
      expect(herb.tastes.length).toBeGreaterThan(0);
      expect(herb.actions.length).toBeGreaterThan(0);
      expect(herb.default_brew_temp_c).toBeGreaterThanOrEqual(60);
      expect(herb.default_brew_temp_c).toBeLessThanOrEqual(100);
      expect(herb.default_steep_minutes).toBeGreaterThan(0);
      expect(herb.max_resteeps).toBeGreaterThanOrEqual(1);
    }
  });

  it('seedIfEmpty hydrates herbs + blends on a fresh db', async () => {
    const db = new MemoryLocalDb();
    const result = await seedIfEmpty(db);
    expect(result.herbsAdded).toBe(SEED_HERBS.length);
    expect(result.blendsAdded).toBe(SEED_BLENDS.length);

    const herbs = await listHerbs(db);
    expect(herbs.length).toBe(SEED_HERBS.length);
    expect(herbs.every((h) => h.source === 'seed')).toBe(true);

    const blends = await listBlends(db);
    expect(blends.length).toBe(SEED_BLENDS.length);

    const evening = blends.find((b) => b.name === 'Evening calm');
    expect(evening).toBeTruthy();
    if (evening) {
      const full = await getBlend(db, evening.id);
      expect(full?.ingredients.length).toBeGreaterThan(0);
      // Each ingredient should be linked to a real seeded herb.
      for (const ing of full?.ingredients ?? []) {
        expect(ing.herb).toBeTruthy();
      }
    }
  });

  it('seedIfEmpty is idempotent — second call adds nothing', async () => {
    const db = new MemoryLocalDb();
    await seedIfEmpty(db);
    const second = await seedIfEmpty(db);
    expect(second.herbsAdded).toBe(0);
    expect(second.blendsAdded).toBe(0);
  });

  it('chamomile slug is present (sanity check on canonical herb)', async () => {
    const db = new MemoryLocalDb();
    await seedIfEmpty(db);
    const cham = await getHerbBySlug(db, 'chamomile');
    expect(cham?.common_name).toBe('Chamomile');
    expect(cham?.actions).toContain('calming');
  });
});
