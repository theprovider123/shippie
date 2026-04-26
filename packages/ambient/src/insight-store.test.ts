import { describe, expect, it, beforeEach } from 'bun:test';
import 'fake-indexeddb/auto';
import {
  appendInsight,
  dismiss,
  listUndismissed,
  markShown,
  _resetInsightStoreForTest,
  _openAmbientDb,
} from './insight-store.ts';
import type { Insight } from './types.ts';

function makeInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    id: 'i-1',
    collection: 'entries',
    generatedAt: 1_700_000_000_000,
    urgency: 'medium',
    title: 'Mood trended down',
    summary: 'Your mood has trended down this week.',
    ...overrides,
  };
}

beforeEach(async () => {
  await _resetInsightStoreForTest();
});

describe('insight store', () => {
  it('returns empty list when nothing has been appended', async () => {
    const list = await listUndismissed();
    expect(list).toEqual([]);
  });

  it('round-trips an appended insight', async () => {
    const insight = makeInsight();
    await appendInsight(insight);
    const list = await listUndismissed();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(insight);
  });

  it('persists multiple insights and returns all undismissed', async () => {
    await appendInsight(makeInsight({ id: 'a' }));
    await appendInsight(makeInsight({ id: 'b' }));
    await appendInsight(makeInsight({ id: 'c' }));
    const list = await listUndismissed();
    expect(list).toHaveLength(3);
    const ids = list.map((i) => i.id).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('markShown updates the shown flag and persists', async () => {
    await appendInsight(makeInsight({ id: 'a' }));
    await markShown('a');
    const list = await listUndismissed();
    expect(list).toHaveLength(1);
    expect(list[0]?.shown).toBe(true);
  });

  it('dismiss filters the insight out of listUndismissed', async () => {
    await appendInsight(makeInsight({ id: 'a' }));
    await appendInsight(makeInsight({ id: 'b' }));
    await dismiss('a');
    const list = await listUndismissed();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('b');
  });

  it('dismiss persists across reopens (no in-memory caching of result)', async () => {
    await appendInsight(makeInsight({ id: 'a' }));
    await dismiss('a');
    // Re-fetching should still see it dismissed.
    const list = await listUndismissed();
    expect(list).toEqual([]);
  });

  it('listUndismissed filters by collection when provided', async () => {
    await appendInsight(makeInsight({ id: 'a', collection: 'entries' }));
    await appendInsight(makeInsight({ id: 'b', collection: 'meals' }));
    await appendInsight(makeInsight({ id: 'c', collection: 'entries' }));
    const entries = await listUndismissed({ collection: 'entries' });
    expect(entries).toHaveLength(2);
    expect(entries.map((i) => i.id).sort()).toEqual(['a', 'c']);
    const meals = await listUndismissed({ collection: 'meals' });
    expect(meals).toHaveLength(1);
    expect(meals[0]?.id).toBe('b');
  });

  it('appending the same id overwrites the existing insight', async () => {
    await appendInsight(makeInsight({ id: 'a', title: 'first' }));
    await appendInsight(makeInsight({ id: 'a', title: 'second' }));
    const list = await listUndismissed();
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe('second');
  });

  it('markShown is a no-op for an unknown id', async () => {
    await markShown('does-not-exist');
    const list = await listUndismissed();
    expect(list).toEqual([]);
  });

  it('_resetInsightStoreForTest closes the connection and deletes the db', async () => {
    await appendInsight(makeInsight({ id: 'a' }));
    // Confirm db is open + populated.
    const before = await listUndismissed();
    expect(before).toHaveLength(1);
    await _resetInsightStoreForTest();
    // After reset, a fresh open should yield an empty store.
    const db = await _openAmbientDb();
    expect(db.name).toBe('shippie-ambient');
    const after = await listUndismissed();
    expect(after).toEqual([]);
  });
});
