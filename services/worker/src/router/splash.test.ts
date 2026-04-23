import { beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../app.ts';
import type { WorkerEnv } from '../env.ts';
import type { KvStore, R2Object, R2Store } from '@shippie/dev-storage';

function fakeKv(data: Record<string, string>): KvStore {
  return {
    get: async (k) => data[k] ?? null,
    getJson: async <T>(k: string) => (data[k] ? (JSON.parse(data[k]!) as T) : null),
    put: async (k, v) => { data[k] = v; },
    putJson: async (k, v) => { data[k] = JSON.stringify(v); },
    delete: async (k) => { delete data[k]; },
    list: async (p) => Object.keys(data).filter((k) => !p || k.startsWith(p)),
  };
}

function fakeR2(objects: Record<string, Uint8Array>): R2Store {
  return {
    get: async (key): Promise<R2Object | null> => {
      const bytes = objects[key];
      if (!bytes) return null;
      return {
        key,
        size: bytes.byteLength,
        body: async () => bytes,
        text: async () => new TextDecoder().decode(bytes),
        json: async () => JSON.parse(new TextDecoder().decode(bytes)),
        arrayBuffer: async () => {
          const copy = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(copy).set(bytes);
          return copy;
        },
      };
    },
    head: async (key) => {
      const bytes = objects[key];
      return bytes ? { key, size: bytes.byteLength } : null;
    },
    put: async () => {},
    delete: async () => {},
    list: async (prefix) => Object.keys(objects).filter((k) => !prefix || k.startsWith(prefix)),
  };
}

function emptyR2(): R2Store {
  return {
    get: async () => null, head: async () => null,
    put: async () => {}, delete: async () => {}, list: async () => [],
  };
}

describe('GET /__shippie/splash/:device', () => {
  const app = createApp();
  let env: WorkerEnv;

  function envWithPublic(publicR2: R2Store): WorkerEnv {
    return {
      SHIPPIE_ENV: 'test',
      PLATFORM_API_URL: 'https://platform.test',
      WORKER_PLATFORM_SECRET: 'test-secret',
      INVITE_SECRET: 'test-invite-secret',
      APP_CONFIG: fakeKv({}),
      SHIPPIE_APPS: emptyR2(),
      SHIPPIE_PUBLIC: publicR2,
    };
  }

  beforeEach(() => {
    env = envWithPublic(emptyR2());
  });

  test('serves app-specific splash png with image/png and long cache', async () => {
    const appBytes = new Uint8Array([1, 2, 3, 4]);
    env = envWithPublic(fakeR2({ 'splash/zen/iphone-x.png': appBytes }));
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/splash/iphone-x.png', {
        headers: { host: 'zen.shippie.app' },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=604800');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.length).toBe(4);
    expect(buf[0]).toBe(1);
  });

  test('falls back to splash/default/<device> when app-specific missing', async () => {
    const defBytes = new Uint8Array([9, 9, 9]);
    env = envWithPublic(fakeR2({ 'splash/default/iphone-x.png': defBytes }));
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/splash/iphone-x.png', {
        headers: { host: 'zen.shippie.app' },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.length).toBe(3);
    expect(buf[0]).toBe(9);
  });

  test('returns 404 when both app-specific and default missing', async () => {
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/splash/iphone-x.png', {
        headers: { host: 'zen.shippie.app' },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });
});
