import { describe, expect, test } from 'bun:test';
import {
  SHIPPIE_PERMISSIONS_SCHEMA,
  type AppPermissions,
} from '@shippie/app-package-contract';
import {
  BridgeRpcError,
  ContainerBridgeClient,
  ContainerBridgeHost,
  createMemoryBridgeTransports,
} from './index.ts';

const permissions: AppPermissions = {
  schema: SHIPPIE_PERMISSIONS_SCHEMA,
  capabilities: {
    localDb: { enabled: true, namespace: 'recipe-saver' },
    network: {
      allowedDomains: ['world.openfoodfacts.org'],
      declaredPurpose: {
        'world.openfoodfacts.org': 'Barcode ingredient lookup',
      },
    },
    feedback: { enabled: true },
  },
};

describe('@shippie/container-bridge', () => {
  test('performs an in-memory bridge handshake', async () => {
    const transports = createMemoryBridgeTransports();
    const host = new ContainerBridgeHost({
      appId: 'app_recipe_saver',
      permissions,
      transport: transports.host,
      handlers: {
        'db.insert': ({ payload }) => ({ id: 'recipe_1', payload }),
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_recipe_saver',
      transport: transports.client,
    });

    const result = await client.call('db.insert', 'insert', {
      table: 'recipes',
      values: { title: 'Carbonara' },
    });

    expect(result).toEqual({
      id: 'recipe_1',
      payload: {
        table: 'recipes',
        values: { title: 'Carbonara' },
      },
    });

    client.dispose();
    host.dispose();
  });

  test('rejects ungranted capabilities before handler execution', async () => {
    const transports = createMemoryBridgeTransports();
    let called = false;
    const host = new ContainerBridgeHost({
      appId: 'app_recipe_saver',
      permissions,
      transport: transports.host,
      handlers: {
        'files.write': () => {
          called = true;
          return { ok: true };
        },
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_recipe_saver',
      transport: transports.client,
    });

    await expect(client.call('files.write', 'write', { path: 'x.txt' })).rejects.toThrow(/Capability is not granted/);
    expect(called).toBe(false);

    client.dispose();
    host.dispose();
  });

  test('allows declared network domains and rejects undeclared domains', async () => {
    const transports = createMemoryBridgeTransports();
    const host = new ContainerBridgeHost({
      appId: 'app_recipe_saver',
      permissions,
      transport: transports.host,
      handlers: {
        'network.fetch': ({ payload }) => ({ fetched: payload }),
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_recipe_saver',
      transport: transports.client,
    });

    await expect(
      client.call('network.fetch', 'fetch', {
        url: 'https://world.openfoodfacts.org/api/v2/search',
      }),
    ).resolves.toEqual({
      fetched: {
        url: 'https://world.openfoodfacts.org/api/v2/search',
      },
    });

    await expect(
      client.call('network.fetch', 'fetch', {
        url: 'https://analytics.example.com/collect',
      }),
    ).rejects.toThrow(/Capability is not granted/);

    client.dispose();
    host.dispose();
  });

  test('times out when no host responds', async () => {
    const transports = createMemoryBridgeTransports();
    const client = new ContainerBridgeClient({
      appId: 'app_recipe_saver',
      transport: transports.client,
      timeoutMs: 5,
    });

    await expect(client.call('db.insert', 'insert', {})).rejects.toThrow(BridgeRpcError);
    client.dispose();
  });
});
