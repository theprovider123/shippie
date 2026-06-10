import { describe, expect, test } from 'vitest';
import { GET, POST } from './+server';
import { fakeCannonDb } from '$lib/server/cannon/fake-d1';

const ANON = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const MATCH = 'arsenal-newcastle-2026-05';

function eventFor({
  method = 'GET',
  url = `https://shippie.app/api/cannon/gauge?match=${MATCH}`,
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

describe('/api/cannon/gauge', () => {
  test('POST rating then GET returns the aggregate', async () => {
    const db = fakeCannonDb();
    await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: ANON, rating: 8 } }));
    await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: 'other-key-123', rating: 7 } }));

    const res = await GET(eventFor({ db }));
    await expect(res.json()).resolves.toMatchObject({ avg: 7.5, count: 2 });
  });

  test('re-rating from the same key updates instead of inserting', async () => {
    const db = fakeCannonDb();
    await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: ANON, rating: 4 } }));
    const res = await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: ANON, rating: 9 } }));
    await expect(res.json()).resolves.toMatchObject({ avg: 9, count: 1 });
    expect(db.gauge).toHaveLength(1);
  });

  test('partial update never clobbers other fields', async () => {
    const db = fakeCannonDb();
    await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: ANON, mood: 'buzzing' } }));
    await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: ANON, rating: 8 } }));
    const res = await GET(eventFor({ db, url: `https://shippie.app/api/cannon/gauge?match=${MATCH}&anonKey=${ANON}` }));
    await expect(res.json()).resolves.toMatchObject({
      mine: { rating: 8, mood: 'buzzing' },
    });
  });

  test('explicit null clears a rating', async () => {
    const db = fakeCannonDb();
    await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: ANON, rating: 8 } }));
    const res = await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: ANON, rating: null } }));
    await expect(res.json()).resolves.toMatchObject({ avg: null, count: 0 });
  });

  test('mood split reported as percentages', async () => {
    const db = fakeCannonDb({
      gauge: [
        { match_id: MATCH, anon_key: 'k1', rating: null, mood: 'buzzing', moment: null, updated_at: 1 },
        { match_id: MATCH, anon_key: 'k2', rating: null, mood: 'buzzing', moment: null, updated_at: 1 },
        { match_id: MATCH, anon_key: 'k3', rating: null, mood: 'buzzing', moment: null, updated_at: 1 },
        { match_id: MATCH, anon_key: 'k4', rating: null, mood: 'anxious', moment: null, updated_at: 1 },
      ],
    });
    const res = await GET(eventFor({ db }));
    await expect(res.json()).resolves.toMatchObject({
      moods: { buzzing: 75, anxious: 25, relieved: 0, frustrated: 0 },
    });
  });

  test('rejects out-of-bounds rating, unknown mood, bad match id', async () => {
    const db = fakeCannonDb();
    const cases = [
      { matchId: MATCH, anonKey: ANON, rating: 11 },
      { matchId: MATCH, anonKey: ANON, rating: 0 },
      { matchId: MATCH, anonKey: ANON, rating: 7.5 },
      { matchId: MATCH, anonKey: ANON, mood: 'furious' },
      { matchId: 'Bad Match!', anonKey: ANON, rating: 5 },
    ];
    for (const body of cases) {
      const res = await POST(eventFor({ method: 'POST', db, body }));
      expect(res.status).toBe(400);
    }
    expect(db.gauge).toHaveLength(0);
  });
});
