import { describe, expect, test } from 'vitest';
import { GET, POST } from './+server';
import { fakeCannonDb } from '$lib/server/cannon/fake-d1';

const KEY = (n: number) => `aaaaaaaa-bbbb-cccc-dddd-${String(n).padStart(12, '0')}`;
const MATCH = 'cs-mci-2026-08-16';

function eventFor({
  method = 'GET',
  url = `https://shippie.app/api/cannon/predictions?match=${MATCH}`,
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

describe('/api/cannon/predictions', () => {
  test('empty match has no confidence (never a fabricated number)', async () => {
    const res = await GET(eventFor());
    const body = (await res.json()) as { total: number; confidence: number | null };
    expect(body.total).toBe(0);
    expect(body.confidence).toBeNull();
  });

  test('picks aggregate into confidence = % predicting a win', async () => {
    const db = fakeCannonDb();
    await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: KEY(1), pick: 'W' } }));
    await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: KEY(2), pick: 'W' } }));
    await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: KEY(3), pick: 'D' } }));
    const res = await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: KEY(4), pick: 'L' } }));
    const body = (await res.json()) as { counts: Record<string, number>; total: number; confidence: number; mine: string };
    expect(body.counts).toEqual({ W: 2, D: 1, L: 1 });
    expect(body.total).toBe(4);
    expect(body.confidence).toBe(50);
    expect(body.mine).toBe('L');
  });

  test('a re-pick replaces, a null pick clears', async () => {
    const db = fakeCannonDb();
    await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: KEY(1), pick: 'D' } }));
    const repick = await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: KEY(1), pick: 'W' } }));
    expect(((await repick.json()) as { counts: Record<string, number> }).counts).toEqual({ W: 1, D: 0, L: 0 });

    const cleared = await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: KEY(1), pick: null } }));
    const body = (await cleared.json()) as { total: number; mine: string | null };
    expect(body.total).toBe(0);
    expect(body.mine).toBeNull();
  });

  test('rejects bad pick / match / key', async () => {
    const db = fakeCannonDb();
    expect((await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: KEY(1), pick: 'X' } }))).status).toBe(400);
    expect((await POST(eventFor({ method: 'POST', db, body: { matchId: 'NOT OK', anonKey: KEY(1), pick: 'W' } }))).status).toBe(400);
    expect((await POST(eventFor({ method: 'POST', db, body: { matchId: MATCH, anonKey: 'no', pick: 'W' } }))).status).toBe(400);
  });
});
