import { describe, expect, test } from 'vitest';
import { buildShippiePackage, createShippiePackageArchive, readShippiePackageArchive } from '@shippie/app-package-builder';
import {
  SHIPPIE_PERMISSIONS_SCHEMA,
  type AppPermissions,
  type SourceMetadata,
  type TrustReport,
} from '@shippie/app-package-contract';
import { ContainerBridgeClient, ContainerBridgeHost, createMemoryBridgeTransports } from '@shippie/container-bridge';
import {
  createOrReusePackageFrameSource,
  markFrameBootingState,
  markFrameErrorState,
  markFrameReadyState,
  nextFrameReloadNonces,
  revokePackageFrameSource,
  type ObjectUrlApi,
} from './frame-runtime';
import { installBuiltPackage, uninstallContainerAppState } from './package-runtime';
import { buildUpdateCard, createReceiptFor, type ContainerApp } from './state';
import { grantIntent, isIntentGranted } from './intent-registry';

const permissions: AppPermissions = {
  schema: SHIPPIE_PERMISSIONS_SCHEMA,
  capabilities: {
    localDb: { enabled: true, namespace: 'toy' },
    localFiles: { enabled: true, namespace: 'toy' },
    analytics: { enabled: true, mode: 'aggregate-only' },
    feedback: { enabled: true },
  },
};

const source: SourceMetadata = {
  license: 'MIT',
  sourceAvailable: true,
  remix: { allowed: true, commercialUse: true, attributionRequired: true },
  lineage: {},
};

const trustReport: TrustReport = {
  kind: { detected: 'local', status: 'confirmed', reasons: ['test package'] },
  security: { stage: 'public', score: 99, findings: [] },
  privacy: { grade: 'A+', externalDomains: [] },
  containerEligibility: 'curated',
};

