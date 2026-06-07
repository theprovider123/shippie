import type { KVNamespace } from '@cloudflare/workers-types';
import { describe, expect, test } from 'vitest';
import { DELETE, GET, PATCH, POST } from './+server';

function fakeKv(seed: Record<string, string> = {}): KVNamespace {
  const data = new Map(Object.entries(seed));
  return {
    get: async (key: string) => data.get(key) ?? null,
    put: async (key: string, value: string) => {
      data.set(key, value);
    },
  } as unknown as KVNamespace;
}

function eventFor<T extends typeof GET | typeof POST | typeof PATCH | typeof DELETE>(
  _handler: T,
  input: {
    url?: string;
    method?: string;
    body?: unknown;
    kv: KVNamespace;
  },
): Parameters<T>[0] {
  const url = new URL(input.url ?? 'https://shippie.app/api/golazo/scores?game=keepy');
  return {
    url,
    request: new Request(url, {
      method: input.method ?? 'GET',
      headers: input.body ? { 'content-type': 'application/json' } : undefined,
      body: input.body ? JSON.stringify(input.body) : undefined,
    }),
    platform: { env: { CACHE: input.kv } },
  } as unknown as Parameters<T>[0];
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe('/api/golazo/scores', () => {
  test('upserts by player key and keeps the best score', async () => {
    const kv = fakeKv();
    await POST(eventFor(POST, {
      kv,
      method: 'POST',
      body: { game: 'keepy', name: 'Sam', playerKey: 'sam:u1', score: 10 },
    }));
    await POST(eventFor(POST, {
      kv,
      method: 'POST',
      body: { game: 'keepy', name: 'Sam', playerKey: 'sam:u1', score: 8 },
    }));
    await POST(eventFor(POST, {
      kv,
      method: 'POST',
      body: { game: 'keepy', name: 'Mo', playerKey: 'mo:u2', score: 12 },
    }));

    const res = await GET(eventFor(GET, { kv }));
    const body = await json<{ scores: Array<{ name: string; playerKey: string; score: number }> }>(res);
    expect(body.scores.map((entry) => [entry.playerKey, entry.score])).toEqual([
      ['mo:u2', 12],
      ['sam:u1', 10],
    ]);
  });

  test('dedupes legacy rows by derived player key on read', async () => {
    const kv = fakeKv({
      'golazo:lb:keepy': JSON.stringify([
        { name: 'Test', score: 13, at: 3000 },
        { name: 'Test', score: 15, at: 2000 },
        { name: 'Player', score: 3, at: 1000 },
        { name: 'Player', score: 49, at: 4000 },
      ]),
    });

    const res = await GET(eventFor(GET, { kv }));
    const body = await json<{ scores: Array<{ name: string; playerKey: string; score: number }> }>(res);

    expect(body.scores.map((entry) => [entry.playerKey, entry.score])).toEqual([
      ['legacy:player', 49],
      ['legacy:test', 15],
    ]);
  });

  test('deletes one opted-out player from a game or every board', async () => {
    const kv = fakeKv();
    await POST(eventFor(POST, {
      kv,
      method: 'POST',
      body: { game: 'keepy', name: 'Sam', playerKey: 'sam:u1', score: 10 },
    }));
    await POST(eventFor(POST, {
      kv,
      method: 'POST',
      body: { game: 'topbins', name: 'Sam', playerKey: 'sam:u1', score: 4 },
    }));

    await DELETE(eventFor(DELETE, {
      kv,
      method: 'DELETE',
      body: { game: 'keepy', playerKey: 'sam:u1' },
    }));
    const keepy = await json<{ scores: Array<{ playerKey: string }> }>(
      await GET(eventFor(GET, { kv })),
    );
    expect(keepy.scores).toHaveLength(0);

    await DELETE(eventFor(DELETE, {
      kv,
      method: 'DELETE',
      body: { playerKey: 'sam:u1' },
    }));
    const topbins = await json<{ scores: Array<{ playerKey: string }> }>(
      await GET(eventFor(GET, {
        kv,
        url: 'https://shippie.app/api/golazo/scores?game=topbins',
      })),
    );
    expect(topbins.scores).toHaveLength(0);
  });

  test('accepts Last Man Standing survivor rows', async () => {
    const kv = fakeKv();
    await POST(eventFor(POST, {
      kv,
      method: 'POST',
      body: { game: 'lastman', name: 'Sam', playerKey: 'sam:u1', score: 3 },
    }));

    const res = await GET(eventFor(GET, {
      kv,
      url: 'https://shippie.app/api/golazo/scores?game=lastman',
    }));
    const body = await json<{ scores: Array<{ playerKey: string; score: number }> }>(res);
    expect(body.scores).toEqual([
      expect.objectContaining({ playerKey: 'sam:u1', score: 3 }),
    ]);
  });

  test('recomputes Last Man positions when admin scores sync', async () => {
    const kv = fakeKv();
    const mexPick = {
      day: '2026-06-11',
      fixtureId: 'A1-MEX-CRO',
      teamId: 'MEX',
      at: 1000,
    };
    const croPick = { ...mexPick, teamId: 'CRO', at: 2000 };

    await POST(eventFor(POST, {
      kv,
      method: 'POST',
      body: { game: 'lastman', name: 'Sam', playerKey: 'sam:u1', score: 1, picks: [mexPick] },
    }));
    await POST(eventFor(POST, {
      kv,
      method: 'POST',
      body: { game: 'lastman', name: 'Mo', playerKey: 'mo:u2', score: 1, picks: [croPick] },
    }));

    const res = await PATCH(eventFor(PATCH, {
      kv,
      method: 'PATCH',
      body: {
        game: 'lastman',
        now: Date.parse('2026-06-11T23:30:00Z'),
        live: [
          {
            matchId: 'A1-MEX-CRO',
            homeGoals: 2,
            awayGoals: 1,
            status: 'ft',
          },
        ],
      },
    }));
    const body = await json<{
      scores: Array<{ playerKey: string; score: number }>;
      updated: number;
      removed: number;
    }>(res);

    expect(body.updated).toBe(1);
    expect(body.removed).toBe(1);
    expect(body.scores).toEqual([
      expect.objectContaining({ playerKey: 'sam:u1', score: 1 }),
    ]);
  });

  test('removes stored Last Man picks on opt-out so score sync cannot restore them', async () => {
    const kv = fakeKv();
    const pick = {
      day: '2026-06-11',
      fixtureId: 'A1-MEX-CRO',
      teamId: 'MEX',
      at: 1000,
    };

    await POST(eventFor(POST, {
      kv,
      method: 'POST',
      body: { game: 'lastman', name: 'Sam', playerKey: 'sam:u1', score: 1, picks: [pick] },
    }));
    await DELETE(eventFor(DELETE, {
      kv,
      method: 'DELETE',
      body: { game: 'lastman', playerKey: 'sam:u1' },
    }));

    const res = await POST(eventFor(POST, {
      kv,
      method: 'POST',
      body: {
        game: 'lastman',
        live: [
          {
            matchId: 'A1-MEX-CRO',
            homeGoals: 2,
            awayGoals: 1,
            status: 'ft',
          },
        ],
      },
    }));
    const body = await json<{ scores: Array<{ playerKey: string }> }>(res);

    expect(body.scores).toHaveLength(0);
  });
});
