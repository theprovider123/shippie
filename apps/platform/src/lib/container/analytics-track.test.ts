import { describe, expect, test, vi } from 'vitest';
import { createAppHandlers, type AppHandlerContext } from './bridge-handlers';
import { localPermissions, type ContainerApp } from './state';

function makeApp(slug: string): ContainerApp {
  return {
    id: `app_${slug}`,
    slug,
    name: slug,
    shortName: slug,
    description: '',
    appKind: 'local',
    entry: 'app/index.html',
    labelKind: 'Local',
    icon: 'X',
    accent: '#000',
    version: '1',
    packageHash: `sha256:${'0'.repeat(64)}`,
    standaloneUrl: `/run/${slug}`,
    permissions: localPermissions(slug),
  };
}

function buildHandlers(trackAnalytics?: AppHandlerContext['trackAnalytics']) {
  const app = makeApp('recipe-saver');
  const ctx: AppHandlerContext = {
    appId: app.id,
    app,
    insertRow: () => ({ id: 'x', table: 't', payload: null, createdAt: '' }),
    queryRows: () => ({ rows: [] }),
    storageUsage: () => ({ rows: 0, bytes: 0 }),
    consumeIntent: async () => ({ provider: null, rows: [] }),
    consumersFor: () => [],
    dataOpenPanel: () => ({ opened: true as const }),
    fireTexture: () => ({ fired: true, name: 'confirm' }),
    runAi: async () => ({ task: 'classify', output: null, source: 'unavailable' }),
    broadcastIntent: () => ({ delivered: 0 }),
    listOverlappingApps: () => [],
    insightsForApp: () => [],
    startTransferDrop: () => ({ kind: '', acceptors: [] }),
    commitTransferDrop: () => ({ delivered: false, target: null, reason: 'no_target' as const }),
    trackAnalytics,
  };
  return createAppHandlers(ctx);
}

const dummyContext = {
  capability: 'analytics.track' as const,
  method: 'track',
  request: {
    protocol: 'shippie.bridge.v1' as const,
    id: '1',
    appId: 'app_recipe-saver',
    capability: 'analytics.track' as const,
    method: 'track',
    payload: {},
  },
};

describe('analytics.track — container bridge persistence path', () => {
  test('delegates to the host analytics tracker instead of fake-acking', async () => {
    const trackAnalytics = vi.fn(() => ({
      accepted: true,
      mode: 'aggregate-only' as const,
      persisted: true,
    }));
    const handlers = buildHandlers(trackAnalytics);
    const payload = { event: 'recipe_saved', props: { source: 'test' } };
    const result = await handlers['analytics.track']!({ payload, ...dummyContext });

    expect(trackAnalytics).toHaveBeenCalledWith('app_recipe-saver', payload);
    expect(result).toMatchObject({ accepted: true, persisted: true });
  });

  test('reports analytics_unavailable when no host tracker is supplied', async () => {
    const handlers = buildHandlers();
    const result = await handlers['analytics.track']!({
      payload: { event: 'recipe_saved' },
      ...dummyContext,
    });

    expect(result).toMatchObject({
      accepted: false,
      persisted: false,
      reason: 'analytics_unavailable',
    });
  });
});
