/**
 * Phase C2 — verify the `intent.provide` handler reads `payload.rows`
 * and calls `broadcastIntent`. Pure unit test on the handler factory —
 * no iframes required.
 */
import { describe, expect, test, vi } from 'vitest';
import { createAppHandlers, type AppHandlerContext } from './bridge-handlers';
import { localPermissions, type ContainerApp } from './state';

function makeApp(slug: string, intents: { provides?: string[]; consumes?: string[] }): ContainerApp {
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
    standaloneUrl: `/apps/${slug}`,
    permissions: localPermissions(slug, intents),
  };
}

function buildHandler(broadcastIntent: AppHandlerContext['broadcastIntent']) {
  const provider = makeApp('recipe-saver', { provides: ['cooked-meal'] });
  const ctx: AppHandlerContext = {
    appId: provider.id,
    app: provider,
    insertRow: () => ({ id: 'x', table: 't', payload: null, createdAt: '' }),
    queryRows: () => ({ rows: [] }),
    storageUsage: () => ({ rows: 0, bytes: 0 }),
    consumeIntent: async () => ({ provider: null, rows: [] }),
    consumersFor: () => [],
    dataOpenPanel: () => ({ opened: true as const }),
    fireTexture: () => ({ fired: true, name: 'confirm' }),
    runAi: async () => ({ task: 'classify', output: null, source: 'unavailable' }),
    broadcastIntent,
  };
  return createAppHandlers(ctx);
}

const dummyContext = {
  capability: 'intent.provide' as const,
  method: 'broadcast',
  request: {
    protocol: 'shippie.bridge.v1' as const,
    id: '1',
    appId: 'app_recipe-saver',
    capability: 'intent.provide' as const,
    method: 'broadcast',
    payload: {},
  },
};

describe('intent.provide — broadcast path', () => {
  test('forwards rows to broadcastIntent when payload includes rows', async () => {
    const broadcast = vi.fn(() => ({ delivered: 2 }));
    const handlers = buildHandler(broadcast);
    const result = await handlers['intent.provide']!({
      payload: { intent: 'cooked-meal', rows: [{ dish: 'a' }, { dish: 'b' }] },
      ...dummyContext,
    });
    expect(broadcast).toHaveBeenCalledWith('app_recipe-saver', 'cooked-meal', [
      { dish: 'a' },
      { dish: 'b' },
    ]);
    expect(result).toMatchObject({ rowsBroadcast: 2, delivered: 2 });
  });

  test('does not call broadcastIntent when no rows are provided', async () => {
    const broadcast = vi.fn();
    const handlers = buildHandler(broadcast);
    await handlers['intent.provide']!({ payload: { intent: 'cooked-meal' }, ...dummyContext });
    expect(broadcast).not.toHaveBeenCalled();
  });

  test('does not call broadcastIntent when intent is missing', async () => {
    const broadcast = vi.fn();
    const handlers = buildHandler(broadcast);
    await handlers['intent.provide']!({ payload: { rows: [{}] }, ...dummyContext });
    expect(broadcast).not.toHaveBeenCalled();
  });

  test('drops rows when payload.rows is not an array', async () => {
    const broadcast = vi.fn();
    const handlers = buildHandler(broadcast);
    const result = await handlers['intent.provide']!({
      payload: { intent: 'cooked-meal', rows: 'not-an-array' },
      ...dummyContext,
    });
    expect(broadcast).not.toHaveBeenCalled();
    expect(result).toMatchObject({ rowsBroadcast: 0 });
  });
});
