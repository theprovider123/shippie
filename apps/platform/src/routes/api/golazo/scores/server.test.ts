import { describe, expect, test } from 'vitest';
import { DELETE, GET, PATCH, POST } from './+server';

function kvStore(seed: Record<string, unknown> = {}) {
  const rows = new Map<string, string>(
    Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]),
  );
  return {
    rows,
    async get(key: string) {
      return rows.get(key) ?? null;
    },
    async put(key: string, value: string) {
      rows.set(key, value);
    },
  };
}

function eventFor({
  method = 'GET',
  url = 'https://shippie.app/api/golazo/scores?game=lastman',
  body,
  kv = kvStore(),
}: {
  method?: string;
  url?: string;
  body?: unknown;
  kv?: ReturnType<typeof kvStore>;
} = {}) {
  return {
    request: new Request(url, {
      method,
      body: body == null ? undefined : JSON.stringify(body),
      headers: body == null ? undefined : { 'content-type': 'application/json' },
    }),
    url: new URL(url),
    platform: { env: { CACHE: kv } },
  } as unknown as Parameters<typeof GET>[0] &
    Parameters<typeof POST>[0] &
    Parameters<typeof DELETE>[0] &
    Parameters<typeof PATCH>[0];
}

describe('/api/golazo/scores', () => {
  test('accepts Last Man rows and upserts by stable player key', async () => {
    const kv = kvStore();
    const first = await POST(eventFor({
      method: 'POST',
      kv,
      body: {
        game: 'lastman',
        name: 'Sam',
        playerKey: 'sam:u1',
        score: 1,
        picks: [{ day: '2026-06-11', fixtureId: 'A1-MEX-CRO', teamId: 'MEX', at: 100 }],
      },
    }));
    expect(first.status).toBe(200);

    const second = await POST(eventFor({
      method: 'POST',
      kv,
      body: {
        game: 'lastman',
        name: 'Sam',
        playerKey: 'sam:u1',
        score: 2,
        picks: [
          { day: '2026-06-11', fixtureId: 'A1-MEX-CRO', teamId: 'MEX', at: 100 },
          { day: '2026-06-12', fixtureId: 'B1-CAN-ITA', teamId: 'CAN', at: 200 },
        ],
      },
    }));
    const body = (await second.json()) as { scores: Array<{ playerKey?: string; score: number; picks?: unknown[] }> };

    expect(body.scores).toHaveLength(1);
    expect(body.scores[0]).toMatchObject({ playerKey: 'sam:u1', score: 2 });
    expect(body.scores[0]?.picks).toHaveLength(2);
  });

  test('removes a player when global leaderboard opt-in is turned off', async () => {
    const kv = kvStore({
      'golazo:lb:keepy': [
        { name: 'Sam', playerKey: 'sam:u1', score: 10, at: 1 },
        { name: 'Mo', playerKey: 'mo:u2', score: 8, at: 2 },
      ],
      'golazo:lb:lastman': [
        { name: 'Sam', playerKey: 'sam:u1', score: 1, at: 1 },
      ],
    });

    const response = await DELETE(eventFor({
      method: 'DELETE',
      kv,
      body: { playerKey: 'sam:u1' },
    }));
    expect(response.status).toBe(200);

    const keepy = await GET(eventFor({
      kv,
      url: 'https://shippie.app/api/golazo/scores?game=keepy',
    }));
    await expect(keepy.json()).resolves.toMatchObject({
      scores: [expect.objectContaining({ playerKey: 'mo:u2' })],
    });

    const lastman = await GET(eventFor({ kv }));
    await expect(lastman.json()).resolves.toMatchObject({ scores: [] });
  });

  test('recomputes Last Man positions after official score sync', async () => {
    const kv = kvStore({
      'golazo:lb:lastman': [
        {
          name: 'Sam',
          playerKey: 'sam:u1',
          score: 1,
          at: 1,
          picks: [{ day: '2026-06-11', fixtureId: 'A1-MEX-CRO', teamId: 'MEX', at: 100 }],
        },
        {
          name: 'Mo',
          playerKey: 'mo:u2',
          score: 1,
          at: 2,
          picks: [{ day: '2026-06-11', fixtureId: 'A1-MEX-CRO', teamId: 'CRO', at: 100 }],
        },
      ],
    });

    const response = await PATCH(eventFor({
      method: 'PATCH',
      kv,
      body: {
        game: 'lastman',
        live: [
          { matchId: 'A1-MEX-CRO', home: 'MEX', away: 'CRO', homeGoals: 2, awayGoals: 1, status: 'ft' },
        ],
      },
    }));
    const body = (await response.json()) as { scores: Array<{ playerKey?: string; score: number }> };

    expect(body.scores).toEqual([
      expect.objectContaining({ playerKey: 'sam:u1', score: 1 }),
    ]);
  });
});
