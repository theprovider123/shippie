/**
 * Tests for POST /api/apps/[slug]/rate.
 *
 * Shared PGlite + TRUNCATE per-test (see ratings.test.ts for the same
 * pattern). `auth()` is stubbed via `mock.module` so we can drive the
 * authed and unauthed branches without standing up a real session.
 */
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
// `mock` isn't in this app's local bun:test shim; import dynamically
// with a minimal local type so the test typechecks without touching the
// shared shim.
import * as bunTest from 'bun:test';
const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;
import type { NextRequest } from 'next/server';
import { createDb, runMigrations, type ShippieDbHandle } from '@shippie/db';
import { sql } from 'drizzle-orm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'db',
  'migrations',
);

let dbHandle: ShippieDbHandle;

// Per-test controllable auth result. Default: signed-in test user.
let authUser: { id: string } | null = { id: 'u1' };

mock.module('@/lib/auth', () => ({
  auth: async () => (authUser ? { user: authUser } : null),
}));

beforeAll(async () => {
  process.env.DATABASE_URL = 'pglite://memory';
  dbHandle = await createDb({ url: 'pglite://memory' });
  await runMigrations(dbHandle, MIGRATIONS_DIR);
  (globalThis as unknown as { __shippieDbHandle?: Promise<unknown> }).__shippieDbHandle =
    Promise.resolve(dbHandle);
}, 30_000);

beforeEach(async () => {
  authUser = { id: 'u1' };
  await dbHandle.db.execute(sql`TRUNCATE TABLE app_ratings`);
  (globalThis as unknown as { __shippieDbHandle?: Promise<unknown> }).__shippieDbHandle =
    Promise.resolve(dbHandle);
});

function mockRequest(body: unknown): NextRequest {
  return {
    url: 'https://shippie.app/api/apps/zen/rate',
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as unknown as NextRequest;
}

type RouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) => Promise<Response>;

async function postRate(body: unknown, slug = 'zen'): Promise<Response> {
  const { POST } = await import('./route.ts');
  return (POST as unknown as RouteHandler)(mockRequest(body), {
    params: Promise.resolve({ slug }),
  });
}

describe('POST /api/apps/[slug]/rate', () => {
  test('happy path: inserts the rating and returns ok', async () => {
    const res = await postRate({ rating: 5, review: 'love it' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);

    // Verify persistence.
    const { queryUserRating } = await import('@/lib/shippie/ratings');
    const r = await queryUserRating(dbHandle.db, 'zen', 'u1');
    expect(r?.rating).toBe(5);
    expect(r?.review).toBe('love it');
  });

  test('rejects unauthenticated request with 401', async () => {
    authUser = null;
    const res = await postRate({ rating: 5 });
    expect(res.status).toBe(401);
  });

  test('rejects invalid rating value with 400', async () => {
    const res = await postRate({ rating: 7 });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_rating');
  });

  test('rejects non-integer rating with 400', async () => {
    const res = await postRate({ rating: 3.5 });
    expect(res.status).toBe(400);
  });

  test('treats empty/whitespace review as null', async () => {
    const res = await postRate({ rating: 4, review: '   ' });
    expect(res.status).toBe(200);
    const { queryUserRating } = await import('@/lib/shippie/ratings');
    const r = await queryUserRating(dbHandle.db, 'zen', 'u1');
    expect(r?.review).toBeNull();
  });

  test('returns 400 on invalid JSON body', async () => {
    const req = {
      url: 'https://shippie.app/api/apps/zen/rate',
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => {
        throw new Error('bad json');
      },
    } as unknown as NextRequest;
    const { POST } = await import('./route.ts');
    const res = await (POST as unknown as RouteHandler)(req, {
      params: Promise.resolve({ slug: 'zen' }),
    });
    expect(res.status).toBe(400);
  });
});
