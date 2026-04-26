/**
 * /admin/audit/+page.server tests.
 *
 * Verifies:
 *  - Auth gate (same shape as /admin — see +page.server.test.ts).
 *  - Pagination: `?p=N` offsets correctly, `hasMore` reflects the
 *    one-extra-row probe.
 *  - Filter parsing: `action`, `actor`, `window` survive the round-
 *    trip and produce sensible cutoffs.
 *  - The before/after extractor decodes metadata.before/after, leaving
 *    nulls when the payload doesn't have them.
 *
 * The drizzle client is mocked at the module boundary; the SQL is
 * out of scope here.
 */
import { describe, expect, it, vi } from 'vitest';

// Vitest's `vi.mock` is hoisted to the top of the file by the transformer,
// matching Bun's `mock.module` semantics. Alias for shape symmetry.
const mockModule = vi.mock;

interface MetaShape {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

interface AuditFakeRow {
  id: string;
  action: string;
  actorUserId: string | null;
  actorUsername: string | null;
  actorEmail: string | null;
  targetTable: string | null;
  targetId: string | null;
  metadata: MetaShape | null;
  createdAt: string;
}

const dbState: {
  audits: AuditFakeRow[];
  lastOffset: number;
  lastLimit: number;
  lastWhere: unknown;
} = {
  audits: [],
  lastOffset: 0,
  lastLimit: 0,
  lastWhere: undefined,
};

function resetDb(rows: AuditFakeRow[]) {
  dbState.audits = rows;
  dbState.lastOffset = 0;
  dbState.lastLimit = 0;
  dbState.lastWhere = undefined;
}

function fakeDrizzle() {
  return {
    select() {
      const chain = {
        from() {
          return chain;
        },
        leftJoin() {
          return chain;
        },
        where(c: unknown) {
          dbState.lastWhere = c;
          return chain;
        },
        orderBy() {
          return chain;
        },
        limit(n: number) {
          dbState.lastLimit = n;
          return chainWithOffset;
        },
      };
      const chainWithOffset = {
        offset(n: number) {
          dbState.lastOffset = n;
          // Return rows past offset, capped to limit.
          return Promise.resolve(
            dbState.audits.slice(n, n + dbState.lastLimit).map((r) => ({ ...r })),
          );
        },
      };
      return chain;
    },
    selectDistinct() {
      // load also calls selectDistinct(...).from(...).limit(N) for
      // actions / actors lists. Both call sites await the .limit()
      // promise.
      const chain = {
        from() {
          return chain;
        },
        leftJoin() {
          return chain;
        },
        limit() {
          return Promise.resolve([]);
        },
      };
      return chain;
    },
  };
}

mockModule('$server/db/client', () => ({
  getDrizzleClient: () => fakeDrizzle(),
  schema: {
    auditLog: { id: 'id', action: 'action', actorUserId: 'auid', targetType: 'tt', targetId: 'tid', metadata: 'meta', createdAt: 'ca' },
    users: { id: 'uid', username: 'un', email: 'em' },
  },
}));

const mod = await import('./+page.server');
type LoadResult = {
  rows: Array<{ before: unknown; after: unknown }>;
  page: number;
  hasMore: boolean;
  filters: { action: string; actor: string; window: string };
};
const load = mod.load as unknown as (event: unknown) => Promise<LoadResult>;

const NO_PLATFORM = Symbol('no-platform');

function makeEvent(overrides: {
  user?: { id: string; email: string; isAdmin: boolean; username?: string | null; displayName?: string | null } | null;
  search?: string;
  platform?: { env: { DB?: unknown } } | typeof NO_PLATFORM;
}) {
  const url = new URL(`https://shippie.app/admin/audit${overrides.search ?? ''}`);
  return {
    locals: {
      user: overrides.user === undefined
        ? { id: 'admin-1', email: 'a@b.c', username: 'a', displayName: null, avatarUrl: null, isAdmin: true }
        : overrides.user,
      session: null,
      lucia: null,
    },
    url,
    request: new Request(url),
    platform:
      overrides.platform === NO_PLATFORM
        ? undefined
        : overrides.platform === undefined
          ? { env: { DB: {} } }
          : overrides.platform,
    cookies: { get: () => undefined, set: () => undefined } as unknown,
    fetch: globalThis.fetch,
    params: {},
    setHeaders: () => undefined,
    isDataRequest: false,
    isSubRequest: false,
    route: { id: '/admin/audit' },
  };
}

function fakeRow(i: number, overrides: Partial<AuditFakeRow> = {}): AuditFakeRow {
  return {
    id: `audit-${i}`,
    action: 'admin.app.archive',
    actorUserId: 'admin-1',
    actorUsername: 'admin',
    actorEmail: 'a@b.c',
    targetTable: 'apps',
    targetId: `app-${i}`,
    metadata: { before: { isArchived: false }, after: { isArchived: true } },
    createdAt: new Date(Date.now() - i * 60_000).toISOString(),
    ...overrides,
  };
}

describe('admin/audit /+page.server load — gate', () => {
  it('redirects unauthenticated to /auth/login', async () => {
    const event = makeEvent({ user: null });
    let thrown: { status?: number; location?: string } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await load(event as any);
    } catch (e) {
      thrown = e as { status?: number; location?: string };
    }
    expect(thrown?.status).toBe(303);
    expect(thrown?.location).toContain('/auth/login');
  });

  it('404s non-admins', async () => {
    const event = makeEvent({
      user: { id: 'u1', email: 'u@x.y', username: 'u', displayName: null, isAdmin: false },
    });
    let thrown: { status?: number } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await load(event as any);
    } catch (e) {
      thrown = e as { status?: number };
    }
    expect(thrown?.status).toBe(404);
  });

