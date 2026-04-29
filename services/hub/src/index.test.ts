import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildShippiePackage, createShippiePackageArchive } from '@shippie/app-package-builder';
import { SHIPPIE_PERMISSIONS_SCHEMA } from '@shippie/app-package-contract';
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
  const port = await getFreePort();
  const hub = await startHub({
    port,
    host: '127.0.0.1',
    cacheRoot: root,
    upstream: 'https://ai.shippie.app',
    mdnsName: 'hub-test',
    disableMdns: true,
  });
  try {
    return await fn(hub.config.port, root);
  } finally {
    await hub.stop();
    rmSync(root, { recursive: true, force: true });
  }
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((err) => {
        if (err) reject(err);
        else if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('Could not allocate a test port.'));
      });
    });
  });
}

describe('startHub', () => {
  test('serves health probe', async () => {
    await withHub(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/__shippie/health`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; service: string };
      expect(json.ok).toBe(true);
      expect(json.service).toBe('shippie-hub');
    }, freshCache('health'));
  });

  test('serves the dashboard at /', async () => {
    await withHub(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      const html = await res.text();
      expect(html).toContain('Shippie Hub');
    }, freshCache('dash'));
  });

  test('serves cached app via Host: <slug>.hub.local', async () => {
    const root = freshCache('app');
    mkdirSync(join(root, 'apps', 'recipe', 'v1'), { recursive: true });
    writeFileSync(join(root, 'apps', 'recipe', 'v1', 'index.html'), '<!doctype html>RECIPE');
    await withHub(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/index.html`, {
        headers: { host: 'recipe.hub.local' },
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('RECIPE');
    }, root);
  });

  test('proxies model cache from upstream and disk', async () => {
    const root = freshCache('mc');

    // Patch global fetch only for upstream calls. Since we can't easily
    // inject into startHub from outside, the integration test fetches
    // a known cached file we pre-write. (Real upstream fetching is
    // covered in model-cache.test.ts.)
    mkdirSync(join(root, 'models', 'classify'), { recursive: true });
    writeFileSync(join(root, 'models', 'classify', 'v1.bin'), 'binary-blob-bytes');

    await withHub(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/models/classify/v1.bin`);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-shippie-hub-cache')).toBe('hit');
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(new TextDecoder().decode(bytes)).toBe('binary-blob-bytes');
    }, root);
  });

  test('ingests a .shippie package into the local app cache and collection', async () => {
    const root = freshCache('package');
    const archive = await fixtureArchive();
    await withHub(async (port) => {
      const post = await fetch(`http://127.0.0.1:${port}/api/packages`, {
        method: 'POST',
        headers: { 'content-type': 'application/vnd.shippie.package+json' },
        body: archive,
      });
      expect(post.status).toBe(200);
      const installed = (await post.json()) as { packageHash: string; slug: string };
      expect(installed.slug).toBe('hub-quiz');

      const app = await fetch(`http://127.0.0.1:${port}/index.html`, {
        headers: { host: 'hub-quiz.hub.local' },
      });
      expect(app.status).toBe(200);
      expect(await app.text()).toContain('Hub Quiz');

      const collection = await fetch(`http://127.0.0.1:${port}/collections/local-mirror.json`);
      expect(collection.status).toBe(200);
      expect(await collection.text()).toContain(installed.packageHash);

      const pkg = await fetch(`http://127.0.0.1:${port}/packages/${installed.packageHash}.shippie`);
      expect(pkg.status).toBe(200);
      expect(pkg.headers.get('content-type')).toContain('application/vnd.shippie.package+json');
    }, root);
  });
});

async function fixtureArchive(): Promise<Uint8Array> {
  const built = await buildShippiePackage({
    app: {
      id: 'app_hub_quiz',
      slug: 'hub-quiz',
      name: 'Hub Quiz',
      kind: 'local',
      entry: 'app/index.html',
      createdAt: '2026-04-28T00:00:00.000Z',
      maker: { id: 'maker_teacher', name: 'Teacher' },
      domains: { canonical: 'https://hub-quiz.shippie.app' },
      runtime: { standalone: true, container: true, hub: true, minimumSdk: '1.0.0' },
    },
    appFiles: {
      'index.html': '<!doctype html><html><body><h1>Hub Quiz</h1></body></html>',
    },
    version: {
      code: { version: '4', channel: 'classroom', packageHash: `sha256:${'0'.repeat(64)}` },
      trust: { permissionsVersion: 1, externalDomains: [] },
      data: { schemaVersion: 1 },
    },
    permissions: {
      schema: SHIPPIE_PERMISSIONS_SCHEMA,
      capabilities: { localDb: { enabled: true, namespace: 'hub-quiz' } },
    },
    source: {
      license: 'MIT',
      sourceAvailable: true,
      remix: { allowed: true, commercialUse: true, attributionRequired: true },
      lineage: {},
    },
    trustReport: {
      kind: { detected: 'local', status: 'confirmed', reasons: [] },
      security: { stage: 'public', score: 99, findings: [] },
      privacy: { grade: 'A+', externalDomains: [] },
      containerEligibility: 'curated',
    },
    deployReport: { ok: true },
    migrations: { operations: [] },
  });
  return createShippiePackageArchive(built);
}
