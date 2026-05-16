import { describe, expect, test } from 'bun:test';
import { createMemoryVoteQueue } from './vote-queue.ts';

describe('memory vote queue', () => {
  test('dedupes by id and drains in creation order', async () => {
    const queue = createMemoryVoteQueue<{ n: number }>();
    await queue.add({ id: 'b', payload: { n: 2 }, createdAt: 2 });
    await queue.add({ id: 'a', payload: { n: 1 }, createdAt: 1 });
    await queue.add({ id: 'b', payload: { n: 3 }, createdAt: 3 });

    const seen: number[] = [];
    const drained = await queue.drain(async (message) => {
      seen.push(message.payload.n);
      return true;
    });

    expect(drained).toBe(2);
    expect(seen).toEqual([1, 3]);
    expect(await queue.all()).toEqual([]);
  });

  test('keeps messages when send fails', async () => {
    const queue = createMemoryVoteQueue<{ n: number }>();
    await queue.add({ id: 'a', payload: { n: 1 }, createdAt: 1 });
    await queue.add({ id: 'b', payload: { n: 2 }, createdAt: 2 });

    const drained = await queue.drain(async (message) => message.id === 'a');

    expect(drained).toBe(1);
    expect((await queue.all()).map((item) => item.id)).toEqual(['b']);
  });
});
