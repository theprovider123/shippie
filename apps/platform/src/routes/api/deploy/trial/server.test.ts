import { describe, expect, test, vi } from 'vitest';
import { POST } from './+server';

const mocks = vi.hoisted(() => ({
  deployStatic: vi.fn(),
  ensureTrialMakerSeeded: vi.fn(async () => {}),
  loadReservedSlugs: vi.fn(async () => new Set<string>()),
  dbState: {
    updates: [] as Record<string, unknown>[],
    recentCount: 0,
  },
}));

vi.mock('$server/deploy/pipeline', () => ({
  deployStatic: mocks.deployStatic,
}));

vi.mock('$server/deploy/reserved-slugs', () => ({
  loadReservedSlugs: mocks.loadReservedSlugs,
}));

vi.mock('$server/deploy/trial-maker', () => ({
  TRIAL_MAKER_ID: '00000000-0000-4000-8000-trialmakerid01',
  ensureTrialMakerSeeded: mocks.ensureTrialMakerSeeded,
}));

vi.mock('$server/db/client', () => ({
  schema: {
    apps: {
      trialIpHash: 'apps.trialIpHash',
      createdAt: 'apps.createdAt',
      id: 'apps.id',
    },
  },
  getDrizzleClient: () => ({
    select() {
      return {
        from() {
          return this;
        },
        where() {
          return Promise.resolve([{ c: mocks.dbState.recentCount }]);
        },
      };
    },
    update() {
      return {
        set(values: Record<string, unknown>) {
          mocks.dbState.updates.push(values);
          return {
            where() {
              return Promise.resolve();
            },
          };
        },
      };
    },
  }),
}));

vi.mock('drizzle-orm', () => ({
  and: () => ({}),
  count: () => ({}),
  eq: () => ({}),
  gte: () => ({}),
}));

function eventFor(file = new File(['hello'], 'app.zip', { type: 'application/zip' })) {
  const form = new FormData();
  form.set('zip', file);
  return {
    request: new Request('https://shippie.app/api/deploy/trial', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.10' },
      body: form,
    }),
    platform: {
      env: {
        DB: {},
        APPS: {},
        CACHE: {},
        PUBLIC_ORIGIN: 'https://shippie.app',
        AUTH_SECRET: 'test-secret',
      },
    },
  } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/deploy/trial', () => {
  test('deploys anonymously and returns a claim URL that preserves return_to', async () => {
    mocks.dbState.updates = [];
    mocks.dbState.recentCount = 0;
    mocks.deployStatic.mockResolvedValueOnce({
      success: true,
      appId: 'app-1',
      deployId: 'deploy-1',
      liveUrl: 'https://trial-abcd1234.shippie.app',
      files: 2,
      totalBytes: 128,
      version: 1,
      preflight: { warnings: [], durationMs: 10 },
    });

    const response = await POST(eventFor());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { slug: string; claim_url: string };

    expect(body.slug).toMatch(/^trial-[a-f0-9]{8}$/);
    expect(body.claim_url).toContain('/auth/login?return_to=');
    const claimLogin = new URL(body.claim_url, 'https://shippie.app');
    const returnTo = claimLogin.searchParams.get('return_to');
    expect(returnTo).toContain(`/dashboard?claim_trial=${body.slug}`);
    expect(returnTo).toContain('claim_receipt=');
    expect(mocks.deployStatic).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: body.slug,
        makerId: '00000000-0000-4000-8000-trialmakerid01',
      }),
    );
    expect(mocks.dbState.updates[0]).toMatchObject({
      isTrial: true,
      visibilityScope: 'unlisted',
    });
  });
});
