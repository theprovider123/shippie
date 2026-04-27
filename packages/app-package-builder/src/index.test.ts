import { describe, expect, test } from 'bun:test';
import {
  SHIPPIE_PERMISSIONS_SCHEMA,
  type AppPermissions,
  type AppVersionRecord,
  type SourceMetadata,
  type TrustReport,
} from '@shippie/app-package-contract';
import { buildShippiePackage, stableJson } from './index.ts';

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
  test('builds deterministic package files', () => {
    const first = buildFixture();
    const second = buildFixture();

    expect(first.packageHash).toBe(second.packageHash);
    expect(first.packageHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.files.has('manifest.json')).toBe(true);
    expect(first.files.has('app/index.html')).toBe(true);
    expect(first.files.has('permissions.json')).toBe(true);
    expect(first.manifest.packageHash).toBe(first.packageHash);
  });

  test('package hash changes when app bytes change', () => {
    const first = buildFixture();
    const changed = buildShippiePackage({
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

  test('rejects reserved and traversal paths', () => {
    expect(() =>
      buildShippiePackage({
        app: buildFixture().manifest,
        appFiles: {
          '../index.html': '<!doctype html>',
        },
        version,
        permissions,
        source,
        trustReport,
      }),
    ).toThrow(/Invalid app file path/);

    expect(() =>
      buildShippiePackage({
        app: buildFixture().manifest,
        appFiles: {
          '__shippie/sdk.js': 'x',
          'index.html': '<!doctype html>',
        },
        version,
        permissions,
        source,
        trustReport,
      }),
    ).toThrow(/reserved __shippie/);
  });

  test('stableJson sorts object keys recursively', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
});
