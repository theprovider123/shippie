import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelCache, sanitizeModelPath } from './model-cache.ts';

function tmp(label: string): string {
  const p = join(tmpdir(), `shippie-mc-${label}-${Date.now()}-${Math.random()}`);
  mkdirSync(p, { recursive: true });
  return p;
}

describe('sanitizeModelPath', () => {
  test('accepts safe paths', () => {
    expect(sanitizeModelPath('moderate/v1.onnx')).toBe('moderate/v1.onnx');
    expect(sanitizeModelPath('/moderate/v1.onnx')).toBe('moderate/v1.onnx');
  });
  test('rejects dot-dot and weird chars', () => {
    expect(sanitizeModelPath('../etc/passwd')).toBeNull();
    expect(sanitizeModelPath('hello world')).toBeNull();
    expect(sanitizeModelPath('')).toBeNull();
  });
});

describe('ModelCache', () => {
  test('first hit fetches upstream and writes to disk; second hit returns from disk', async () => {
    const root = tmp('serve');
    let upstreamCalls = 0;
    const fetchImpl = (async (input: string | URL | Request) => {
      upstreamCalls++;
      const u = typeof input === 'string' ? input : (input as URL | Request).toString();
      expect(u).toContain('https://ai.shippie.app/models/moderate/v1.onnx');
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: { 'content-type': 'application/octet-stream' },
      });
    }) as unknown as typeof fetch;
    try {
      const cache = new ModelCache({ cacheRoot: root, fetchImpl });
      const res1 = await cache.serve('moderate/v1.onnx');
      expect(res1).not.toBeNull();
      expect(res1!.status).toBe(200);
      expect(res1!.headers.get('x-shippie-hub-cache')).toBe('miss');
      expect(new Uint8Array(await res1!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));

      const res2 = await cache.serve('moderate/v1.onnx');
      expect(res2!.status).toBe(200);
      expect(res2!.headers.get('x-shippie-hub-cache')).toBe('hit');
      expect(upstreamCalls).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('upstream failure surfaces 502', async () => {
    const root = tmp('fail');
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    try {
      const cache = new ModelCache({ cacheRoot: root, fetchImpl });
      const res = await cache.serve('something.onnx');
      expect(res!.status).toBe(502);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('refuses unsafe path', async () => {
    const cache = new ModelCache({ cacheRoot: tmp('unsafe'), fetchImpl: fetch });
    expect(await cache.serve('../etc/passwd')).toBeNull();
  });
});
