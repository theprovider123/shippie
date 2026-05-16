import { describe, expect, test } from 'vitest';
import {
  packageDownloadUrl,
  resolvePrivateJoinState,
  type ContainerPackageSummary,
} from './container-page-data';

const pkg: ContainerPackageSummary = {
  id: 'app_private_room',
  slug: 'private-room',
  name: 'Private Room',
  description: 'A closed room.',
  appKind: 'connected',
  entry: 'app/index.html',
  version: '1.0.0',
  packageHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  packageUrl: '/api/apps/private-room/packages/sha256%3Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  standaloneUrl: 'https://private-room.shippie.app',
  permissions: {
    schema: 'shippie.permissions.v1',
    capabilities: {},
  },
  trust: {
    containerEligibility: 'compatible',
    privacy: { grade: 'A', externalDomains: [] },
    security: { stage: 'public', score: 100, findings: [] },
  },
  visibility: 'private',
  owned: false,
};

describe('container private join data', () => {
  test('builds package download URLs with encoded hashes', () => {
    expect(packageDownloadUrl('private-room', pkg.packageHash)).toBe(pkg.packageUrl);
  });

  test('returns null unless a private join was requested for an available app', () => {
    expect(resolvePrivateJoinState({
      url: new URL('https://shippie.test/container?app=private-room'),
      requestedAppSlug: 'private-room',
      packages: [pkg],
      inviteGrantForRequestedApp: true,
    })).toBeNull();
    expect(resolvePrivateJoinState({
      url: new URL('https://shippie.test/container?app=missing&join=private-space'),
      requestedAppSlug: 'missing',
      packages: [pkg],
      inviteGrantForRequestedApp: true,
    })).toBeNull();
  });

  test('describes the package handoff for private join installs', () => {
    expect(resolvePrivateJoinState({
      url: new URL('https://shippie.test/container?app=private-room&join=private-space&transfer=transfer_abcdefghijkl'),
      requestedAppSlug: 'private-room',
      packages: [pkg],
      inviteGrantForRequestedApp: true,
    })).toEqual({
      kind: 'private-space',
      appSlug: 'private-room',
      appId: 'app_private_room',
      appName: 'Private Room',
      packageHash: pkg.packageHash,
      packageUrl: pkg.packageUrl,
      transferId: 'transfer_abcdefghijkl',
      source: 'invite',
    });
  });
});
