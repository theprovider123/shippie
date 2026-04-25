import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHub } from './index.ts';

function freshCache(label: string): string {
  const root = join(tmpdir(), `shippie-hub-int-${label}-${Date.now()}-${Math.random()}`);
  mkdirSync(root, { recursive: true });
  return root;
}

async function withHub<T>(
  fn: (port: number, cacheRoot: string) => Promise<T>,
  cacheRoot?: string,
): Promise<T> {
  const root = cacheRoot ?? freshCache('boot');
  const hub = await startHub({
    port: 0, // ephemeral
    host: '127.0.0.1',
    cacheRoot: root,
    upstream: 'https://ai.shippie.app',
    mdnsName: 'hub-test',
    disableMdns: true,
  });
  // Pull the actual port from the underlying server. Bun.serve doesn't
  // expose it on the handle, so we rely on the env-style fallback: the
  // test calls the dashboard via 0 → resolved later. We use a fixed
  // workaround: scan a likely range. Easier: ask /api/rooms and we'll
  // accept any port discovered via the process. For Bun, server.port
  // is on the underlying object, but we abstracted the handle. We
  // re-export by reading from the global server property — easier:
  // request to http://127.0.0.1:0 is invalid; we use a known port.
  throw new Error('unreachable');
}

void withHub; // silence unused

describe('startHub', () => {
  test('serves health probe', async () => {
    const root = freshCache('health');
    // Pick a high random port to avoid clashes; reasonable for CI.
    const port = 30000 + Math.floor(Math.random() * 30000);
    const hub = await startHub({
      port,
      host: '127.0.0.1',
      cacheRoot: root,
      upstream: 'https://ai.shippie.app',
      mdnsName: 'hub-test',
      disableMdns: true,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${port}/__shippie/health`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; service: string };
      expect(json.ok).toBe(true);
      expect(json.service).toBe('shippie-hub');
    } finally {
      await hub.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('serves the dashboard at /', async () => {
    const root = freshCache('dash');
    const port = 30000 + Math.floor(Math.random() * 30000);
    const hub = await startHub({
      port,
      host: '127.0.0.1',
      cacheRoot: root,
      upstream: 'https://ai.shippie.app',
      mdnsName: 'hub-test',
      disableMdns: true,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      const html = await res.text();
      expect(html).toContain('Shippie Hub');
    } finally {
      await hub.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('serves cached app via Host: <slug>.hub.local', async () => {
    const root = freshCache('app');
    mkdirSync(join(root, 'apps', 'recipe', 'v1'), { recursive: true });
    writeFileSync(join(root, 'apps', 'recipe', 'v1', 'index.html'), '<!doctype html>RECIPE');
    const port = 30000 + Math.floor(Math.random() * 30000);
    const hub = await startHub({
      port,
      host: '127.0.0.1',
      cacheRoot: root,
      upstream: 'https://ai.shippie.app',
      mdnsName: 'hub-test',
      disableMdns: true,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${port}/index.html`, {
        headers: { host: 'recipe.hub.local' },
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('RECIPE');
    } finally {
      await hub.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('proxies model cache from upstream and disk', async () => {
    const root = freshCache('mc');
    const port = 30000 + Math.floor(Math.random() * 30000);

    // Patch global fetch only for upstream calls. Since we can't easily
    // inject into startHub from outside, the integration test fetches
    // a known cached file we pre-write. (Real upstream fetching is
    // covered in model-cache.test.ts.)
    mkdirSync(join(root, 'models', 'classify'), { recursive: true });
    writeFileSync(join(root, 'models', 'classify', 'v1.bin'), 'binary-blob-bytes');

    const hub = await startHub({
      port,
      host: '127.0.0.1',
      cacheRoot: root,
      upstream: 'https://ai.shippie.app',
      mdnsName: 'hub-test',
      disableMdns: true,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${port}/models/classify/v1.bin`);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-shippie-hub-cache')).toBe('hit');
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(new TextDecoder().decode(bytes)).toBe('binary-blob-bytes');
    } finally {
      await hub.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
