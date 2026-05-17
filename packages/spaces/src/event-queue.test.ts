import { describe, expect, test } from 'bun:test';
import { createMemoryEventQueue } from './index.ts';

describe('space event queue', () => {
  test('drains successfully sent events in created order', async () => {
    const queue = createMemoryEventQueue<{ value: number }>();
    await queue.add({ id: 'b', payload: { value: 2 }, createdAt: 2 });
    await queue.add({ id: 'a', payload: { value: 1 }, createdAt: 1 });
    const sent: number[] = [];
    const drained = await queue.drain(async (event) => {
      sent.push(event.payload.value);
      return event.id === 'a';
    });
    expect(drained).toBe(1);
    expect(sent).toEqual([1, 2]);
    expect((await queue.all()).map((event) => event.id)).toEqual(['b']);
  });
});

