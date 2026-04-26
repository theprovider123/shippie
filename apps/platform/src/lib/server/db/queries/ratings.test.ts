/**
 * Tests for `summaryForApp` — the rating distribution + average.
 *
 * Driven by a stubbed Drizzle `db` that responds to the chained
 * select-from-where call. We only care about the aggregation logic,
 * not the SQL — that's exercised by the dual-write integration tests
 * in Phase 2.
 */
import { describe, expect, it } from 'vitest';
import { summaryForApp } from './ratings';

interface FakeRow { rating: number; }

function fakeDb(rows: FakeRow[]) {
  // The query under test does:
  //   db.select({rating: ...}).from(table).where(eq(...))
  // Each call returns `this` until `.where()`, which resolves the rows.
  const chain = {
    select() { return this; },
    from() { return this; },
    where() { return Promise.resolve(rows); },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return chain as any;
}

describe('summaryForApp', () => {
  it('returns zeros for an app with no ratings', async () => {
    const out = await summaryForApp(fakeDb([]), 'app-id');
    expect(out).toEqual({
      average: 0,
      count: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it('averages a uniform distribution', async () => {
    const rows = [{ rating: 5 }, { rating: 5 }, { rating: 5 }];
    const out = await summaryForApp(fakeDb(rows), 'app-id');
    expect(out.average).toBe(5);
    expect(out.count).toBe(3);
    expect(out.distribution[5]).toBe(3);
  });

  it('handles a mixed distribution', async () => {
    const rows = [
      { rating: 1 },
      { rating: 3 },
      { rating: 5 },
      { rating: 5 },
    ];
    const out = await summaryForApp(fakeDb(rows), 'app-id');
    expect(out.count).toBe(4);
    expect(out.average).toBe(3.5);
    expect(out.distribution).toEqual({ 1: 1, 2: 0, 3: 1, 4: 0, 5: 2 });
  });

  it('drops out-of-range ratings (defensive — schema forbids them)', async () => {
    const rows = [{ rating: 5 }, { rating: 6 }, { rating: 0 }, { rating: 3 }];
    const out = await summaryForApp(fakeDb(rows), 'app-id');
    // 6 and 0 are dropped from the distribution but still counted in
    // `count` (they're rows in the table); average uses only valid sum.
    expect(out.distribution[5]).toBe(1);
    expect(out.distribution[3]).toBe(1);
    expect(out.distribution[6 as 1]).toBeUndefined();
  });
});
