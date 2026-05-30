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
  createWindowBridgeTransport,
  type MessageEventLike,
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

  test('rejects oversized payloads before handler execution', async () => {
    const transports = createMemoryBridgeTransports();
    let called = false;
    const host = new ContainerBridgeHost({
      appId: 'app_recipe_saver',
      permissions,
      transport: transports.host,
      maxPayloadBytes: 16,
      handlers: {
        'db.insert': () => {
          called = true;
          return { ok: true };
        },
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_recipe_saver',
      transport: transports.client,
    });

    await expect(
      client.call('db.insert', 'insert', {
        title: 'This payload is too large',
      }),
    ).rejects.toThrow(/payload exceeds/);
    expect(called).toBe(false);

    client.dispose();
    host.dispose();
  });

  test('ignores requests for sibling apps in a shared container', async () => {
    const transports = createMemoryBridgeTransports();
    const host = new ContainerBridgeHost({
      appId: 'app_recipe_saver',
      permissions,
      transport: transports.host,
      handlers: {
        'db.insert': () => ({ ok: true }),
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_journal',
      transport: transports.client,
      timeoutMs: 5,
    });

    await expect(client.call('db.insert', 'insert', {})).rejects.toThrow(/timed out/);

    client.dispose();
    host.dispose();
  });

  test('rate limits noisy app bridges', async () => {
    const transports = createMemoryBridgeTransports();
    const host = new ContainerBridgeHost({
      appId: 'app_recipe_saver',
      permissions,
      transport: transports.host,
      rateLimit: { maxRequests: 1, windowMs: 1_000 },
      handlers: {
        'feedback.open': ({ payload }) => ({ opened: true, payload }),
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_recipe_saver',
      transport: transports.client,
    });

    await expect(client.call('feedback.open', 'open', { type: 'idea' })).resolves.toEqual({
      opened: true,
      payload: { type: 'idea' },
    });
    await expect(client.call('feedback.open', 'open', { type: 'idea' })).rejects.toThrow(/rate limit/);

    client.dispose();
    host.dispose();
  });

  test('rejects system.* capabilities for iframe apps without system permission', async () => {
    const transports = createMemoryBridgeTransports();
    let called = false;
    const host = new ContainerBridgeHost({
      appId: 'app_recipe_saver',
      permissions,
      transport: transports.host,
      handlers: {
        'system.crossDb.query': () => {
          called = true;
          return { ok: true };
        },
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_recipe_saver',
      transport: transports.client,
    });

    await expect(
      client.call('system.crossDb.query', 'cross_db_query', { sql: 'select 1' }),
    ).rejects.toThrow(/Capability is not granted/);
    expect(called).toBe(false);

    client.dispose();
    host.dispose();
  });

  test('A5 — data.openPanel is universal and reaches the host handler', async () => {
    const minimal: AppPermissions = {
      schema: SHIPPIE_PERMISSIONS_SCHEMA,
      capabilities: {},
    };
    const transports = createMemoryBridgeTransports();
    let openedFor: string | null = null;
    const host = new ContainerBridgeHost({
      appId: 'app_recipe_saver',
      permissions: minimal,
      transport: transports.host,
      handlers: {
        'data.openPanel': ({ request }) => {
          openedFor = request.appId;
          return { opened: true };
        },
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_recipe_saver',
      transport: transports.client,
    });

    await expect(
      client.call('data.openPanel', 'open', {}),
    ).resolves.toEqual({ opened: true });
    expect(openedFor).toBe('app_recipe_saver');

    client.dispose();
    host.dispose();
  });

  test('B4 — feel.texture is universal and reaches the host handler with the name payload', async () => {
    const minimal: AppPermissions = {
      schema: SHIPPIE_PERMISSIONS_SCHEMA,
      capabilities: {},
    };
    const transports = createMemoryBridgeTransports();
    const fired: string[] = [];
    const host = new ContainerBridgeHost({
      appId: 'app_recipe_saver',
      permissions: minimal,
      transport: transports.host,
      handlers: {
        'feel.texture': ({ payload }) => {
          const name = (payload as { name?: string }).name ?? '';
          fired.push(name);
          return { fired: true, name };
        },
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_recipe_saver',
      transport: transports.client,
    });

    await expect(
      client.call('feel.texture', 'fire', { name: 'confirm' }),
    ).resolves.toEqual({ fired: true, name: 'confirm' });
    expect(fired).toEqual(['confirm']);

    client.dispose();
    host.dispose();
  });

  test('grants system.* capabilities only when system permission lists the task', async () => {
    const systemPerms: AppPermissions = {
      schema: SHIPPIE_PERMISSIONS_SCHEMA,
      capabilities: {
        system: { tasks: ['cross_db_query'] },
      },
    };
    const transports = createMemoryBridgeTransports();
    const host = new ContainerBridgeHost({
      appId: 'app_agent_runtime',
      permissions: systemPerms,
      transport: transports.host,
      handlers: {
        'system.crossDb.query': ({ payload }) => ({ rows: payload }),
        'system.notify': () => ({ ok: true }),
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_agent_runtime',
      transport: transports.client,
    });

    await expect(
      client.call('system.crossDb.query', 'cross_db_query', { sql: 'select 1' }),
    ).resolves.toEqual({ rows: { sql: 'select 1' } });

    await expect(
      client.call('system.notify', 'notify', { title: 'hi' }),
    ).rejects.toThrow(/Capability is not granted/);

    client.dispose();
    host.dispose();
  });

  test('uses window-style postMessage transport and filters origins', async () => {
    const clientWindow = new FakeWindow('https://shippie.app');
    const hostWindow = new FakeWindow('https://shippie.app');

    const host = new ContainerBridgeHost({
      appId: 'app_recipe_saver',
      permissions,
      transport: createWindowBridgeTransport({
        currentWindow: hostWindow,
        targetWindow: createFakeTarget(hostWindow, clientWindow),
        targetOrigin: 'https://shippie.app',
        allowedOrigin: 'https://shippie.app',
      }),
      handlers: {
        'feedback.open': ({ payload }) => ({ opened: true, payload }),
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_recipe_saver',
      transport: createWindowBridgeTransport({
        currentWindow: clientWindow,
        targetWindow: createFakeTarget(clientWindow, hostWindow),
        targetOrigin: 'https://shippie.app',
        allowedOrigin: 'https://shippie.app',
      }),
    });

    await expect(client.call('feedback.open', 'open', { type: 'idea' })).resolves.toEqual({
      opened: true,
      payload: { type: 'idea' },
    });

    client.dispose();
    host.dispose();
  });
  test('onCommitLedger fires on success and is awaited before the response is posted', async () => {
    const transports = createMemoryBridgeTransports();
    const events: string[] = [];
    let commitResolve: (() => void) | null = null;
    const commitPromise = new Promise<void>((r) => {
      commitResolve = r;
    });

    const host = new ContainerBridgeHost({
      appId: 'app_recipe_saver',
      permissions,
      transport: transports.host,
      handlers: {
        'db.insert': () => {
          events.push('handler');
          return { id: 'r1' };
        },
      },
      onCommitLedger: async (event) => {
        events.push(`commit:${event.outcome}`);
        await commitPromise;
        events.push('commit:done');
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_recipe_saver',
      transport: transports.client,
    });

    const callPromise = client.call('db.insert', 'insert', { table: 'recipes' });

    // Yield until the commit hook is in flight.
    for (let i = 0; i < 5 && !events.includes('commit:ok'); i++) {
      await new Promise((r) => queueMicrotask(() => r(undefined)));
    }
    expect(events).toEqual(['handler', 'commit:ok']);

    // Release the commit; the call should resolve only now.
    commitResolve!();
    const result = await callPromise;
    expect(result).toEqual({ id: 'r1' });
    expect(events[events.length - 1]).toBe('commit:done');

    client.dispose();
    host.dispose();
  });

  test('onCommitLedger throwing produces a fail-closed ledger-unavailable response', async () => {
    const transports = createMemoryBridgeTransports();
    const host = new ContainerBridgeHost({
      appId: 'app_recipe_saver',
      permissions,
      transport: transports.host,
      handlers: {
        'db.insert': () => ({ id: 'r1' }),
      },
      onCommitLedger: async () => {
        throw new Error('IDB quota exceeded');
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_recipe_saver',
      transport: transports.client,
    });

    await expect(client.call('db.insert', 'insert', { table: 'recipes' })).rejects.toMatchObject({
      message: 'IDB quota exceeded',
    });

    client.dispose();
    host.dispose();
  });

  test('onCommitLedger throwing BridgeRpcError preserves the code in the response', async () => {
    const transports = createMemoryBridgeTransports();
    const host = new ContainerBridgeHost({
      appId: 'app_recipe_saver',
      permissions,
      transport: transports.host,
      handlers: {
        'db.insert': () => ({ id: 'r1' }),
      },
      onCommitLedger: async () => {
        throw new BridgeRpcError(
          'Trust Ledger could not record this action — paused for safety.',
          'key-unavailable',
        );
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_recipe_saver',
      transport: transports.client,
    });

    await expect(client.call('db.insert', 'insert', { table: 'recipes' })).rejects.toMatchObject({
      code: 'key-unavailable',
    });

    client.dispose();
    host.dispose();
  });

  test('onCommitLedger receives the denied outcome when capability gate rejects', async () => {
    const transports = createMemoryBridgeTransports();
    const seen: Array<{ outcome: string; errorCode?: string }> = [];
    const host = new ContainerBridgeHost({
      appId: 'app_recipe_saver',
      permissions,
      transport: transports.host,
      handlers: {
        'files.write': () => ({ ok: true }),
      },
      onCommitLedger: async (event) => {
        seen.push({ outcome: event.outcome, errorCode: event.errorCode });
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_recipe_saver',
      transport: transports.client,
    });

    await expect(client.call('files.write', 'write', { path: 'x.txt' })).rejects.toThrow(/Capability is not granted/);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.outcome).toBe('denied');

    client.dispose();
    host.dispose();
  });

  test('onCommitLedger receives handler_error when handler throws an unrelated error', async () => {
    const transports = createMemoryBridgeTransports();
    const seen: Array<{ outcome: string; errorCode?: string }> = [];
    const host = new ContainerBridgeHost({
      appId: 'app_recipe_saver',
      permissions,
      transport: transports.host,
      handlers: {
        'db.insert': () => {
          throw new Error('handler exploded');
        },
      },
      onCommitLedger: async (event) => {
        seen.push({ outcome: event.outcome, errorCode: event.errorCode });
      },
    });
    const client = new ContainerBridgeClient({
      appId: 'app_recipe_saver',
      transport: transports.client,
    });

    await expect(client.call('db.insert', 'insert', { table: 'recipes' })).rejects.toThrow(/handler exploded/);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.outcome).toBe('handler_error');

    client.dispose();
    host.dispose();
  });
});

class FakeWindow {
  private readonly listeners = new Set<(event: MessageEventLike) => void>();

  constructor(readonly origin: string) {}

  addEventListener(type: 'message', handler: (event: MessageEventLike) => void): void {
    if (type === 'message') this.listeners.add(handler);
  }

  removeEventListener(type: 'message', handler: (event: MessageEventLike) => void): void {
    if (type === 'message') this.listeners.delete(handler);
  }

  dispatch(event: MessageEventLike): void {
    for (const listener of this.listeners) listener(event);
  }
}

function createFakeTarget(from: FakeWindow, to: FakeWindow): { postMessage(message: unknown, targetOrigin: string): void } {
  return {
    postMessage(message, targetOrigin) {
      if (targetOrigin !== to.origin) return;
      queueMicrotask(() => to.dispatch({ data: message, origin: from.origin }));
    },
  };
}
