import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import { createEntry, deleteEntry, getEntry, listEntries, listEntriesByTopic, updateEntry } from './queries.ts';

describe('journal queries', () => {
  it('inserts and retrieves an entry', async () => {
    const db = new MemoryLocalDb();
    const created = await createEntry(db, {
      body: 'Today I went hiking with my brother.',
      sentiment: 0.5,
      sentiment_label: 'positive',
      topic: 'relationships',
    });
    const back = await getEntry(db, created.id);
    expect(back?.body).toBe('Today I went hiking with my brother.');
    expect(back?.sentiment_label).toBe('positive');
    expect(back?.topic).toBe('relationships');
  });

  it('lists entries newest-first', async () => {
    const db = new MemoryLocalDb();
    const a = await createEntry(db, { body: 'first' });
    await new Promise((r) => setTimeout(r, 4));
    const b = await createEntry(db, { body: 'second' });
    const list = await listEntries(db);
    expect(list[0]!.id).toBe(b.id);
    expect(list[1]!.id).toBe(a.id);
  });

  it('filters by topic', async () => {
    const db = new MemoryLocalDb();
    await createEntry(db, { body: 'standup', topic: 'work' });
    await createEntry(db, { body: 'gym', topic: 'health' });
    await createEntry(db, { body: 'spec review', topic: 'work' });
    const work = await listEntriesByTopic(db, 'work');
    expect(work).toHaveLength(2);
  });

  it('updates and deletes', async () => {
    const db = new MemoryLocalDb();
    const e = await createEntry(db, { body: 'draft' });
    await updateEntry(db, e.id, { body: 'final' });
    const after = await getEntry(db, e.id);
    expect(after?.body).toBe('final');
    await deleteEntry(db, e.id);
    expect(await getEntry(db, e.id)).toBeNull();
  });
});