describe('container runtime contracts', () => {
  test('verified package boots as a cached iframe document and can use the bridge', async () => {
    const built = await toyPackage();
    const archive = await createShippiePackageArchive(built);
    const verified = await readShippiePackageArchive(archive);
    const installed = installBuiltPackage(verified);
    const objectUrls = createObjectUrlRecorder();

    const frameUrl = createOrReusePackageFrameSource(
      installed.app,
      installed.packageFiles,
      new Map(),
      objectUrls.api,
    );

    expect(frameUrl).toMatch(/^blob:test\//);
    const entryHtml = await objectUrls.blobs.get(frameUrl!)?.text();
    expect(entryHtml).toContain('blob:test/');
    expect(entryHtml).toContain('data-ready="yes"');

    const transports = createMemoryBridgeTransports();
    const host = new ContainerBridgeHost({
      appId: installed.app.id,
      permissions: installed.app.permissions,
      transport: transports.host,
      handlers: {
        'db.insert': ({ payload }) => ({ id: 'row_1', payload }),
      },
    });
    const client = new ContainerBridgeClient({
      appId: installed.app.id,
      transport: transports.client,
    });

    await expect(client.call('db.insert', 'insert', { table: 'items' })).resolves.toMatchObject({
      id: 'row_1',
    });

    client.dispose();
    host.dispose();
  });

  test('cached package opens without fetching from a collection or package URL', async () => {
    const built = await toyPackage();
    const installed = installBuiltPackage(built);
    const objectUrls = createObjectUrlRecorder();
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (() => {
      fetchCalled = true;
      throw new Error('offline');
    }) as typeof fetch;

    try {
      const frameUrl = createOrReusePackageFrameSource(
        installed.app,
        installed.packageFiles,
        new Map(),
        objectUrls.api,
      );
      expect(frameUrl).toMatch(/^blob:test\//);
      expect(fetchCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('bad app recovery state can surface an error and remount cleanly', () => {
    let states = {};
    let nonces = {};

    states = markFrameBootingState(states, 'app_toy');
    expect(states).toEqual({ app_toy: { status: 'booting' } });

    states = markFrameErrorState(states, 'app_toy', 'This app took too long to start.');
    expect(states).toEqual({
      app_toy: { status: 'error', message: 'This app took too long to start.' },
    });

    states = markFrameReadyState(markFrameBootingState(states, 'app_toy'), 'app_toy');
    nonces = nextFrameReloadNonces(nonces, 'app_toy');

    expect(states).toEqual({ app_toy: { status: 'ready' } });
    expect(nonces).toEqual({ app_toy: 1 });
  });

  test('uninstall removes receipt, cached files, local rows, open frame, and intent grants', async () => {
    const installed = installBuiltPackage(await toyPackage());
    const receipt = createReceiptFor(installed.app);
    let grants = {};
    grants = grantIntent(grants, 'app_consumer', 'toy-intent');
    grants = grantIntent(grants, installed.app.id, 'provider-intent');

    const next = uninstallContainerAppState(
      {
        importedApps: [installed.app],
        openAppIds: [installed.app.id],
        receiptsByApp: { [installed.app.id]: receipt },
        rowsByApp: { [installed.app.id]: [{ id: 'row_1', table: 'items', payload: {}, createdAt: 'now' }] },
        packageFilesByApp: { [installed.app.id]: installed.packageFiles },
        intentGrants: grants,
        transferGrants: {},
        activeAppId: installed.app.id,
      },
      installed.app.id,
    );

    expect(next.importedApps).toEqual([]);
    expect(next.openAppIds).toEqual([]);
    expect(next.receiptsByApp[installed.app.id]).toBeUndefined();
    expect(next.rowsByApp[installed.app.id]).toBeUndefined();
    expect(next.packageFilesByApp[installed.app.id]).toBeUndefined();
    expect(isIntentGranted(next.intentGrants, 'app_consumer', 'toy-intent')).toBe(true);
    expect(isIntentGranted(next.intentGrants, installed.app.id, 'provider-intent')).toBe(false);
    expect(next.activeAppId).toBeNull();
  });

  test('update card exposes version, permission, domain, and trust diffs', () => {
    const oldApp = appWithNetwork(['api.old.example']);
    const receipt = createReceiptFor(oldApp);
    const nextApp: ContainerApp = {
      ...oldApp,
      version: '2',
      packageHash: `sha256:${'2'.repeat(64)}`,
      permissions: {
        ...oldApp.permissions,
        capabilities: {
          ...oldApp.permissions.capabilities,
          network: {
            allowedDomains: ['api.new.example'],
            declaredPurpose: { 'api.new.example': 'Fresh content' },
          },
        },
      },
      trust: {
        containerEligibility: 'curated',
        security: { stage: 'public', score: 96, findings: [] },
        privacy: {
          grade: 'A',
          externalDomains: [{ domain: 'api.new.example', purpose: 'Fresh content', personalData: false }],
        },
      },
    };

    const card = buildUpdateCard(nextApp, receipt);

    expect(card).toMatchObject({
      versionChanged: true,
      packageHashChanged: true,
      permissionsChanged: true,
      addedNetworkDomains: ['api.new.example'],
      removedNetworkDomains: ['api.old.example'],
      latestSecurityScore: 96,
      latestPrivacyGrade: 'A',
      containerEligibility: 'curated',
    });
  });

  test('revoking a package frame source releases every Blob URL', async () => {
    const installed = installBuiltPackage(await toyPackage());
    const objectUrls = createObjectUrlRecorder();
    const cache = new Map();

    const frameUrl = createOrReusePackageFrameSource(installed.app, installed.packageFiles, cache, objectUrls.api);
    expect(frameUrl).toBeTruthy();
    expect(objectUrls.revoked).toEqual([]);

    revokePackageFrameSource(installed.app.id, cache, objectUrls.api);

    expect(cache.size).toBe(0);
    expect(objectUrls.revoked).toContain(frameUrl);
    expect(objectUrls.revoked.length).toBeGreaterThan(1);
  });
});

async function toyPackage() {
  return buildShippiePackage({
    app: {
      id: 'app_toy',
      slug: 'toy',
      name: 'Toy App',
      description: 'Runtime contract fixture.',
      kind: 'local',
      entry: 'app/index.html',
      createdAt: '2026-04-29T00:00:00.000Z',
      maker: { id: 'maker_1', name: 'Maker One' },
      domains: { canonical: 'https://toy.shippie.app' },
      runtime: { standalone: true, container: true, hub: true, minimumSdk: '1.0.0' },
    },
    appFiles: new Map<string, string | Uint8Array>([
      ['index.html', '<!doctype html><link rel="stylesheet" href="./style.css"><main data-ready="yes"><img src="./icon.png"></main><script src="./app.js"></script>'],
      ['style.css', 'main { background-image: url("./icon.png"); }'],
      ['app.js', 'parent.postMessage({ appId: "app_toy", capability: "app.info", method: "ready" }, "*");'],
      ['icon.png', new Uint8Array([1, 2, 3])],
    ]),
    version: {
      code: { version: '1', channel: 'stable', packageHash: `sha256:${'0'.repeat(64)}` },
      trust: { permissionsVersion: 1, externalDomains: [] },
      data: { schemaVersion: 1 },
    },
    permissions,
    source,
    trustReport,
  });
}

function appWithNetwork(domains: string[]): ContainerApp {
  return {
    id: 'app_network',
    slug: 'network',
    name: 'Network App',
    shortName: 'Network',
    description: '',
    appKind: 'connected',
    entry: 'app/index.html',
    labelKind: 'Connected',
    icon: 'NA',
    accent: '#4E7C9A',
    version: '1',
    packageHash: `sha256:${'1'.repeat(64)}`,
    standaloneUrl: 'https://network.shippie.app',
    permissions: {
      schema: SHIPPIE_PERMISSIONS_SCHEMA,
      capabilities: {
        localDb: { enabled: true, namespace: 'network' },
        network: {
          allowedDomains: domains,
          declaredPurpose: Object.fromEntries(domains.map((domain) => [domain, 'Fixture'])),
        },
      },
    },
  };
}

function createObjectUrlRecorder(): {
  api: ObjectUrlApi;
  blobs: Map<string, Blob>;
  revoked: string[];
} {
  const blobs = new Map<string, Blob>();
  const revoked: string[] = [];
  let seq = 0;
  return {
    blobs,
    revoked,
    api: {
      createObjectURL(blob: Blob): string {
        const url = `blob:test/${++seq}`;
        blobs.set(url, blob);
        return url;
      },
      revokeObjectURL(url: string): void {
        revoked.push(url);
      },
    },
  };
}
