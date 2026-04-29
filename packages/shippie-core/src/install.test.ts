import { describe, expect, test } from 'bun:test';
import { buildShippiePackage, createShippiePackageArchive } from '@shippie/app-package-builder';
import { SHIPPIE_PERMISSIONS_SCHEMA } from '@shippie/app-package-contract';
import { createMirrorCollection, normalizeInstallTarget, preparePackageInstall } from './install.ts';

describe('@shippie/core package install', () => {
  test('verifies an archive and derives a receipt plus collection entry', async () => {
    const archive = await fixtureArchive();
    const prepared = await preparePackageInstall({
      archiveBytes: archive,
      source: 'hub',
      installedAt: '2026-04-28T00:00:00.000Z',
    });

    expect(prepared.package.manifest.slug).toBe('quiz');
    expect(prepared.entry.packageHash).toBe(prepared.package.packageHash);
    expect(prepared.entry.packageUrl).toBe(`./packages/${prepared.package.packageHash}.shippie`);
    expect(prepared.receipt.source).toBe('hub');
    expect(prepared.receipt.version).toBe('7');
  });

  test('normalizes hub and directory targets', () => {
    expect(normalizeInstallTarget('hub.local')).toEqual({ kind: 'hub', url: 'http://hub.local' });
    expect(normalizeInstallTarget('http://school.local:8787/')).toEqual({
      kind: 'hub',
      url: 'http://school.local:8787',
    });
    expect(normalizeInstallTarget('/tmp/mirror')).toEqual({ kind: 'directory', path: '/tmp/mirror' });
  });

  test('creates a valid local mirror collection', async () => {
    const archive = await fixtureArchive();
    const prepared = await preparePackageInstall({ archiveBytes: archive });
    const collection = createMirrorCollection({
      origin: 'http://hub.local',
      entries: [prepared.entry],
      now: '2026-04-28T00:00:00.000Z',
    });

    expect(collection.schema).toBe('shippie.collection.v1');
    expect(collection.packages).toHaveLength(1);
    expect(collection.hub?.offline).toBe(true);
  });
});

async function fixtureArchive(): Promise<Uint8Array> {
  const built = await buildShippiePackage({
    app: {
      id: 'app_quiz',
      slug: 'quiz',
      name: 'Quiz',
      kind: 'local',
      entry: 'app/index.html',
      createdAt: '2026-04-28T00:00:00.000Z',
      maker: { id: 'maker_teacher', name: 'Teacher' },
      domains: { canonical: 'https://quiz.shippie.app' },
      runtime: { standalone: true, container: true, hub: true, minimumSdk: '1.0.0' },
    },
    appFiles: {
      'index.html': '<!doctype html><html><body>Quiz</body></html>',
    },
    version: {
      code: { version: '7', channel: 'classroom', packageHash: `sha256:${'0'.repeat(64)}` },
      trust: { permissionsVersion: 1, externalDomains: [] },
      data: { schemaVersion: 1 },
    },
    permissions: {
      schema: SHIPPIE_PERMISSIONS_SCHEMA,
      capabilities: {
        localDb: { enabled: true, namespace: 'quiz' },
      },
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
