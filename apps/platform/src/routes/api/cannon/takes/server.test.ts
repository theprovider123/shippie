import { describe, expect, test } from 'vitest';
import { GET, POST } from './+server';
import { fakeCannonDb, type TakeRec } from '$lib/server/cannon/fake-d1';

const ANON = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function seedTakes(): TakeRec[] {
  return [
    { id: 't1', handle: 'NorthBankNelson', anon_key: 'seed', thread: 'MATCH', text: 'one', up: 10, down: 1, created_at: 1000 },
    { id: 't2', handle: 'ClockEndCyrus', anon_key: 'seed', thread: 'ANALYSIS', text: 'two', up: 5, down: 9, created_at: 2000 },
    { id: 't3', handle: 'IslingtonIvan', anon_key: 'seed', thread: 'HISTORY', text: 'three', up: 7, down: 0, created_at: 3000 },
  ];
}

function eventFor({
  method = 'GET',
  url = 'https://shippie.app/api/cannon/takes',
  body,
  db = fakeCannonDb(),
}: {
  method?: string;
  url?: string;
  body?: unknown;
  db?: ReturnType<typeof fakeCannonDb>;
} = {}) {
  return {
    request: new Request(url, {
      method,
      body: body == null ? undefined : JSON.stringify(body),
      headers: body == null ? undefined : { 'content-type': 'application/json' },
    }),
    url: new URL(url),
    platform: { env: { DB: db } },
  } as unknown as Parameters<typeof GET>[0] & Parameters<typeof POST>[0];
}

describe('/api/cannon/takes', () => {
  test('GET returns takes newest first', async () => {
    const db = fakeCannonDb({ takes: seedTakes() });
    const res = await GET(eventFor({ db }));
    const body = (await res.json()) as { takes: Array<{ id: string }> };
    expect(body.takes.map((t) => t.id)).toEqual(['t3', 't2', 't1']);
  });

  test('GET filters by thread', async () => {
    const db = fakeCannonDb({ takes: seedTakes() });
    const res = await GET(
      eventFor({ db, url: 'https://shippie.app/api/cannon/takes?thread=ANALYSIS' }),
    );
    const body = (await res.json()) as { takes: Array<{ id: string }> };
    expect(body.takes.map((t) => t.id)).toEqual(['t2']);
  });

  test('GET marks my vote when anonKey supplied', async () => {
    const db = fakeCannonDb({
      takes: seedTakes(),
      votes: [{ take_id: 't1', anon_key: ANON, dir: 1, created_at: 1 }],
    });
    const res = await GET(
      eventFor({ db, url: `https://shippie.app/api/cannon/takes?anonKey=${ANON}` }),
    );
    const body = (await res.json()) as { takes: Array<{ id: string; myVote: string | null }> };
    expect(body.takes.find((t) => t.id === 't1')?.myVote).toBe('up');
    expect(body.takes.find((t) => t.id === 't2')?.myVote).toBeNull();
  });

  test('POST creates a take and it appears in GET', async () => {
    const db = fakeCannonDb();
    const res = await POST(eventFor({
      method: 'POST',
      db,
      body: { handle: 'HighburyHenry', anonKey: ANON, thread: 'MATCH', text: '  Saka is him.  ' },
    }));
    expect(res.status).toBe(201);
    const created = (await res.json()) as { take: { text: string; up: number } };
    expect(created.take.text).toBe('Saka is him.');
    expect(created.take.up).toBe(0);

    const list = await GET(eventFor({ db }));
    const body = (await list.json()) as { takes: Array<{ text: string }> };
    expect(body.takes[0].text).toBe('Saka is him.');
  });

  test('POST rejects empty text, over-280 text, bad thread, bad handle, bad key', async () => {
    const db = fakeCannonDb();
    const base = { handle: 'HighburyHenry', anonKey: ANON, thread: 'MATCH', text: 'fine' };
    const cases = [
      { ...base, text: '   ' },
      { ...base, text: 'x'.repeat(281) },
      { ...base, thread: 'GENERAL' },
      { ...base, handle: 'TottenhamTim' },
      { ...base, anonKey: 'no' },
    ];
    for (const body of cases) {
      const res = await POST(eventFor({ method: 'POST', db, body }));
      expect(res.status).toBe(400);
    }
    expect(db.takes).toHaveLength(0);
  });

  test('POST enforces the 30s per-key cooldown', async () => {
    const db = fakeCannonDb({
      takes: [
        {
          id: 'fresh',
          handle: 'HighburyHenry',
          anon_key: ANON,
          thread: 'MATCH',
          text: 'just now',
          up: 0,
          down: 0,
          created_at: Date.now(),
        },
      ],
    });
    const res = await POST(eventFor({
      method: 'POST',
      db,
      body: { handle: 'HighburyHenry', anonKey: ANON, thread: 'MATCH', text: 'again' },
    }));
    expect(res.status).toBe(429);
  });
});
