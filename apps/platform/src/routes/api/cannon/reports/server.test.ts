import { describe, expect, test } from 'vitest';
import { POST } from './+server';
import { fakeCannonDb, type TakeRec } from '$lib/server/cannon/fake-d1';

const KEY = (n: number) => `aaaaaaaa-bbbb-cccc-dddd-${String(n).padStart(12, '0')}`;

function takeSeed(): TakeRec[] {
  return [
    { id: 't1', handle: 'NorthBankNelson', anon_key: 'seed', thread: 'MATCH', text: 'spicy', up: 2, down: 0, created_at: 1000, status: 'visible', report_count: 0 },
  ];
}

function eventFor(body: unknown, db: ReturnType<typeof fakeCannonDb>) {
  return {
    request: new Request('https://shippie.app/api/cannon/reports', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    platform: { env: { DB: db } },
  } as unknown as Parameters<typeof POST>[0];
}

describe('/api/cannon/reports', () => {
  test('a report records and the take stays visible below the threshold', async () => {
    const db = fakeCannonDb({ takes: takeSeed() });
    const res = await POST(eventFor({ takeId: 't1', anonKey: KEY(1), reason: 'abuse' }, db));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { hidden: boolean }).hidden).toBe(false);
    expect(db.reports).toHaveLength(1);
    expect(db.takes[0].status).toBe('visible');
    expect(db.takes[0].report_count).toBe(1);
  });

  test('repeat reports from the same key are idempotent', async () => {
    const db = fakeCannonDb({ takes: takeSeed() });
    await POST(eventFor({ takeId: 't1', anonKey: KEY(1), reason: 'abuse' }, db));
    await POST(eventFor({ takeId: 't1', anonKey: KEY(1), reason: 'spam' }, db));
    expect(db.reports).toHaveLength(1);
    expect(db.takes[0].report_count).toBe(1);
  });

  test('the third distinct reporter auto-hides the take', async () => {
    const db = fakeCannonDb({ takes: takeSeed() });
    await POST(eventFor({ takeId: 't1', anonKey: KEY(1), reason: 'abuse' }, db));
    await POST(eventFor({ takeId: 't1', anonKey: KEY(2), reason: 'abuse' }, db));
    const res = await POST(eventFor({ takeId: 't1', anonKey: KEY(3), reason: 'spam' }, db));
    expect(((await res.json()) as { hidden: boolean }).hidden).toBe(true);
    expect(db.takes[0].status).toBe('hidden');
    expect(db.takes[0].report_count).toBe(3);
  });

  test('rejects bad reason, bad key, unknown take', async () => {
    const db = fakeCannonDb({ takes: takeSeed() });
    expect((await POST(eventFor({ takeId: 't1', anonKey: KEY(1), reason: 'meh' }, db))).status).toBe(400);
    expect((await POST(eventFor({ takeId: 't1', anonKey: 'no', reason: 'abuse' }, db))).status).toBe(400);
    expect((await POST(eventFor({ takeId: 'ghost', anonKey: KEY(1), reason: 'abuse' }, db))).status).toBe(404);
  });
});