  it('returns empty payload when admin but no DB binding', async () => {
    const event = makeEvent({ platform: NO_PLATFORM });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await load(event as any);
    expect(result.rows).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});

describe('admin/audit /+page.server load — pagination', () => {
  it('returns first page of 200 with hasMore=false when fewer rows', async () => {
    resetDb(Array.from({ length: 50 }, (_, i) => fakeRow(i)));
    const event = makeEvent({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await load(event as any);
    expect(result.page).toBe(0);
    expect(result.rows).toHaveLength(50);
    expect(result.hasMore).toBe(false);
    expect(dbState.lastLimit).toBe(201); // PAGE_SIZE + 1 probe
    expect(dbState.lastOffset).toBe(0);
  });

  it('sets hasMore=true when probe row is present', async () => {
    resetDb(Array.from({ length: 250 }, (_, i) => fakeRow(i)));
    const event = makeEvent({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await load(event as any);
    expect(result.rows).toHaveLength(200);
    expect(result.hasMore).toBe(true);
  });

  it('respects ?p=2 by offsetting (page * PAGE_SIZE)', async () => {
    resetDb(Array.from({ length: 700 }, (_, i) => fakeRow(i)));
    const event = makeEvent({ search: '?p=2' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await load(event as any);
    expect(result.page).toBe(2);
    expect(dbState.lastOffset).toBe(400);
    expect(result.rows).toHaveLength(200);
    expect(result.hasMore).toBe(true);
  });

  it('clamps negative ?p to 0', async () => {
    resetDb(Array.from({ length: 10 }, (_, i) => fakeRow(i)));
    const event = makeEvent({ search: '?p=-5' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await load(event as any);
    expect(result.page).toBe(0);
    expect(dbState.lastOffset).toBe(0);
  });

  it('clamps non-numeric ?p to 0', async () => {
    resetDb(Array.from({ length: 10 }, (_, i) => fakeRow(i)));
    const event = makeEvent({ search: '?p=banana' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await load(event as any);
    expect(result.page).toBe(0);
  });
});

describe('admin/audit /+page.server load — filter parsing', () => {
  it('parses window=24h into a where predicate', async () => {
    resetDb([fakeRow(0)]);
    const event = makeEvent({ search: '?window=24h' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await load(event as any);
    expect(result.filters.window).toBe('24h');
    // The where predicate is opaque (Drizzle SQL builder) but we can
    // confirm one was set.
    expect(dbState.lastWhere).toBeDefined();
  });

  it('falls back to "all" for unknown window values', async () => {
    resetDb([fakeRow(0)]);
    const event = makeEvent({ search: '?window=eternity' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await load(event as any);
    expect(result.filters.window).toBe('all');
  });

  it('passes action/actor filters through to the result', async () => {
    resetDb([fakeRow(0)]);
    const event = makeEvent({ search: '?action=admin.app.archive&actor=admin-1' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await load(event as any);
    expect(result.filters.action).toBe('admin.app.archive');
    expect(result.filters.actor).toBe('admin-1');
    expect(dbState.lastWhere).toBeDefined();
  });
});

describe('admin/audit /+page.server load — metadata extraction', () => {
  it('decodes before/after into top-level fields', async () => {
    resetDb([
      fakeRow(0, {
        metadata: {
          before: { name: 'Old' },
          after: { name: 'New' },
        },
      }),
    ]);
    const event = makeEvent({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await load(event as any);
    expect(result.rows[0].before).toEqual({ name: 'Old' });
    expect(result.rows[0].after).toEqual({ name: 'New' });
  });

  it('handles null metadata gracefully', async () => {
    resetDb([fakeRow(0, { metadata: null })]);
    const event = makeEvent({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await load(event as any);
    expect(result.rows[0].before).toBeNull();
    expect(result.rows[0].after).toBeNull();
  });

  it('handles partial metadata (before only) for delete-style audits', async () => {
    resetDb([fakeRow(0, { metadata: { before: { name: 'Goodbye' } } })]);
    const event = makeEvent({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await load(event as any);
    expect(result.rows[0].before).toEqual({ name: 'Goodbye' });
    expect(result.rows[0].after).toBeNull();
  });
});
