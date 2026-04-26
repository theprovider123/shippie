/**
 * Tests for the proof ingestion endpoint.
 *
 * The "happy path" needs a real D1 binding to exercise the insert path;
 * we test the validation surface here with a fake DB stub. That covers:
 *   - 400 when the body shape is wrong
 *   - 400 when eventType is outside the taxonomy
 *   - 400 when appSlug / deviceHash fail validation
 *   - 503 when DB binding is missing
 *   - 404 when appSlug doesn't resolve
 */
import { describe, expect, test, vi } from 'vitest';
import { POST } from './+server';

interface FakeDb {
  rows: { id: string }[];
  inserts: unknown[][];
}

function makePlatform(input: { appExists: boolean; missingDb?: boolean }) {
  const db: FakeDb = {
    rows: input.appExists ? [{ id: 'app-uuid-1' }] : [],
    inserts: [],
  };
  if (input.missingDb) {
    return { env: {} };
  }
  // We don't drive Drizzle directly in these tests — the Drizzle client
  // factory is module-mocked below to return our fake.
  return { env: { DB: { __fake: true, db } as unknown } };
}

vi.mock('$server/db/client', () => {
  const passthroughChain = (handler: (kind: string) => unknown) => {
    const builder = {
      from() {
        return builder;
      },
      where() {
        return builder;
      },
      limit() {
        return Promise.resolve(handler('select'));
      },
      values(rows: unknown[]) {
        handler('insert');
        // Capture inserted rows on the underlying fake db.
        for (const row of rows) {
          fakeContext.lastInsert.push(row);
        }
        return Promise.resolve();
      },
    };
    return builder;
  };
  const fakeContext = { lastInsert: [] as unknown[], existingRows: [] as { id: string }[] };
  return {
    schema: {
      apps: { id: 'apps.id', slug: 'apps.slug' },
      proofEvents: 'proofEvents-table',
    },
    getDrizzleClient: () => ({
      select: () => passthroughChain((kind) => (kind === 'select' ? fakeContext.existingRows : null)),
      insert: () => passthroughChain(() => null),
    }),
    __fake: fakeContext,
  };
});

vi.mock('drizzle-orm', () => ({
  eq: () => ({}),
}));

interface FakeContextShape {
  lastInsert: unknown[];
  existingRows: { id: string }[];
}

async function getFakeContext(): Promise<FakeContextShape> {
  const mod = (await import('$server/db/client')) as unknown as { __fake: FakeContextShape };
  return mod.__fake;
}

function eventFor(input: {
  body: unknown;
  platformEnv?: { DB?: unknown; CACHE?: unknown };
}) {
  return {
    request: new Request('https://shippie.app/api/v1/proof', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.body),
    }),
    platform: { env: input.platformEnv ?? { DB: { __fake: true } } },
  } as unknown as Parameters<typeof POST>[0];
}

async function expectStatus(promise: unknown, status: number) {
  let caught: unknown;
  let res: unknown;
  try {
    res = await Promise.resolve(promise);
  } catch (err) {
    caught = err;
  }
  if (caught) {
    expect((caught as { status?: number })?.status).toBe(status);
  } else {
    expect((res as Response).status).toBe(status);
  }
}

describe('proof ingestion — validation', () => {
  test('400 on non-JSON body', async () => {
    const ev = {
      request: new Request('https://shippie.app/api/v1/proof', {
        method: 'POST',
        body: 'not json',
      }),
      platform: { env: { DB: {} } },
    } as unknown as Parameters<typeof POST>[0];
    await expectStatus(POST(ev), 400);
  });

  test('400 on missing appSlug', async () => {
    await expectStatus(
      POST(eventFor({ body: { deviceHash: 'a'.repeat(32), events: [{ eventType: 'installed' }] } })),
      400,
    );
  });

  test('400 on appSlug with invalid characters', async () => {
    await expectStatus(
      POST(
        eventFor({
          body: {
            appSlug: 'BadSlug!',
            deviceHash: 'a'.repeat(32),
            events: [{ eventType: 'installed' }],
          },
        }),
      ),
      400,
    );
  });

  test('400 on deviceHash too short', async () => {
    await expectStatus(
      POST(
        eventFor({
          body: { appSlug: 'recipe', deviceHash: 'short', events: [{ eventType: 'installed' }] },
        }),
      ),
      400,
    );
  });

  test('400 on empty events array', async () => {
    await expectStatus(
      POST(eventFor({ body: { appSlug: 'recipe', deviceHash: 'a'.repeat(32), events: [] } })),
      400,
    );
  });

  test('400 on eventType outside taxonomy', async () => {
    await expectStatus(
      POST(
        eventFor({
          body: {
            appSlug: 'recipe',
            deviceHash: 'a'.repeat(32),
            events: [{ eventType: 'forged-badge-event' }],
          },
        }),
      ),
      400,
    );
  });

  test('400 on too many events in one request', async () => {
    const events = Array.from({ length: 17 }, () => ({ eventType: 'installed' as const }));
    await expectStatus(
      POST(eventFor({ body: { appSlug: 'recipe', deviceHash: 'a'.repeat(32), events } })),
      400,
    );
  });

  test('503 when DB binding is missing', async () => {
    await expectStatus(
      POST(
        eventFor({
          body: {
            appSlug: 'recipe',
            deviceHash: 'a'.repeat(32),
            events: [{ eventType: 'installed' }],
          },
          platformEnv: {},
        }),
      ),
      503,
    );
  });

  test('404 when appSlug does not resolve', async () => {
    const ctx = await getFakeContext();
    ctx.existingRows = [];
    ctx.lastInsert = [];
    await expectStatus(
      POST(
        eventFor({
          body: {
            appSlug: 'recipe',
            deviceHash: 'a'.repeat(32),
            events: [{ eventType: 'installed' }],
          },
        }),
      ),
      404,
    );
  });

  test('202 with accepted count when valid', async () => {
    const ctx = await getFakeContext();
    ctx.existingRows = [{ id: 'app-uuid-1' }];
    ctx.lastInsert = [];
    const res = (await POST(
      eventFor({
        body: {
          appSlug: 'recipe',
          deviceHash: 'a'.repeat(32),
          events: [{ eventType: 'installed' }, { eventType: 'local_db_used' }],
        },
      }),
    )) as Response;
    expect(res.status).toBe(202);
    const body = (await res.json()) as { accepted: number };
    expect(body.accepted).toBe(2);
    expect(ctx.lastInsert.length).toBe(2);
  });
});
