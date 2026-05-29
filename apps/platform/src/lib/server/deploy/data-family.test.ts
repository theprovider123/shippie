import { describe, expect, it } from 'vitest';
import { fallbackDataFamily, resolveStableDataFamily } from './data-family';

function makeDb(storedFamily: string | null) {
  const updates: Array<{ dataFamily?: string }> = [];
  const db = {
    select() {
      return {
        from() {
          return this;
        },
        where() {
          return this;
        },
        limit() {
          return Promise.resolve([{ dataFamily: storedFamily }]);
        },
      };
    },
    update() {
      return {
        set(values: { dataFamily?: string }) {
          updates.push(values);
          return {
            where() {
              return Promise.resolve();
            },
          };
        },
      };
    },
  } as never;
  return { db, updates };
}

describe('fallbackDataFamily', () => {
  it('derives a stable, slug-free family from the immutable app id', () => {
    const appId = '550e8400-e29b-41d4-a716-446655440000';
    expect(fallbackDataFamily(appId)).toBe('app-550e8400e29b');
    // deterministic — same id always yields same family (rename-proof)
    expect(fallbackDataFamily(appId)).toBe(fallbackDataFamily(appId));
  });

  it('falls back to local-tool for a degenerate id', () => {
    expect(fallbackDataFamily('---')).toBe('local-tool');
  });
});

describe('resolveStableDataFamily', () => {
  it('returns the already-locked family and does NOT rewrite it (rename-proof)', async () => {
    const { db, updates } = makeDb('cooking');
    const family = await resolveStableDataFamily(db, 'app-1', 'something-else');
    expect(family).toBe('cooking');
    expect(updates).toEqual([]); // never re-locks
  });

  it('locks the declared family on first deploy', async () => {
    const { db, updates } = makeDb(null);
    const family = await resolveStableDataFamily(db, 'app-1', 'recipes');
    expect(family).toBe('recipes');
    expect(updates).toEqual([{ dataFamily: 'recipes' }]);
  });

  it('locks an app-id-derived family when none is declared', async () => {
    const { db, updates } = makeDb(null);
    const family = await resolveStableDataFamily(db, '550e8400-e29b-41d4-a716-446655440000', null);
    expect(family).toBe('app-550e8400e29b');
    expect(updates).toEqual([{ dataFamily: 'app-550e8400e29b' }]);
  });
});
