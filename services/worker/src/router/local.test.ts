import { describe, expect, test } from 'bun:test';
import { createApp } from '../app.ts';
import type { WorkerEnv } from '../env.ts';
import type { KvStore, R2Store } from '@shippie/dev-storage';

function fakeKv(data: Record<string, string> = {}): KvStore {
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

function r2With(data: Record<string, Uint8Array> = {}): R2Store {
  return {
    get: async (key) => {
      const bytes = data[key];
      return bytes
        ? {
            key,
            body: async () => bytes,
            text: async () => new TextDecoder().decode(bytes),
            json: async <T>() => JSON.parse(new TextDecoder().decode(bytes)) as T,
            arrayBuffer: async () => {
              const copy = new Uint8Array(bytes.byteLength);
              copy.set(bytes);
              return copy.buffer;
            },
            size: bytes.byteLength,
            httpMetadata: { contentType: 'application/javascript' },
          }
        : null;
    },
    head: async () => null,
    put: async () => {},
    delete: async () => {},
    list: async () => [],
  };
}

function envFor(publicR2: R2Store): WorkerEnv {
  return {
    SHIPPIE_ENV: 'test',
    PLATFORM_API_URL: 'https://example.invalid',
    WORKER_PLATFORM_SECRET: 'test-secret',
    INVITE_SECRET: 'test-invite-secret',
    APP_CONFIG: fakeKv(),
    SHIPPIE_APPS: r2With(),
    SHIPPIE_PUBLIC: publicR2,
  };
}

describe('__shippie/local.js', () => {
  const app = createApp();

  test('serves dev stub when no local bundle exists', async () => {
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/local.js', {
        headers: { host: 'zen.shippie.app' },
      }),
      envFor(r2With()),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/javascript');
    expect(await res.text()).toContain('shippie.local');
  });

  test('serves bundled local runtime from public R2 when available', async () => {
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/local.js', {
        headers: { host: 'zen.shippie.app' },
      }),
      envFor(r2With({ 'local/v1.latest.js': new TextEncoder().encode('globalThis.loadedLocal = true;') })),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('loadedLocal');
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
  });

  test('serves local runtime wasm assets from public R2', async () => {
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/local/wa-sqlite-async.wasm', {
        headers: { host: 'zen.shippie.app' },
      }),
      envFor(r2With({ 'local/wa-sqlite-async.wasm': new Uint8Array([0, 97, 115, 109]) })),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/wasm');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0, 97, 115, 109]));
  });

  test('serves local runtime worker asset from public R2', async () => {
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/local/worker.latest.js', {
        headers: { host: 'zen.shippie.app' },
      }),
      envFor(r2With({ 'local/worker.latest.js': new TextEncoder().encode('self.ready = true;') })),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/javascript');
    expect(await res.text()).toContain('ready');
  });
});
