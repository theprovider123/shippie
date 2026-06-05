import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, test, vi } from 'vitest';

const STORAGE_KEY = 'shippie.container.v1';
const LAUNCHER_SOURCE = readFileSync(new URL('../../../static/__shippie/launcher.js', import.meta.url), 'utf8');

type LauncherApi = {
  handleBridgeRequest(data: {
    appId?: string;
    capability: string;
    method: string;
    payload?: Record<string, unknown>;
  }): Promise<unknown>;
  readContainerRows(appId: string): Array<{ id: string; table: string; payload: unknown; createdAt: string }> | null;
};

describe('offline launcher local bridge', () => {
  test('reads rows from the same container localStorage state as the online Dock', async () => {
    const storage = memoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        openAppIds: ['app_palate'],
        importedApps: [],
        packageFilesByApp: {},
        receiptsByApp: {},
        rowsByApp: {
          app_palate: [
            {
              id: 'meal-1',
              table: 'meals',
              payload: { id: 'meal-1', title: 'Soup', rating: 5 },
              createdAt: '2026-06-05T10:00:00.000Z',
            },
          ],
        },
      }),
    );
    const api = bootLauncher(storage);

    await expect(
      api.handleBridgeRequest({
        appId: 'app_palate',
        capability: 'db.query',
        method: 'query',
        payload: { table: 'meals', where: { rating: { gte: 4 } } },
      }),
    ).resolves.toMatchObject({
      rows: [{ id: 'meal-1', table: 'meals', payload: { title: 'Soup' } }],
    });
  });

  test('writes offline inserts back into the canonical container state', async () => {
    const storage = memoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        openAppIds: ['app_palate'],
        importedApps: [{ id: 'app_palate', slug: 'palate' }],
        packageFilesByApp: { app_palate: { 'app/index.html': { text: '<h1>Palate</h1>' } } },
        receiptsByApp: { app_palate: { version: '1' } },
        rowsByApp: {},
        intentGrants: { app_palate: {} },
      }),
    );
    const api = bootLauncher(storage);

    await api.handleBridgeRequest({
      appId: 'app_palate',
      capability: 'db.insert',
      method: 'insert',
      payload: { table: 'meals', value: { id: 'meal-2', title: 'Stew' } },
    });

    const saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
    expect(saved.openAppIds).toEqual(['app_palate']);
    expect(saved.receiptsByApp.app_palate.version).toBe('1');
    expect(saved.packageFilesByApp.app_palate['app/index.html'].text).toBe('<h1>Palate</h1>');
    expect(saved.rowsByApp.app_palate).toMatchObject([
      { id: 'meal-2', table: 'meals', payload: { id: 'meal-2', title: 'Stew' } },
    ]);
  });

  test('updates and deletes rows through the shared state', async () => {
    const storage = memoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        openAppIds: [],
        receiptsByApp: {},
        rowsByApp: {
          app_notes: [
            {
              id: 'note-1',
              table: 'notes',
              payload: { id: 'note-1', title: 'Draft', done: false },
              createdAt: '2026-06-05T10:00:00.000Z',
            },
          ],
        },
      }),
    );
    const api = bootLauncher(storage);

    await expect(
      api.handleBridgeRequest({
        appId: 'app_notes',
        capability: 'db.insert',
        method: 'update',
        payload: { table: 'notes', id: 'note-1', patch: { done: true } },
      }),
    ).resolves.toEqual({ updated: true });

    expect(api.readContainerRows('app_notes')?.[0]?.payload).toMatchObject({ id: 'note-1', done: true });

    await expect(
      api.handleBridgeRequest({
        appId: 'app_notes',
        capability: 'db.insert',
        method: 'delete',
        payload: { table: 'notes', id: 'note-1' },
      }),
    ).resolves.toEqual({ deleted: true });
    expect(api.readContainerRows('app_notes')).toEqual([]);
  });
});

function bootLauncher(storage: Storage): LauncherApi {
  const window = {
    __SHIPPIE_TEST_OFFLINE_LAUNCHER__: true,
    addEventListener: vi.fn(),
    localStorage: storage,
  } as unknown as Window & typeof globalThis & { __shippieOfflineLauncherTest?: LauncherApi };
  const context = {
    window,
    document: {
      getElementById: () => ({ replaceChildren: vi.fn() }),
      title: '',
    },
    crypto: {
      randomUUID: () => 'offline-row-id',
    },
    Date,
    Error,
    JSON,
    Map,
    Number,
    Object,
    Promise,
    Set,
    String,
    TextEncoder,
    URL,
    console,
    indexedDB: undefined,
  };
  vm.runInContext(LAUNCHER_SOURCE, vm.createContext(context));
  const api = window.__shippieOfflineLauncherTest;
  if (!api) throw new Error('launcher test api was not installed');
  return api;
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}
