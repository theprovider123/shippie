import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveRequestUserId: vi.fn<() => Promise<{ userId: string } | null>>(async () => ({ userId: 'maker-1' })),
}));

interface AppRow {
  id: string;
  slug: string;
  makerId: string;
  visibilityScope: string;
  organizationId: string | null;
}

const dbState: {
  app: AppRow | null;
  updates: Array<Record<string, unknown>>;
  audits: Array<Record<string, unknown>>;
} = {
  app: null,
  updates: [],
  audits: [],
};

vi.mock('$server/auth/resolve-user', () => ({
  resolveRequestUserId: mocks.resolveRequestUserId,
}));

vi.mock('$server/db/client', () => ({
  getDrizzleClient: () => fakeDb(),
  schema: {
    apps: {
      id: '_app_id',
      slug: '_app_slug',
      makerId: '_app_maker',
      visibilityScope: '_app_visibility',
      organizationId: '_app_org',
    },
    auditLog: {},
    organizations: { id: '_org_id', slug: '_org_slug' },
    organizationMembers: { orgId: '_member_org', userId: '_member_user', role: '_member_role' },
  },
}));

const { PATCH } = await import('./+server');

function resetDbState(app: AppRow | null = null) {
  dbState.app = app ? { ...app } : null;
  dbState.updates = [];
  dbState.audits = [];
  mocks.resolveRequestUserId.mockReset();
  mocks.resolveRequestUserId.mockResolvedValue({ userId: 'maker-1' });
}

function fakeCache(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    put: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    store,
  };
}

function fakeDb() {
  return {
    select() {
      const chain = {
        from() {
          return chain;
        },
        where() {
          return chain;
        },
        limit() {
          return Promise.resolve(dbState.app ? [{ ...dbState.app }] : []);
        },
      };
      return chain;
    },
    update() {
      return {
        set(values: Record<string, unknown>) {
          return {
            where() {
              dbState.updates.push(values);
              if (dbState.app) {
                dbState.app.visibilityScope = values.visibilityScope as string;
                dbState.app.organizationId = values.organizationId as string | null;
              }
              return Promise.resolve();
            },
          };
        },
      };
    },
    insert() {
      return {
        values(values: Record<string, unknown>) {
          dbState.audits.push(values);
          return Promise.resolve();
        },
      };
    },
  };
}

function eventFor(body: Record<string, unknown>, cache: ReturnType<typeof fakeCache> | null = fakeCache()) {
  return {
    request: new Request('https://shippie.app/api/apps/foo/visibility', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    params: { slug: 'foo' },
    platform: {
      env: {
        DB: {},
        ...(cache ? { CACHE: cache } : {}),
      },
    },
  } as unknown as Parameters<typeof PATCH>[0];
}

describe('PATCH /api/apps/[slug]/visibility', () => {
  beforeEach(() => {
    resetDbState({
      id: 'app-1',
      slug: 'foo',
      makerId: 'maker-1',
      visibilityScope: 'public',
      organizationId: null,
    });
  });

  test('updates the app row and runtime metadata together', async () => {
    const cache = fakeCache({
      'apps:foo:meta': JSON.stringify({ slug: 'foo', name: 'Foo', visibility_scope: 'public' }),
    });

    const response = await PATCH(eventFor({ visibility_scope: 'private' }, cache));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      visibility_scope: 'private',
      metadata_synced: true,
    });
    expect(dbState.updates[0]).toMatchObject({ visibilityScope: 'private', organizationId: null });
    expect(cache.put).toHaveBeenCalledWith(
      'apps:foo:meta',
      JSON.stringify({ slug: 'foo', name: 'Foo', visibility_scope: 'private' }),
    );
    expect(dbState.audits[0]).toMatchObject({
      action: 'visibility_changed',
      targetId: 'app-1',
      metadata: { slug: 'foo', before: 'public', after: 'private' },
    });
  });

  test('keeps local development usable when CACHE is unavailable', async () => {
    const response = await PATCH(eventFor({ visibility_scope: 'unlisted' }, null));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      visibility_scope: 'unlisted',
      metadata_synced: false,
    });
    expect(dbState.updates[0]).toMatchObject({ visibilityScope: 'unlisted' });
  });

  test('rejects visibility changes from non-makers', async () => {
    resetDbState({
      id: 'app-1',
      slug: 'foo',
      makerId: 'maker-1',
      visibilityScope: 'public',
      organizationId: null,
    });
    mocks.resolveRequestUserId.mockResolvedValue({ userId: 'someone-else' });

    const response = await PATCH(eventFor({ visibility_scope: 'private' }));

    expect(response.status).toBe(403);
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.audits).toHaveLength(0);
  });
});
