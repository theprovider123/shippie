import { describe, expect, test } from 'bun:test';
import {
  SHIPPIE_PERMISSIONS_SCHEMA,
  type AppPermissions,
  type AppVersionRecord,
  type SourceMetadata,
  type TrustReport,
} from '@shippie/app-package-contract';
import {
  buildShippiePackage,
  createShippiePackageArchive,
  readShippiePackageArchive,
  stableJson,
} from './index.ts';
import { buildShippiePackageFromDirectory } from './filesystem.ts';

const version: AppVersionRecord = {
  code: {
    version: '1.0.0',
    channel: 'stable',
    sourceCommit: 'abc123',
    packageHash: `sha256:${'1'.repeat(64)}`,
  },
  trust: {
    permissionsVersion: 1,
    externalDomains: ['world.openfoodfacts.org'],
  },
  data: {
    schemaVersion: 1,
  },
};

const permissions: AppPermissions = {
  schema: SHIPPIE_PERMISSIONS_SCHEMA,
  capabilities: {
    localDb: { enabled: true, namespace: 'recipe-saver' },
    network: {
      allowedDomains: ['world.openfoodfacts.org'],
      declaredPurpose: {
        'world.openfoodfacts.org': 'Barcode ingredient lookup',
      },
    },
  },
};

const source: SourceMetadata = {
  repo: 'https://github.com/example/recipe-saver',
  license: 'MIT',
  sourceAvailable: true,
  remix: {
    allowed: true,
    commercialUse: true,
    attributionRequired: true,
  },
  lineage: {
    template: 'shippie-template-local-recipe',
  },
};

const trustReport: TrustReport = {
  kind: {
    detected: 'connected',
    status: 'verifying',
    reasons: ['fetches world.openfoodfacts.org'],
  },
  security: {
    stage: 'maker-facing',
    score: null,
    findings: [],
  },
  privacy: {
    grade: null,
    externalDomains: [
      {
        domain: 'world.openfoodfacts.org',
        purpose: 'Barcode ingredient lookup',
        personalData: false,
      },
    ],
  },
  containerEligibility: 'curated',
};

function buildFixture() {
  return buildShippiePackage({
    app: {
      id: 'app_recipe_saver',
      slug: 'recipe-saver',
      name: 'Recipe Saver',
      description: 'Save recipes locally.',
      kind: 'connected',
      entry: 'app/index.html',
      createdAt: '2026-04-27T12:00:00Z',
      maker: { id: 'maker_devante', name: 'Devante' },
      domains: { canonical: 'https://recipe-saver.shippie.app' },
      runtime: { standalone: true, container: true, hub: true, minimumSdk: '1.0.0' },
    },
    appFiles: {
      'index.html': '<!doctype html><title>Recipe Saver</title>',
      'assets/app.js': 'console.log("recipe")',
    },
    version,
    permissions,
    source,
    trustReport,
  });
}

describe('@shippie/app-package-builder', () => {
  test('builds deterministic package files', async () => {
    const first = await buildFixture();
    const second = await buildFixture();

    expect(first.packageHash).toBe(second.packageHash);
    expect(first.packageHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.files.has('manifest.json')).toBe(true);
    expect(first.files.has('app/index.html')).toBe(true);
    expect(first.files.has('permissions.json')).toBe(true);
    expect(first.manifest.packageHash).toBe(first.packageHash);

    const versionFile = JSON.parse(new TextDecoder().decode(first.files.get('version.json')));
    expect(versionFile.code.packageHash).toBe(first.packageHash);
  });

  test('package hash changes when app bytes change', async () => {
    const first = await buildFixture();
    const changed = await buildShippiePackage({
      app: first.manifest,
      appFiles: {
        'index.html': '<!doctype html><title>Recipe Saver v2</title>',
      },
      version,
      permissions,
      source,
      trustReport,
    });

    expect(changed.packageHash).not.toBe(first.packageHash);
  });

  test('creates and verifies a portable .shippie archive envelope', async () => {
    const built = await buildFixture();
    const archiveBytes = await createShippiePackageArchive(built);
    const archiveText = new TextDecoder().decode(archiveBytes);

    expect(archiveText).toContain('"schema":"shippie.archive.v1"');
    expect(archiveText).toContain('"app/index.html"');

    const unpacked = await readShippiePackageArchive(archiveBytes);
    expect(unpacked.packageHash).toBe(built.packageHash);
    expect(unpacked.manifest.slug).toBe('recipe-saver');
    expect(new TextDecoder().decode(unpacked.files.get('app/index.html'))).toContain('Recipe Saver');
  });

  test('rejects a tampered .shippie archive envelope', async () => {
    const built = await buildFixture();
    const archive = JSON.parse(new TextDecoder().decode(await createShippiePackageArchive(built))) as {
      files: Array<{ path: string; bytesBase64: string }>;
    };
    const indexFile = archive.files.find((file) => file.path === 'app/index.html');
    expect(indexFile).toBeDefined();
    indexFile!.bytesBase64 = btoa('<!doctype html><title>Tampered</title>');

    await expect(readShippiePackageArchive(JSON.stringify(archive))).rejects.toThrow(/hash/i);
  });

  test('rejects reserved and traversal paths', async () => {
    const manifest = (await buildFixture()).manifest;
    await expect(
      buildShippiePackage({
        app: manifest,
        appFiles: {
          '../index.html': '<!doctype html>',
        },
        version,
        permissions,
        source,
        trustReport,
      }),
    ).rejects.toThrow(/Invalid app file path/);

    await expect(
      buildShippiePackage({
        app: manifest,
        appFiles: {
          '__shippie/sdk.js': 'x',
          'index.html': '<!doctype html>',
        },
        version,
        permissions,
        source,
        trustReport,
      }),
    ).rejects.toThrow(/reserved __shippie/);
  });

  test('stableJson sorts object keys recursively', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  test('packages a real showcase app project directory without build noise', async () => {
    const showcaseDir = new URL('../../../apps/showcase-recipe', import.meta.url).pathname;
    const built = await buildShippiePackageFromDirectory({
      app: {
        id: 'app_showcase_recipe',
        slug: 'showcase-recipe',
        name: 'Showcase Recipe',
        description: 'Recipe showcase packaged from project files.',
        kind: 'connected',
        entry: 'app/index.html',
        createdAt: '2026-04-27T12:00:00Z',
        maker: { id: 'maker_shippie', name: 'Shippie' },
        domains: { canonical: 'https://showcase-recipe.shippie.app' },
        runtime: { standalone: true, container: true, hub: true, minimumSdk: '1.0.0' },
      },
      directory: showcaseDir,
      version,
      permissions,
      source,
      trustReport,
    });

    expect(built.files.has('app/index.html')).toBe(true);
    expect(built.files.has('app/src/App.tsx')).toBe(true);
    expect(built.files.has('app/.turbo/turbo-build.log')).toBe(false);
    expect(built.files.has('app/dist/index.html')).toBe(false);
    expect(built.manifest.packageHash).toBe(built.packageHash);
  });
});
