import { describe, expect, test } from 'bun:test';
import {
  AppPackageContractError,
  SHIPPIE_COLLECTION_SCHEMA,
  SHIPPIE_PACKAGE_SCHEMA,
  SHIPPIE_PERMISSIONS_SCHEMA,
  SHIPPIE_RECEIPT_SCHEMA,
  assertValidCollectionManifest,
  assertValidPackageManifest,
  assertValidPermissions,
  assertValidReceipt,
  assertCapabilityAllowed,
  canLoadInContainer,
  canShowRemixAction,
  collectionEntryToReceiptInput,
  createAppReceipt,
  createBridgeRequest,
  createBridgeResponse,
  isHttpUrl,
  isSha256Hash,
  isNetworkDomainAllowed,
  isSystemCapability,
  systemPermissions,
  systemTaskFor,
  type AppCollectionManifest,
  type AppPermissions,
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

  test('creates stamped app receipts', () => {
    const receipt = createAppReceipt({
      appId: 'app_recipe_saver',
      name: 'Recipe Saver',
      version: '1',
      packageHash: `sha256:${'1'.repeat(64)}`,
      installedAt: '2026-04-28T00:00:00.000Z',
      source: 'marketplace',
      domains: ['https://recipe-saver.shippie.app'],
      kind: 'connected',
      permissions: { localDb: true },
    });

    expect(receipt.schema).toBe(SHIPPIE_RECEIPT_SCHEMA);
    expect(receipt.installedAt).toBe('2026-04-28T00:00:00.000Z');
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

  test('validates collection manifests for Hub and local installs', () => {
    const collection = {
      schema: SHIPPIE_COLLECTION_SCHEMA,
      id: 'collection_classroom_tools',
      slug: 'classroom-tools',
      name: 'Classroom Tools',
      kind: 'hub',
      createdAt: '2026-04-28T00:00:00.000Z',
      updatedAt: '2026-04-28T00:00:00.000Z',
      publisher: { id: 'hub_school', name: 'School Hub' },
      sourceUrl: 'http://hub.local/collections/classroom-tools.json',
      hub: { origin: 'http://hub.local', offline: true },
      packages: [
        {
          appId: 'app_quiz',
          slug: 'quiz',
          name: 'Quiz',
          version: '3',
          kind: 'local',
          packageHash: HASH,
          packageUrl: 'http://hub.local/packages/quiz.shippie',
          manifestUrl: 'http://hub.local/packages/quiz/manifest.json',
          domains: ['http://hub.local/apps/quiz'],
        },
      ],
    } as const;

    expect(() => assertValidCollectionManifest(collection as unknown as AppCollectionManifest)).not.toThrow();
    expect(isHttpUrl('http://127.0.0.1:4101/api/collections/official')).toBe(true);
    expect(collectionEntryToReceiptInput(collection.packages[0], 'hub')).toEqual({
      appId: 'app_quiz',
      name: 'Quiz',
      version: '3',
      packageHash: HASH,
      source: 'hub',
      domains: ['http://hub.local/apps/quiz'],
      kind: 'local',
      permissions: {},
    });
  });

  test('collection manifests reject unverified package locations', () => {
    expect(() =>
      assertValidCollectionManifest({
        schema: SHIPPIE_COLLECTION_SCHEMA,
        id: 'collection_bad',
        slug: 'bad',
        name: 'Bad',
        kind: 'community',
        createdAt: '2026-04-28T00:00:00.000Z',
        updatedAt: '2026-04-28T00:00:00.000Z',
        publisher: { id: 'maker_bad', name: 'Bad Maker' },
        packages: [
          {
            appId: 'app_bad',
            slug: 'bad',
            name: 'Bad',
            version: '1',
            kind: 'cloud',
            packageHash: HASH,
            packageUrl: 'ftp://example.com/bad.shippie',
          },
        ],
      }),
    ).toThrow(AppPackageContractError);
  });

  // ----------------------------------------------------------------------
  // Phase A3 — system-tier permissions
  // ----------------------------------------------------------------------

  test('per-app permissions cannot reach system.* capabilities', () => {
    const perAppPermissions: AppPermissions = {
      schema: SHIPPIE_PERMISSIONS_SCHEMA,
      capabilities: {
        localDb: { enabled: true, namespace: 'recipe' },
        feedback: { enabled: true },
      },
    };
    expect(() => assertCapabilityAllowed(perAppPermissions, 'system.crossDb.query')).toThrow(
      /Capability is not granted/,
    );
    expect(() => assertCapabilityAllowed(perAppPermissions, 'system.notify')).toThrow(
      /Capability is not granted/,
    );
    expect(() => assertCapabilityAllowed(perAppPermissions, 'system.openApp')).toThrow(
      /Capability is not granted/,
    );
  });

  test('system permissions can reach matching system tasks', () => {
    const sys = systemPermissions(['cross_db_query', 'notify']);
    expect(() => assertCapabilityAllowed(sys, 'system.crossDb.query')).not.toThrow();
    expect(() => assertCapabilityAllowed(sys, 'system.notify')).not.toThrow();
  });

  test('system permissions with subset of tasks rejects un-granted ones', () => {
    const sys = systemPermissions(['notify']);
    expect(() => assertCapabilityAllowed(sys, 'system.notify')).not.toThrow();
    expect(() => assertCapabilityAllowed(sys, 'system.crossDb.query')).toThrow(
      /Capability is not granted/,
    );
    expect(() => assertCapabilityAllowed(sys, 'system.openApp')).toThrow(
      /Capability is not granted/,
    );
  });

  test('system permissions cannot escalate to per-app capabilities', () => {
    // System host shouldn't accidentally have db.insert permission unless
    // explicitly granted; tasks list and per-app capabilities are orthogonal.
    const sys = systemPermissions(['cross_db_query']);
    expect(() => assertCapabilityAllowed(sys, 'db.insert')).toThrow(/Capability is not granted/);
    expect(() => assertCapabilityAllowed(sys, 'feedback.open')).toThrow(/Capability is not granted/);
  });

  test('assertValidPermissions rejects published manifests declaring system perms', () => {
    expect(() =>
      assertValidPermissions({
        schema: SHIPPIE_PERMISSIONS_SCHEMA,
        capabilities: {
          localDb: { enabled: true, namespace: 'recipe' },
          system: { tasks: ['cross_db_query'] },
        },
      }),
    ).toThrow(/Apps cannot declare system-tier permissions/);
  });

  test('isSystemCapability + systemTaskFor identify system entries', () => {
    expect(isSystemCapability('system.crossDb.query')).toBe(true);
    expect(isSystemCapability('system.notify')).toBe(true);
    expect(isSystemCapability('db.insert')).toBe(false);
    expect(isSystemCapability('intent.consume')).toBe(false);

    expect(systemTaskFor('system.crossDb.query')).toBe('cross_db_query');
    expect(systemTaskFor('system.notify')).toBe('notify');
    expect(systemTaskFor('system.openApp')).toBe('open_app');
    expect(systemTaskFor('db.insert')).toBeUndefined();
  });

  test('systemPermissions factory builds a valid permissions object', () => {
    const sys = systemPermissions(['cross_db_query']);
    expect(sys.schema).toBe(SHIPPIE_PERMISSIONS_SCHEMA);
    expect(sys.capabilities.system?.tasks).toEqual(['cross_db_query']);
    // System hosts skip per-app validation by design — the ONLY caller is
    // the container itself, never a deploy pipeline. Smoke-check the shape.
    expect(sys.capabilities.localDb).toBeUndefined();
  });

  test('A5 — data.openPanel is universal: any app can call it without an explicit grant', () => {
    const minimal: AppPermissions = {
      schema: SHIPPIE_PERMISSIONS_SCHEMA,
      capabilities: {},
    };
    expect(() => assertCapabilityAllowed(minimal, 'data.openPanel')).not.toThrow();
  });

  test('P1A — apps.list and agent.insights are universal at the contract level', () => {
    const minimal: AppPermissions = {
      schema: SHIPPIE_PERMISSIONS_SCHEMA,
      capabilities: {},
    };
    expect(() => assertCapabilityAllowed(minimal, 'apps.list')).not.toThrow();
    expect(() => assertCapabilityAllowed(minimal, 'agent.insights')).not.toThrow();
  });

  test('B4 — feel.texture is universal: any app can fire built-in presets', () => {
    const minimal: AppPermissions = {
      schema: SHIPPIE_PERMISSIONS_SCHEMA,
      capabilities: {},
    };
    expect(() => assertCapabilityAllowed(minimal, 'feel.texture')).not.toThrow();
  });

  test('A5 — data.openPanel cannot be confused with system.* capabilities', () => {
    const minimal: AppPermissions = {
      schema: SHIPPIE_PERMISSIONS_SCHEMA,
      capabilities: {},
    };
    // Open Your Data → fine.
    expect(() => assertCapabilityAllowed(minimal, 'data.openPanel')).not.toThrow();
    // System.* still blocked, even on the same minimal-capabilities app.
    expect(() => assertCapabilityAllowed(minimal, 'system.crossDb.query')).toThrow();
  });
});
