/**
 * listAccountDock partition logic — splits rows into active saved slugs
 * and tombstones. Driven by a fake Drizzle chain (select→from→where→
 * orderBy), matching the repo's query-test pattern; the SQL itself is
 * exercised by migration/integration coverage, not here.
 */
import { describe, expect, it } from 'vitest';
import { listAccountDock } from './account-dock';

interface FakeRow {
  slug: string;
  removedAt: string | null;
  savedAt: string;
}

function fakeDb(rows: FakeRow[]) {
  const chain = {
    select() { return this; },
    from() { return this; },
    where() { return this; },
    orderBy() { return Promise.resolve(rows); },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return chain as any;
}

describe('listAccountDock', () => {
  it('returns empty arrays for a user with no dock rows', async () => {
    const out = await listAccountDock(fakeDb([]), 'user-1');
    expect(out).toEqual({ saved: [], removed: [] });
  });

  it('splits active saves from tombstones, preserving query order', async () => {
    const out = await listAccountDock(
      fakeDb([
        { slug: 'palate', removedAt: null, savedAt: '2026-06-13T10:00:00Z' },
        { slug: 'golazo', removedAt: '2026-06-13T09:00:00Z', savedAt: '2026-06-12T09:00:00Z' },
        { slug: 'coffee', removedAt: null, savedAt: '2026-06-11T08:00:00Z' },
      ]),
      'user-1',
    );
    expect(out.saved).toEqual(['palate', 'coffee']);
    expect(out.removed).toEqual(['golazo']);
  });
});
