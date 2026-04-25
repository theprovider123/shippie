import { beforeEach, describe, expect, test } from 'bun:test';
import { attachLocalRuntime, createLocalRuntime } from './index.ts';
import type { LocalDbRecord, ShippieLocalDb, ShippieLocalFiles } from '@shippie/local-runtime-contract';

function fakeFiles(): ShippieLocalFiles {
  const data = new Map<string, Blob>();
  return {
    write: async (path, value) => {
      data.set(path, value instanceof Blob ? value : new Blob([value]));
    },
    read: async (path) => data.get(path) ?? new Blob(),
    list: async () => [...data.keys()].map((path) => ({ path, kind: 'file' as const })),
    delete: async (path) => {
      data.delete(path);
    },
    usage: async () => ({ usedBytes: data.size }),
    thumbnail: async () => new Blob(['thumb']),
  };
}

describe('@shippie/local-runtime', () => {
  beforeEach(() => {
    delete (globalThis as { shippie?: unknown }).shippie;
  });

  test('creates a runtime with lazy files and unsupported db/ai boundaries', async () => {
    let created = 0;
    const runtime = createLocalRuntime({
      files: async () => {
        created += 1;
        return fakeFiles();
      },
    });

    expect(runtime.version).toBe('0.1.0');
    expect(created).toBe(0);
    await runtime.files.write('notes/a.txt', 'hello');
    await runtime.files.write('notes/b.txt', 'world');
    expect(created).toBe(1);
    expect(await (await runtime.files.read('notes/a.txt')).text()).toBe('hello');
    await expect(runtime.db.create('recipes', { id: 'text primary key' })).rejects.toThrow(/OPFS/);
    await expect(runtime.ai.available()).resolves.toMatchObject({ embeddings: false });
  });

  test('accepts an injected db factory for tests and future adapter swaps', async () => {
    let created = 0;
    const runtime = createLocalRuntime({
      dbFactory: async () => {
        created += 1;
        return {
          create: async () => {},
          insert: async () => {},
          query: async <T extends LocalDbRecord = LocalDbRecord>() => [{ id: '1' } as unknown as T],
          search: async <T extends LocalDbRecord = LocalDbRecord>() => [] as T[],
          vectorSearch: async <T extends LocalDbRecord = LocalDbRecord>() => [] as Array<T & { score: number }>,
          update: async () => {},
          delete: async () => {},
          count: async () => 1,
          export: async () => new Blob(),
          restore: async () => ({ appId: 'x', createdAt: new Date(0).toISOString(), schemaVersion: 1, encrypted: true }),
          lastBackup: async () => null,
          usage: async () => ({ usedBytes: 0 }),
          requestPersistence: async () => false,
        } satisfies ShippieLocalDb;
      },
    });
    expect(await runtime.db.count('recipes')).toBe(1);
    expect(await runtime.db.query('recipes')).toEqual([{ id: '1' }]);
    expect(created).toBe(1);
  });

  test('attaches to window.shippie.local without removing existing shippie fields', () => {
    const root = { shippie: { track: () => {} } };

    const runtime = attachLocalRuntime({
      root: root as unknown as typeof globalThis,
      files: fakeFiles(),
    });

    expect(root.shippie.track).toBeFunction();
    expect((root.shippie as { local?: unknown }).local).toBe(runtime);
  });
});
