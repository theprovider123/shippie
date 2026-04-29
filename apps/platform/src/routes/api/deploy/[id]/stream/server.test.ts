import { describe, expect, test } from 'vitest';
import { GET } from './+server';
import { deployEventsKey } from '$server/deploy/deploy-events';

function makeDb(row: { id: string; slug: string; version: number } | null) {
  return {
    prepare() {
      return {
        bind() {
          return {
            first: async () => row,
          };
        },
      };
    },
  };
}

function makeR2(body: string | null) {
  let requestedKey = '';
  return {
    bucket: {
      get: async (key: string) => {
        requestedKey = key;
        return body === null
          ? null
          : {
              text: async () => body,
            };
      },
    },
    requestedKey: () => requestedKey,
  };
}

async function bodyText(response: Response): Promise<string> {
  return await response.text();
}

describe('GET /api/deploy/[id]/stream', () => {
  test('replays deploy events from the shared NDJSON artifact key', async () => {
    const row = { id: 'deploy-1', slug: 'recipe', version: 7 };
    const event = {
      type: 'route_mode_detected',
      ts: '2026-04-29T00:00:00.000Z',
      elapsedMs: 12,
      mode: 'spa',
      confidence: 0.9,
      reasons: ['single root index.html'],
    };
    const r2 = makeR2(JSON.stringify(event) + '\n');
    const response = await GET({
      params: { id: row.id },
      platform: { env: { DB: makeDb(row), APPS: r2.bucket } },
      url: new URL('https://shippie.app/api/deploy/deploy-1/stream?replayDelayMs=0'),
    } as never);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(r2.requestedKey()).toBe(deployEventsKey(row.slug, row.version));
    const text = await bodyText(response);
    expect(text).toContain('event: ready');
    expect(text).toContain('event: route_mode_detected');
    expect(text).toContain('"mode":"spa"');
    expect(text).toContain('event: end');
  });

  test('returns a pending frame when the deploy has no events artifact yet', async () => {
    const row = { id: 'deploy-2', slug: 'blank', version: 1 };
    const r2 = makeR2(null);
    const response = await GET({
      params: { id: row.id },
      platform: { env: { DB: makeDb(row), APPS: r2.bucket } },
      url: new URL('https://shippie.app/api/deploy/deploy-2/stream?replayDelayMs=0'),
    } as never);

    const text = await bodyText(response);
    expect(text).toContain('event: pending');
    expect(text).toContain('no events yet');
  });
});
