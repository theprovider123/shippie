import { describe, expect, test } from 'vitest';
import {
  appendSignedPrivateSpaceCapability,
  hasPrivateSpaceCapabilityParams,
  privateSpaceCapabilityFromUrl,
  verifyPrivateSpaceCapability,
} from './private-space-capability';

describe('private space invite capabilities', () => {
  test('signs role-bound space URLs and verifies the original capability', async () => {
    const url = await appendSignedPrivateSpaceCapability('https://shippie.app/i/abc123', 'secret', {
      appSlug: 'match-room',
      inviteToken: 'tok123',
      spaceId: 'space_pub_final',
      role: 'viewer',
      joinToken: 'join_abc123',
      transferId: 'transfer_abcdefghijkl',
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get('space')).toBe('space_pub_final');
    expect(parsed.searchParams.get('role')).toBe('viewer');
    expect(parsed.searchParams.get('space_sig')).toMatch(/^[0-9a-f]{64}$/);
    expect(hasPrivateSpaceCapabilityParams(parsed)).toBe(true);

    const capability = privateSpaceCapabilityFromUrl(parsed, { appSlug: 'match-room', inviteToken: 'tok123' });
    expect(capability?.role).toBe('viewer');
    expect(await verifyPrivateSpaceCapability('secret', capability!, parsed.searchParams.get('space_sig'))).toBe(true);
  });

  test('rejects tampered roles and capabilities bound to a different invite token', async () => {
    const url = await appendSignedPrivateSpaceCapability('https://shippie.app/invite/tok123', 'secret', {
      appSlug: 'match-room',
      inviteToken: 'tok123',
      spaceId: 'space_pub_final',
      role: 'viewer',
      joinToken: 'join_abc123',
    });
    const parsed = new URL(url);
    const signature = parsed.searchParams.get('space_sig');

    parsed.searchParams.set('role', 'owner');
    const tampered = privateSpaceCapabilityFromUrl(parsed, { appSlug: 'match-room', inviteToken: 'tok123' });
    expect(await verifyPrivateSpaceCapability('secret', tampered!, signature)).toBe(false);

    parsed.searchParams.set('role', 'viewer');
    const otherInvite = privateSpaceCapabilityFromUrl(parsed, { appSlug: 'match-room', inviteToken: 'tok999' });
    expect(await verifyPrivateSpaceCapability('secret', otherInvite!, signature)).toBe(false);
  });
});
