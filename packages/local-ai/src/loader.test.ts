import { describe, expect, test } from 'bun:test';
import { createLocalAiModelLoader } from './loader.ts';

const manifest = {
  schemaVersion: 1,
  generatedAt: '2026-04-24T00:00:00.000Z',
  baseUrl: 'https://models.shippie.app/v1',
  models: [
    {
      id: 'gte-small',
      version: '1.0.0',
      kind: 'embedding',
      runtime: 'transformers-js',
      features: ['embeddings'],
      bytes: 4,
      chunks: [{ path: 'gte-small/model.bin', bytes: 4, integrity: 'sha256-abc=' }],
      dimensions: 384,
      recommended: true,
    },
  ],
};

describe('@shippie/local-ai model loader', () => {
  test('fetches the manifest and stores missing chunks in Cache API', async () => {
    const cacheStorage = new MemoryCacheStorage();
    const fetches: string[] = [];
    const loader = createLocalAiModelLoader({
      cacheStorage: cacheStorage as unknown as CacheStorage,
      verifyIntegrity: false,
      fetch: async (input) => {
        const url = String(input);
        fetches.push(url);
        if (url.endsWith('/manifest.json')) {
          return Response.json(manifest);
        }
        return new Response(new Uint8Array([1, 2, 3, 4]));
      },
    });

    const first = await loader.ensure('embeddings');
    const second = await loader.ensure('embeddings');

    expect(first.downloadedBytes).toBe(4);
    expect(first.cachedBytes).toBe(0);
    expect(second.downloadedBytes).toBe(0);
    expect(second.cachedBytes).toBe(4);
    expect(fetches.filter((url) => url.endsWith('model.bin')).length).toBe(1);
  });

  test('rejects chunks with the wrong byte length before caching', async () => {
    const cacheStorage = new MemoryCacheStorage();
    const loader = createLocalAiModelLoader({
      cacheStorage: cacheStorage as unknown as CacheStorage,
      verifyIntegrity: false,
      fetch: async (input) => {
        const url = String(input);
        if (url.endsWith('/manifest.json')) return Response.json(manifest);
        return new Response(new Uint8Array([1, 2]));
      },
    });

    await expect(loader.ensure('embeddings')).rejects.toThrow(/byte length/);
    const cache = await cacheStorage.open('shippie-local-ai-models-v1');
    expect(await cache.match('https://models.shippie.app/v1/gte-small/model.bin')).toBeUndefined();
  });
});

class MemoryCacheStorage {
  private readonly caches = new Map<string, MemoryCache>();

  async open(name: string): Promise<MemoryCache> {
    let cache = this.caches.get(name);
    if (!cache) {
      cache = new MemoryCache();
      this.caches.set(name, cache);
    }
    return cache;
  }
}

class MemoryCache {
  private readonly entries = new Map<string, Response>();

  async match(url: string): Promise<Response | undefined> {
    return this.entries.get(url);
  }

  async put(url: string, response: Response): Promise<void> {
    this.entries.set(url, response);
  }
}
