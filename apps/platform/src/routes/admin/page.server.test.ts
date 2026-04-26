/**
 * /admin/+page.server tests.
 *
 * Two layers under test:
 *   1. The auth gate (`requireAdmin`) — redirects unauthenticated, 404s
 *      non-admins. Exercised through `load` because that's the real
 *      call path; a unit test of the gate would just re-mock the same
 *      primitives.
 *   2. The `archive` / `setVisibility` actions — write to apps then
 *      append to audit_log. We mock the drizzle client at the module
 *      boundary so the action's full path runs against an in-memory
 *      fake.
 *
 * Drizzle SQL is NOT under test here — the dual-write integration tests
 * cover that. We're pinning the helper-orchestration contract: gate
 * runs first, mutation runs second, audit row emitted with the right
 * shape, no-op cases skip the audit insert.
 */
import { describe, expect, it, vi } from 'vitest';

// Vitest's `vi.mock(specifier, factory)` is hoisted to the top of the file
// by the transformer, matching Bun's `mock.module` semantics for static
// module mocking. We alias it for symmetry with the original test shape.
const mockModule = vi.mock;

interface AppRow {
  id: string;
  slug: string;
  isArchived: boolean;
  visibilityScope: string;
}

const dbState: { rows: AppRow[]; audits: Array<Record<string, unknown>>; updates: Array<Record<string, unknown>> } = {
  rows: [],
  audits: [],
  updates: [],
};

function resetDbState(seed: AppRow[] = []) {
  dbState.rows = seed.map((r) => ({ ...r }));
  dbState.audits = [];
  dbState.updates = [];
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
        where() {
          return chain;
        },
        orderBy() {
          return chain;
        },
        limit() {
          return Promise.resolve(dbState.rows.map((r) => ({ ...r })));
        },
      };
      return chain;
    },
    selectDistinct() {
      // The load uses selectDistinct(...).from(...) and awaits the
      // result directly — no .limit() in that chain. Make `from`
      // return a thenable so `await` resolves to [].
      return {
        from() {
          return Promise.resolve([] as unknown[]);
        },
      };
    },
    update(_table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where(predicate: { _id?: string }) {
              dbState.updates.push(values);
              // We don't parse the predicate — just apply to row[0] for
              // tests since we always seed exactly one row.
              const row = dbState.rows[0];
              if (row) {
                if ('isArchived' in values) row.isArchived = values.isArchived as boolean;
                if ('visibilityScope' in values) row.visibilityScope = values.visibilityScope as string;
              }
              void predicate;
              return Promise.resolve();
            },
          };
        },
      };
    },
    insert(_table: unknown) {
      return {
        values(v: Record<string, unknown>) {
          return {
            returning() {
              const row = { id: 'audit-' + dbState.audits.length, ...v, createdAt: 'now' };
              dbState.audits.push(v);
              return Promise.resolve([row]);
            },
          };
        },
      };
    },
  };
}

mockModule('$server/db/client', () => ({
  getDrizzleClient: () => fakeDrizzle(),
  schema: {
    apps: { id: '_id', slug: '_slug', visibilityScope: '_v', isArchived: '_a' },
    auditLog: {},
    users: {},
  },
}));

// Import AFTER the mock is registered.
const { load, actions } = await import('./+page.server');

const NO_PLATFORM = Symbol('no-platform');

function makeEvent(overrides: {
  user?: { id: string; email: string; isAdmin: boolean; username?: string | null; displayName?: string | null } | null;
  pathname?: string;
  search?: string;
  formData?: FormData;
  platform?: { env: { DB?: unknown } } | typeof NO_PLATFORM;
}) {
  const url = new URL(`https://shippie.app${overrides.pathname ?? '/admin'}${overrides.search ?? ''}`);
  return {
    locals: {
      user: overrides.user === undefined
        ? { id: 'admin-1', email: 'a@b.c', username: 'a', displayName: null, avatarUrl: null, isAdmin: true }
        : overrides.user,
      session: null,
      lucia: null,
    },
    url,
    request: overrides.formData
      ? new Request('https://shippie.app/admin', { method: 'POST', body: overrides.formData })
      : new Request('https://shippie.app/admin'),
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
    route: { id: '/admin' },
  };
}

describe('admin /+page.server load — auth gate', () => {
  it('redirects unauthenticated visitors to /auth/login', async () => {
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
    expect(thrown?.location).toContain('return_to=');
  });

  it('404s signed-in non-admins', async () => {
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
    const result = (await load(event as any)) as Record<string, unknown> & {
      apps: unknown[];
      categories: unknown[];
      filters: { sort: string };
    };
    expect(result.apps).toEqual([]);
    expect(result.categories).toEqual([]);
    expect(result.filters.sort).toBe('created:desc');
  });
});

