import { describe, expect, test } from 'bun:test';
import {
  AppPackageContractError,
  SHIPPIE_PACKAGE_SCHEMA,
  SHIPPIE_PERMISSIONS_SCHEMA,
  SHIPPIE_RECEIPT_SCHEMA,
  assertValidPackageManifest,
  assertValidPermissions,
  assertValidReceipt,
  assertCapabilityAllowed,
  canLoadInContainer,
  canShowRemixAction,
  createBridgeRequest,
  createBridgeResponse,
  isSha256Hash,
  isNetworkDomainAllowed,
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

  test('bridge helpers stamp the protocol', () => {
    const request = createBridgeRequest({
      id: 'req_1',
      appId: 'app_recipe_saver',
      capability: 'db.insert',
      method: 'insert',
      payload: { table: 'recipes' },
    });
    const response = createBridgeResponse({
      id: request.id,
      ok: true,
      result: { id: 'recipe_1' },
    });

    expect(request.protocol).toBe('shippie.bridge.v1');
    expect(response.protocol).toBe('shippie.bridge.v1');
  });

  test('capability checks enforce permissions', () => {
    const permissions = {
      schema: SHIPPIE_PERMISSIONS_SCHEMA,
      capabilities: {
        localDb: { enabled: true, namespace: 'recipe-saver' },
        network: {
          allowedDomains: ['world.openfoodfacts.org'],
          declaredPurpose: {
            'world.openfoodfacts.org': 'Barcode ingredient lookup',
          },
        },
        crossAppIntents: {
          provides: ['shopping-list.write'],
          consumes: ['budget-limit.read'],
        },
      },
    } as const;

    expect(() => assertCapabilityAllowed(permissions, 'db.insert')).not.toThrow();
    expect(() =>
      assertCapabilityAllowed(permissions, 'network.fetch', {
        domain: 'https://world.openfoodfacts.org/api/v2/search',
      }),
    ).not.toThrow();
    expect(() =>
      assertCapabilityAllowed(permissions, 'intent.provide', {
        intent: 'shopping-list.write',
      }),
    ).not.toThrow();
    expect(() => assertCapabilityAllowed(permissions, 'files.write')).toThrow(/Capability is not granted/);
    expect(() =>
      assertCapabilityAllowed(permissions, 'network.fetch', {
        domain: 'analytics.example.com',
      }),
    ).toThrow(/Capability is not granted/);
  });

  test('network domain checks normalize URLs but reject paths as hostnames', () => {
    const permissions = {
      schema: SHIPPIE_PERMISSIONS_SCHEMA,
      capabilities: {
        network: {
          allowedDomains: ['world.openfoodfacts.org'],
          declaredPurpose: {
            'world.openfoodfacts.org': 'Barcode ingredient lookup',
          },
        },
      },
    } as const;

    expect(isNetworkDomainAllowed(permissions, 'https://world.openfoodfacts.org/api')).toBe(true);
    expect(isNetworkDomainAllowed(permissions, 'world.openfoodfacts.org')).toBe(true);
    expect(isNetworkDomainAllowed(permissions, 'world.openfoodfacts.org/api')).toBe(false);
  });
});
