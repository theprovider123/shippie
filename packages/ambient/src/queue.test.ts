import { describe, expect, it, beforeEach } from 'bun:test';
import 'fake-indexeddb/auto';
import { drainQueue, enqueueAnalysis, _resetQueueForTest } from './queue.ts';
import { _openAmbientDb } from './insight-store.ts';

beforeEach(async () => {
  await _resetQueueForTest();
});

describe('ambient queue', () => {
  it('drainQueue returns an empty array when nothing has been enqueued', async () => {
    const drained = await drainQueue();
    expect(drained).toEqual([]);
  });

  it('round-trips a single enqueued analysis', async () => {
    await enqueueAnalysis({
      analyserId: 'sentiment-trend',
      collection: 'entries',
      cursorTs: 1_700_000_000_000,
      enqueuedAt: 1_700_000_001_000,
    });
    const drained = await drainQueue();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toEqual({
      analyserId: 'sentiment-trend',
      collection: 'entries',
      cursorTs: 1_700_000_000_000,
      enqueuedAt: 1_700_000_001_000,
    });
  });

  it('preserves all enqueued items across a single drain', async () => {
    await enqueueAnalysis({
      analyserId: 'sentiment-trend',
      collection: 'entries',
      cursorTs: 1,
      enqueuedAt: 10,
    });
    await enqueueAnalysis({
      analyserId: 'topic-cluster',
      collection: 'entries',
      cursorTs: 2,
      enqueuedAt: 20,
    });
    await enqueueAnalysis({
      analyserId: 'sentiment-trend',
      collection: 'meals',
      cursorTs: 3,
      enqueuedAt: 30,
    });
    const drained = await drainQueue();
    expect(drained).toHaveLength(3);
    const ids = drained.map((d) => d.analyserId).sort();
    expect(ids).toEqual(['sentiment-trend', 'sentiment-trend', 'topic-cluster']);
  });

  it('drainQueue clears the queue — a second drain returns empty', async () => {
    await enqueueAnalysis({
      analyserId: 'sentiment-trend',
      collection: 'entries',
      cursorTs: 1,
      enqueuedAt: 1,
    });
    const first = await drainQueue();
    expect(first).toHaveLength(1);
    const second = await drainQueue();
    expect(second).toEqual([]);
  });

  it('defaults enqueuedAt to roughly now when omitted', async () => {
    const before = Date.now();
    await enqueueAnalysis({
      analyserId: 'sentiment-trend',
      collection: 'entries',
      cursorTs: 0,
    });
    const after = Date.now();
    const drained = await drainQueue();
    expect(drained).toHaveLength(1);
    const stamped = drained[0]!.enqueuedAt;
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  it('enqueue + drain survive after a reset by reopening the db', async () => {
    await enqueueAnalysis({
      analyserId: 'sentiment-trend',
      collection: 'entries',
      cursorTs: 1,
      enqueuedAt: 1,
    });
    await _resetQueueForTest();
    const drained = await drainQueue();
    expect(drained).toEqual([]);
  });

  it('_resetQueueForTest closes the underlying db connection', async () => {
    // Force the db open.
    const db = await _openAmbientDb();
    expect(db.name).toBe('shippie-ambient');
    await _resetQueueForTest();
    // After reset the next open should yield a fresh, empty queue.
    const drained = await drainQueue();
    expect(drained).toEqual([]);
  });

  it('items enqueued sequentially come out as distinct records', async () => {
    for (let i = 0; i < 5; i++) {
      await enqueueAnalysis({
        analyserId: 'topic-cluster',
        collection: 'entries',
        cursorTs: i,
        enqueuedAt: 1000 + i,
      });
    }
    const drained = await drainQueue();
    expect(drained).toHaveLength(5);
    const cursors = drained.map((d) => d.cursorTs).sort((a, b) => a - b);
    expect(cursors).toEqual([0, 1, 2, 3, 4]);
  });
});