describe('admin /+page.server archive action — gate + audit', () => {
  it('redirects unauthenticated visitors', async () => {
    resetDbState();
    const event = makeEvent({ user: null, formData: new FormData() });
    let thrown: { status?: number } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await actions.archive!(event as any);
    } catch (e) {
      thrown = e as { status?: number };
    }
    expect(thrown?.status).toBe(303);
    expect(dbState.audits).toHaveLength(0);
  });

  it('404s non-admins on archive', async () => {
    resetDbState();
    const event = makeEvent({
      user: { id: 'u1', email: 'u@x.y', username: 'u', displayName: null, isAdmin: false },
      formData: new FormData(),
    });
    let thrown: { status?: number } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await actions.archive!(event as any);
    } catch (e) {
      thrown = e as { status?: number };
    }
    expect(thrown?.status).toBe(404);
    expect(dbState.audits).toHaveLength(0);
  });

  it('503s when admin but DB binding missing', async () => {
    resetDbState();
    const fd = new FormData();
    fd.append('id', 'app-1');
    const event = makeEvent({ formData: fd, platform: NO_PLATFORM });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await actions.archive!(event as any);
    expect((result as { status: number }).status).toBe(503);
  });

  it('400s on missing app id', async () => {
    resetDbState();
    const fd = new FormData();
    const event = makeEvent({ formData: fd });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await actions.archive!(event as any);
    expect((result as { status: number }).status).toBe(400);
    expect(dbState.audits).toHaveLength(0);
  });

  it('archive flips is_archived and writes an audit row', async () => {
    resetDbState([{ id: 'app-1', slug: 'foo', isArchived: false, visibilityScope: 'public' }]);
    const fd = new FormData();
    fd.append('id', 'app-1');
    const event = makeEvent({ formData: fd });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await actions.archive!(event as any);
    expect((result as { ok: boolean }).ok).toBe(true);
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].isArchived).toBe(true);
    expect(dbState.audits).toHaveLength(1);
    expect(dbState.audits[0].action).toBe('admin.app.archive');
    expect(dbState.audits[0].targetType).toBe('apps');
    expect(dbState.audits[0].targetId).toBe('app-1');
    expect(dbState.audits[0].metadata).toEqual({
      before: { isArchived: false },
      after: { isArchived: true },
    });
  });

  it('archive on already-archived app is a no-op (no update, no audit)', async () => {
    resetDbState([{ id: 'app-1', slug: 'foo', isArchived: true, visibilityScope: 'public' }]);
    const fd = new FormData();
    fd.append('id', 'app-1');
    const event = makeEvent({ formData: fd });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await actions.archive!(event as any);
    expect((result as { noop: boolean }).noop).toBe(true);
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.audits).toHaveLength(0);
  });

  it('unarchive flips is_archived back and writes audit', async () => {
    resetDbState([{ id: 'app-1', slug: 'foo', isArchived: true, visibilityScope: 'public' }]);
    const fd = new FormData();
    fd.append('id', 'app-1');
    const event = makeEvent({ formData: fd });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await actions.unarchive!(event as any);
    expect((result as { ok: boolean }).ok).toBe(true);
    expect(dbState.audits[0].action).toBe('admin.app.unarchive');
    expect(dbState.audits[0].metadata).toEqual({
      before: { isArchived: true },
      after: { isArchived: false },
    });
  });
});

describe('admin /+page.server setVisibility action', () => {
  it('400s on invalid visibility value', async () => {
    resetDbState([{ id: 'app-1', slug: 'foo', isArchived: false, visibilityScope: 'public' }]);
    const fd = new FormData();
    fd.append('id', 'app-1');
    fd.append('visibility', 'top-secret');
    const event = makeEvent({ formData: fd });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await actions.setVisibility!(event as any);
    expect((result as { status: number }).status).toBe(400);
    expect(dbState.audits).toHaveLength(0);
  });

  it('updates visibility and writes audit row', async () => {
    resetDbState([{ id: 'app-1', slug: 'foo', isArchived: false, visibilityScope: 'public' }]);
    const fd = new FormData();
    fd.append('id', 'app-1');
    fd.append('visibility', 'private');
    const event = makeEvent({ formData: fd });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await actions.setVisibility!(event as any);
    expect((result as { ok: boolean }).ok).toBe(true);
    expect(dbState.updates[0].visibilityScope).toBe('private');
    expect(dbState.audits[0].action).toBe('admin.app.set_visibility');
    expect(dbState.audits[0].metadata).toEqual({
      before: { visibilityScope: 'public' },
      after: { visibilityScope: 'private' },
    });
  });

  it('no-ops when visibility unchanged', async () => {
    resetDbState([{ id: 'app-1', slug: 'foo', isArchived: false, visibilityScope: 'public' }]);
    const fd = new FormData();
    fd.append('id', 'app-1');
    fd.append('visibility', 'public');
    const event = makeEvent({ formData: fd });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await actions.setVisibility!(event as any);
    expect((result as { noop: boolean }).noop).toBe(true);
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.audits).toHaveLength(0);
  });
});
