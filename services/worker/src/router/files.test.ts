// services/worker/src/router/files.test.ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../app.ts';
import type { WorkerEnv } from '../env.ts';
import type {
  KvStore,
  R2HttpMetadata,
  R2Object,
  R2Store,
} from '@shippie/dev-storage';

function fakeKv(data: Record<string, string>): KvStore {
  return {
    get: async (k) => data[k] ?? null,
    getJson: async <T>(k: string) => (data[k] ? (JSON.parse(data[k]!) as T) : null),
    put: async (k, v) => {
      data[k] = v;
    },
    putJson: async (k, v) => {
      data[k] = JSON.stringify(v);
    },
    delete: async (k) => {
      delete data[k];
    },
    list: async (prefix) => Object.keys(data).filter((k) => !prefix || k.startsWith(prefix)),
  };
}

interface StoredObject {
  bytes: Uint8Array;
  httpMetadata?: R2HttpMetadata;
}

function fakeR2(store: Record<string, StoredObject>): R2Store {
  const toObject = (key: string, entry: StoredObject): R2Object => ({
    key,
    size: entry.bytes.byteLength,
    httpMetadata: entry.httpMetadata,
    body: async () => entry.bytes,
    text: async () => new TextDecoder().decode(entry.bytes),
    json: async <T>() => JSON.parse(new TextDecoder().decode(entry.bytes)) as T,
    arrayBuffer: async () => {
      const copy = new ArrayBuffer(entry.bytes.byteLength);
      new Uint8Array(copy).set(entry.bytes);
      return copy;
    },
  });
  return {
    get: async (k) => (store[k] ? toObject(k, store[k]!) : null),
    head: async (k) =>
      store[k]
        ? { key: k, size: store[k]!.bytes.byteLength, httpMetadata: store[k]!.httpMetadata }
        : null,
    put: async (k, v, metadata) => {
      const bytes =
        typeof v === 'string'
          ? new TextEncoder().encode(v)
          : v instanceof Uint8Array
          ? v
          : new Uint8Array(v);
      store[k] = { bytes, httpMetadata: metadata };
    },
    delete: async (k) => {
      delete store[k];
    },
    list: async (prefix) => Object.keys(store).filter((k) => !prefix || k.startsWith(prefix)),
  };
}

function emptyR2(): R2Store {
  return {
    get: async () => null,
    head: async () => null,
    put: async () => {},
    delete: async () => {},
    list: async () => [],
  };
}

function envFor(kv: KvStore, apps: R2Store): WorkerEnv {
  return {
    SHIPPIE_ENV: 'test',
    PLATFORM_API_URL: 'https://example.invalid',
    WORKER_PLATFORM_SECRET: 'test-secret',
    INVITE_SECRET: 'test-invite-secret',
    APP_CONFIG: kv,
    SHIPPIE_APPS: apps,
    SHIPPIE_PUBLIC: emptyR2(),
  };
}

describe('files router — wasm headers', () => {
  let kv: KvStore;
  let appsBucket: R2Store;
  let env: WorkerEnv;
  const app = createApp();

  beforeEach(async () => {
    const kvData: Record<string, string> = {};
    const r2Data: Record<string, StoredObject> = {};
    kv = fakeKv(kvData);
    appsBucket = fakeR2(r2Data);
    env = envFor(kv, appsBucket);

    // Mark slug 'wasmy' as published at v1
    await kv.put('apps:wasmy:active', '1');
    // Stash a fake .wasm body and a sibling .js file in R2
    await appsBucket.put(
      'apps/wasmy/v1/hello.wasm',
      new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
      { contentType: 'application/octet-stream' }, // intentionally wrong; router should override
    );
    await appsBucket.put(
      'apps/wasmy/v1/app.js',
      new TextEncoder().encode('console.log("hi")'),
      { contentType: 'application/javascript' },
    );
  });

  test('serves .wasm with application/wasm + COEP + COOP headers', async () => {
    const res = await app.fetch(
      new Request('https://wasmy.shippie.app/hello.wasm', {
        headers: { host: 'wasmy.shippie.app' },
      }),
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/wasm');
    expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  test('non-wasm assets do not gain COEP/COOP headers', async () => {
    const res = await app.fetch(
      new Request('https://wasmy.shippie.app/app.js', {
        headers: { host: 'wasmy.shippie.app' },
      }),
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/javascript');
    expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBeNull();
    expect(res.headers.get('Cross-Origin-Opener-Policy')).toBeNull();
  });
});
