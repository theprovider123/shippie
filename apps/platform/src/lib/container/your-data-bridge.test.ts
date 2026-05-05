import { describe, expect, test } from 'vitest';
import {
  ContainerBridgeClient,
  ContainerBridgeHost,
  createMemoryBridgeTransports,
} from '@shippie/container-bridge';
import { SHIPPIE_PERMISSIONS_SCHEMA, type AppPermissions } from '@shippie/app-package-contract';
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

function buildContext(app: ContainerApp, dataOpenPanel: AppHandlerContext['dataOpenPanel']) {
  return {
    appId: app.id,
    app,
    insertRow: () => ({ id: 'x', table: 't', payload: null, createdAt: '' }),
    queryRows: () => ({ rows: [] }),
    storageUsage: () => ({ rows: 0, bytes: 0 }),
    consumeIntent: async () => ({ provider: null, rows: [] }),
    consumersFor: () => [],
    dataOpenPanel,
    fireTexture: () => ({ fired: true as const, name: 'confirm' }),
    runAi: async () => ({ task: 'classify' as const, output: null, source: 'unavailable' as const }),
    broadcastIntent: () => ({ delivered: 0 }),
    listOverlappingApps: () => [],
    insightsForApp: () => [],
    startTransferDrop: () => ({ kind: '', acceptors: [] }),
    commitTransferDrop: () => ({ delivered: false, target: null, reason: 'no_target' as const }),
  } satisfies AppHandlerContext;
}

describe('Your Data bridge path', () => {
  test('an iframe data.openPanel call opens the container host panel for that app', async () => {
    const app = makeApp('recipe-saver');
    const openedFor: string[] = [];
    const transports = createMemoryBridgeTransports();
    const permissions: AppPermissions = {
      schema: SHIPPIE_PERMISSIONS_SCHEMA,
      capabilities: {},
    };

    const host = new ContainerBridgeHost({
      appId: app.id,
      permissions,
      transport: transports.host,
      handlers: createAppHandlers(
        buildContext(app, (appId) => {
          openedFor.push(appId);
          return { opened: true };
        }),
      ),
    });
    const client = new ContainerBridgeClient({
      appId: app.id,
      transport: transports.client,
    });

    await expect(client.call('data.openPanel', 'open', {})).resolves.toEqual({ opened: true });
    expect(openedFor).toEqual([app.id]);

    client.dispose();
    host.dispose();
  });
});
