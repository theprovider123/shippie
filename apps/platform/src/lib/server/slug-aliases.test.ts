import { describe, expect, test, vi } from 'vitest';
import { resolveSlugAlias, recordSlugRename } from './slug-aliases';

/** Fake drizzle client whose select chain resolves to `row`. */
function dbReturning(row: { targetSlug: string } | undefined) {
  return {
    select() {
      return {
        from() {
          return this;
        },
        where() {
          return this;
        },
        limit() {
          return Promise.resolve(row ? [row] : []);
        },
      };
    },
  } as never;
}

describe('resolveSlugAlias', () => {
  test('returns the target slug when an alias row exists', async () => {
    await expect(resolveSlugAlias(dbReturning({ targetSlug: 'new-name' }), 'old-name')).resolves.toBe(
      'new-name',
    );
  });

  test('returns null when no alias row exists', async () => {
    await expect(resolveSlugAlias(dbReturning(undefined), 'whatever')).resolves.toBeNull();
  });

  test('guards against a self-referential alias (no redirect loop)', async () => {
    await expect(resolveSlugAlias(dbReturning({ targetSlug: 'same' }), 'same')).resolves.toBeNull();
  });
});

describe('recordSlugRename', () => {
  test('is a no-op when the slug is unchanged (touches no DB ops)', async () => {
    const db = {
      update: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
    } as never;
    await recordSlugRename(db, { appId: 'a1', fromSlug: 'same', toSlug: 'same' });
    expect((db as { update: ReturnType<typeof vi.fn> }).update).not.toHaveBeenCalled();
    expect((db as { insert: ReturnType<typeof vi.fn> }).insert).not.toHaveBeenCalled();
    expect((db as { delete: ReturnType<typeof vi.fn> }).delete).not.toHaveBeenCalled();
  });

  test('on rename: re-points existing aliases, upserts old→new, clears the new slug', async () => {
    const calls: string[] = [];
    const chain = (kind: string) => {
      calls.push(kind);
      const node: Record<string, unknown> = {};
      for (const m of ['set', 'where', 'values', 'onConflictDoUpdate']) {
        node[m] = () => node;
      }
      // terminal ops resolve to a promise so `await` works
      node.where = () => Promise.resolve();
      node.onConflictDoUpdate = () => Promise.resolve();
      return node;
    };
    const db = {
      update: () => chain('update'),
      insert: () => chain('insert'),
      delete: () => chain('delete'),
    } as never;

    await recordSlugRename(db, { appId: 'a1', fromSlug: 'old', toSlug: 'new' });
    expect(calls).toEqual(['update', 'insert', 'delete']);
  });
});
