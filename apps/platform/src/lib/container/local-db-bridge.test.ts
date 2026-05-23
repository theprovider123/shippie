import { describe, expect, test } from 'vitest';
import {
  ContainerBridgeClient,
  ContainerBridgeHost,
  createMemoryBridgeTransports,
} from '@shippie/container-bridge';
import {
  buildLocalRow,
  computeStorageUsage,
  createAppHandlers,
  deleteLocalDbRow,
  queryLocalDbRows,
  updateLocalDbRow,
  type AppHandlerContext,
} from './bridge-handlers';
import { localPermissions, type ContainerApp, type LocalRow } from './state';

function makeApp(): ContainerApp {
  return {
    id: 'app_lift',
    slug: 'lift',
    name: 'Lift',
    shortName: 'Lift',
    description: '',
    appKind: 'local',
    entry: 'app/index.html',
    labelKind: 'Local',
    icon: 'L',
    accent: '#000',
    version: '1',
    packageHash: `sha256:${'0'.repeat(64)}`,
    standaloneUrl: '/run/lift',
    permissions: localPermissions('lift'),
  };
}

describe('container local DB bridge', () => {
  test('supports create, insert, query, update, delete, and count through the bridge', async () => {
    const app = makeApp();
    const rowsByApp: Record<string, LocalRow[]> = {};
    const persisted: Record<string, LocalRow[]>[] = [];
    const persist = () => persisted.push(structuredClone(rowsByApp));
    const ctx: AppHandlerContext = {
      appId: app.id,
      app,
      createTable: (_appId, payload) => ({ created: true, table: String((payload as { table: string }).table) }),
      insertRow: (appId, payload) => {
        const existing = rowsByApp[appId] ?? [];
        const row = buildLocalRow(appId, app.slug, payload, existing.length);
        rowsByApp[appId] = [row, ...existing];
        persist();
        return row;
      },
      queryRows: (appId, payload) => ({ rows: queryLocalDbRows(rowsByApp[appId] ?? [], payload) }),
      updateRow: (appId, payload) => {
        const result = updateLocalDbRow(rowsByApp[appId] ?? [], payload);
        rowsByApp[appId] = result.rows;
        persist();
        return { updated: result.updated };
      },
      deleteRow: (appId, payload) => {
        const result = deleteLocalDbRow(rowsByApp[appId] ?? [], payload);
        rowsByApp[appId] = result.rows;
        persist();
        return { deleted: result.deleted };
      },
      storageUsage: (appId) => computeStorageUsage(rowsByApp[appId] ?? []),
      consumeIntent: async () => ({ provider: null, rows: [] }),
      consumersFor: () => [],
      dataOpenPanel: () => ({ opened: true }),
      fireTexture: () => ({ fired: true, name: 'confirm' }),
      runAi: async () => ({ task: 'classify', output: null, source: 'unavailable' }),
      broadcastIntent: () => ({ delivered: 0 }),
      listOverlappingApps: () => [],
      insightsForApp: () => [],
      startTransferDrop: () => ({ kind: '', acceptors: [] }),
      commitTransferDrop: () => ({ delivered: false, target: null, reason: 'no_target' }),
    };

    const transports = createMemoryBridgeTransports();
    const host = new ContainerBridgeHost({
      appId: app.id,
      permissions: app.permissions,
      transport: transports.host,
      handlers: createAppHandlers(ctx),
    });
    const client = new ContainerBridgeClient({ appId: app.id, transport: transports.client });

    await expect(client.call('db.insert', 'create', { table: 'sets', schema: { id: 'text primary key' } }))
      .resolves.toEqual({ created: true, table: 'sets' });
    await client.call('db.insert', 'insert', { table: 'sets', value: { id: 's1', reps: 5, weight: 100 } });
    await client.call('db.insert', 'insert', { table: 'sets', value: { id: 's2', reps: 8, weight: 80 } });

    await expect(client.call('db.query', 'query', { table: 'sets', where: { reps: { gte: 6 } } }))
      .resolves.toMatchObject({ rows: [{ id: 's2', payload: { id: 's2', reps: 8, weight: 80 } }] });
    await expect(client.call('db.query', 'search', { table: 'sets', query: '100' }))
      .resolves.toMatchObject({ rows: [{ id: 's1', payload: { id: 's1', reps: 5, weight: 100 } }] });
    await expect(client.call('db.query', 'count', { table: 'sets' })).resolves.toEqual({ count: 2 });
    await expect(client.call('db.insert', 'update', { table: 'sets', id: 's1', patch: { reps: 6 } }))
      .resolves.toEqual({ updated: true });
    await expect(client.call('db.query', 'query', { table: 'sets', where: { id: 's1' } }))
      .resolves.toMatchObject({ rows: [{ id: 's1', payload: { id: 's1', reps: 6, weight: 100 } }] });
    await expect(client.call('db.insert', 'delete', { table: 'sets', id: 's2' }))
      .resolves.toEqual({ deleted: true });
    await expect(client.call('storage.getUsage', 'usage', {})).resolves.toMatchObject({ rows: 1 });
    expect(persisted.length).toBeGreaterThanOrEqual(4);

    client.dispose();
    host.dispose();
  });
});
