import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { RESERVED_SLUGS_SEED } from './reserved-slugs';

// The reserved_slugs table is seeded by a hand-written SQL migration
// (drizzle/0039_seed_reserved_slugs.sql) because db:migrate runs
// `wrangler d1 migrations apply`, not drizzle-kit. This guard fails if the
// RESERVED_SLUGS_SEED constant and the migration drift apart, which would
// silently leave a reserved slug claimable in production.
const migrationSql = readFileSync(
  new URL('../../../../../drizzle/0039_seed_reserved_slugs.sql', import.meta.url),
  'utf8',
);

describe('reserved slug seed', () => {
  it('has no duplicate slugs in the constant', () => {
    const slugs = RESERVED_SLUGS_SEED.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('seeds every constant entry in the 0039 migration', () => {
    const missing = RESERVED_SLUGS_SEED.filter((r) => !migrationSql.includes(`('${r.slug}', `));
    expect(missing.map((r) => r.slug)).toEqual([]);
  });

  it('uses INSERT OR IGNORE so re-runs are idempotent', () => {
    expect(migrationSql).toMatch(/INSERT OR IGNORE INTO reserved_slugs/i);
  });

  it('reserves the live route-collision slugs that would shadow real routes', () => {
    const slugs = new Set(RESERVED_SLUGS_SEED.map((r) => r.slug));
    for (const route of ['run', 'you', 'c', 'glance', 'today', 'arcade', 'labs', 'invite']) {
      expect(slugs.has(route)).toBe(true);
    }
  });
});
