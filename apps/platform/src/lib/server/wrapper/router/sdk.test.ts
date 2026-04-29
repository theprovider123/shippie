import { describe, expect, test } from 'vitest';
import type { R2Bucket } from '@cloudflare/workers-types';
import { handleSdk } from './sdk';
import type { WrapperEnv } from '../env';

function platformAssetsWith(value: Uint8Array | null, requested: string[]): R2Bucket {
  return {
    get: async (key: string) => {
      requested.push(key);
      if (!value) return null;
      const buf = value.buffer.slice(
        value.byteOffset,
        value.byteOffset + value.byteLength
      );
      return {
        key,
        size: value.byteLength,
        arrayBuffer: async () => buf,
        text: async () => new TextDecoder().decode(value),
        json: async () => JSON.parse(new TextDecoder().decode(value))
      };
    },
    head: async () => null,
    put: async () => null,
    delete: async () => undefined,
    list: async () => ({
      objects: [],
      truncated: false,
      delimitedPrefixes: []
    })
  } as unknown as R2Bucket;
}

function ctxFor(platformAssets: R2Bucket) {
  return {
    request: new Request('https://demo.shippie.app/__shippie/sdk.js', {
      headers: { host: 'demo.shippie.app' }
    }),
    env: { PLATFORM_ASSETS: platformAssets } as unknown as WrapperEnv,
    slug: 'demo',
    traceId: 'test-trace'
  };
}

describe('handleSdk', () => {
  test('serves the uploaded production SDK bundle from platform assets', async () => {
    const requested: string[] = [];
    const bundle = new TextEncoder().encode(
      "window.shippie = { version: 'production' };"
    );
    const res = await handleSdk(
      ctxFor(platformAssetsWith(bundle, requested))
    );

    expect(requested).toEqual(['sdk/v1.latest.js']);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/javascript');
    expect(res.headers.get('Cache-Control')).toContain(
      'stale-while-revalidate'
    );
    expect(await res.text()).toBe("window.shippie = { version: 'production' };");
  });

  test('falls back to the no-store dev stub when the bundle is not provisioned', async () => {
    const requested: string[] = [];
    const res = await handleSdk(ctxFor(platformAssetsWith(null, requested)));

    expect(requested).toEqual(['sdk/v1.latest.js']);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/javascript');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toContain('dev stub');
  });
});
