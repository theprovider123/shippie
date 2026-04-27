import { describe, expect, test } from 'bun:test';
import {
  AppPackageContractError,
  SHIPPIE_PACKAGE_SCHEMA,
  SHIPPIE_PERMISSIONS_SCHEMA,
  SHIPPIE_RECEIPT_SCHEMA,
  assertValidPackageManifest,
  assertValidPermissions,
  assertValidReceipt,
  canLoadInContainer,
  canShowRemixAction,
  isSha256Hash,
} from './index.ts';

const HASH = `sha256:${'a'.repeat(64)}`;

describe('@shippie/app-package-contract', () => {
  test('validates package manifests', () => {
    expect(() =>
      assertValidPackageManifest({
        schema: SHIPPIE_PACKAGE_SCHEMA,
        id: 'app_recipe_saver',
        slug: 'recipe-saver',
        name: 'Recipe Saver',
        kind: 'connected',
        entry: 'app/index.html',
        packageHash: HASH,
        createdAt: '2026-04-27T12:00:00Z',
        maker: { id: 'maker_devante', name: 'Devante' },
        domains: { canonical: 'https://recipe-saver.shippie.app' },
        runtime: { standalone: true, container: true, hub: true, minimumSdk: '1.0.0' },
      }),
    ).not.toThrow();
  });

  test('rejects invalid package entries and hashes', () => {
    expect(isSha256Hash(HASH)).toBe(true);
    expect(isSha256Hash('sha256:nope')).toBe(false);

    expect(() =>
      assertValidPackageManifest({
        schema: SHIPPIE_PACKAGE_SCHEMA,
        id: 'app_recipe_saver',
        slug: 'recipe-saver',
        name: 'Recipe Saver',
        kind: 'local',
        entry: '../index.html',
        packageHash: 'sha256:nope',
        createdAt: '2026-04-27T12:00:00Z',
        maker: { id: 'maker_devante', name: 'Devante' },
        domains: { canonical: 'https://recipe-saver.shippie.app' },
        runtime: { standalone: true, container: false, hub: true, minimumSdk: '1.0.0' },
      }),
    ).toThrow(AppPackageContractError);
  });

  test('network permissions require declared purposes', () => {
    expect(() =>
      assertValidPermissions({
        schema: SHIPPIE_PERMISSIONS_SCHEMA,
        capabilities: {
          network: {
            allowedDomains: ['world.openfoodfacts.org'],
            declaredPurpose: {
              'world.openfoodfacts.org': 'Barcode ingredient lookup',
            },
          },
        },
      }),
    ).not.toThrow();

    expect(() =>
      assertValidPermissions({
        schema: SHIPPIE_PERMISSIONS_SCHEMA,
        capabilities: {
          network: {
            allowedDomains: ['https://world.openfoodfacts.org'],
            declaredPurpose: {},
          },
        },
      }),
    ).toThrow(AppPackageContractError);
  });

  test('receipts validate portable install provenance', () => {
    expect(() =>
      assertValidReceipt({
        schema: SHIPPIE_RECEIPT_SCHEMA,
        appId: 'app_recipe_saver',
        name: 'Recipe Saver',
        version: '1.8.0',
        packageHash: HASH,
        installedAt: '2026-04-27T12:00:00Z',
        source: 'marketplace',
        domains: ['https://recipe-saver.shippie.app'],
        kind: 'connected',
        permissions: { localDb: true },
      }),
    ).not.toThrow();
  });

  test('remix and container gates are explicit', () => {
    expect(
      canShowRemixAction({
        repo: 'https://github.com/example/recipe-saver',
        license: 'MIT',
        sourceAvailable: true,
        remix: { allowed: true, commercialUse: true, attributionRequired: true },
        lineage: {},
      }),
    ).toBe(true);

    expect(canLoadInContainer({ containerEligibility: 'curated' })).toBe(true);
    expect(canLoadInContainer({ containerEligibility: 'standalone_only' })).toBe(false);
    expect(canLoadInContainer({ containerEligibility: 'blocked' })).toBe(false);
  });
});
