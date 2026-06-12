import { describe, expect, test } from 'vitest';
import { shareStateFor } from './share';

const base = {
  slug: 'my-app',
  visibilityScope: 'public',
  latestDeployStatus: 'success' as string | null,
  activeDeployId: 'deploy-1' as string | null,
};

describe('shareStateFor — visibility/status matrix', () => {
  test('public + live → copy/QR the public URL', () => {
    expect(shareStateFor({ ...base })).toEqual({
      kind: 'public',
      url: 'https://shippie.app/my-app',
    });
  });

  test('unlisted + live → public URL', () => {
    expect(shareStateFor({ ...base, visibilityScope: 'unlisted' })).toEqual({
      kind: 'public',
      url: 'https://shippie.app/my-app',
    });
  });

  test('team + live → public URL', () => {
    expect(shareStateFor({ ...base, visibilityScope: 'team' }).kind).toBe('public');
  });

  test('private + live → invite flow, never a public URL', () => {
    expect(shareStateFor({ ...base, visibilityScope: 'private' })).toEqual({
      kind: 'invite',
      href: '/maker/apps/my-app/access',
    });
  });

  test('live via activeDeployId even when status is not success', () => {
    expect(shareStateFor({ ...base, latestDeployStatus: 'building' }).kind).toBe('public');
  });

  test('draft (no deploy, null status) → blocked with Ship first', () => {
    expect(
      shareStateFor({ ...base, latestDeployStatus: null, activeDeployId: null }),
    ).toEqual({ kind: 'blocked', reason: 'Ship first' });
  });

  test('failed (no active deploy) → blocked with Fix deploy', () => {
    expect(
      shareStateFor({ ...base, latestDeployStatus: 'failed', activeDeployId: null }),
    ).toEqual({ kind: 'blocked', reason: 'Fix deploy' });
  });

  test('private + not live → blocked (status wins over visibility)', () => {
    expect(
      shareStateFor({
        ...base,
        visibilityScope: 'private',
        latestDeployStatus: null,
        activeDeployId: null,
      }).kind,
    ).toBe('blocked');
  });
});
