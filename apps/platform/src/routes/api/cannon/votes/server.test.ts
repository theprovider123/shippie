import { describe, expect, test } from 'vitest';
import { POST } from './+server';
import { fakeCannonDb } from '$lib/server/cannon/fake-d1';

const ANON = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function dbWithTake(up = 100, down = 10) {
  return fakeCannonDb({
    takes: [
      { id: 't1', handle: 'NorthBankNelson', anon_key: 'seed', thread: 'MATCH', text: 'x', up, down, created_at: 1 },
    ],
  });
}

function eventFor(body: unknown, db: ReturnType<typeof fakeCannonDb>) {
  return {
    request: new Request('https://shippie.app/api/cannon/votes', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    url: new URL('https://shippie.app/api/cannon/votes'),
    platform: { env: { DB: db } },
  } as unknown as Parameters<typeof POST>[0];
}

describe('/api/cannon/votes', () => {
  test('up vote increments on top of the seeded baseline', async () => {
    const db = dbWithTake(100, 10);
    const res = await POST(eventFor({ takeId: 't1', anonKey: ANON, dir: 'up' }, db));
    await expect(res.json()).resolves.toMatchObject({ up: 101, down: 10, myVote: 'up' });
  });

  test('flipping up to down moves both counters', async () => {
    const db = dbWithTake(100, 10);
    await POST(eventFor({ takeId: 't1', anonKey: ANON, dir: 'up' }, db));
    const res = await POST(eventFor({ takeId: 't1', anonKey: ANON, dir: 'down' }, db));
    await expect(res.json()).resolves.toMatchObject({ up: 100, down: 11, myVote: 'down' });
  });

  test('clearing a vote restores the baseline', async () => {
    const db = dbWithTake(100, 10);
    await POST(eventFor({ takeId: 't1', anonKey: ANON, dir: 'up' }, db));
    const res = await POST(eventFor({ takeId: 't1', anonKey: ANON, dir: null }, db));
    await expect(res.json()).resolves.toMatchObject({ up: 100, down: 10, myVote: null });
    expect(db.votes).toHaveLength(0);
  });

  test('repeating the same direction is a no-op', async () => {
    const db = dbWithTake(100, 10);
    await POST(eventFor({ takeId: 't1', anonKey: ANON, dir: 'up' }, db));
    const res = await POST(eventFor({ takeId: 't1', anonKey: ANON, dir: 'up' }, db));
    await expect(res.json()).resolves.toMatchObject({ up: 101, down: 10, myVote: 'up' });
    expect(db.votes).toHaveLength(1);
  });

  test('two voters accumulate independently', async () => {
    const db = dbWithTake(0, 0);
    await POST(eventFor({ takeId: 't1', anonKey: ANON, dir: 'up' }, db));
    const res = await POST(eventFor({ takeId: 't1', anonKey: 'other-key-123', dir: 'up' }, db));
    await expect(res.json()).resolves.toMatchObject({ up: 2, down: 0 });
  });

  test('404 for an unknown take, 400 for a bad direction', async () => {
    const db = dbWithTake();
    expect((await POST(eventFor({ takeId: 'nope', anonKey: ANON, dir: 'up' }, db))).status).toBe(404);
    expect((await POST(eventFor({ takeId: 't1', anonKey: ANON, dir: 'sideways' }, db))).status).toBe(400);
  });
});
