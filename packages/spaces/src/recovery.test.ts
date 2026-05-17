import { describe, expect, test } from 'bun:test';
import {
  canIssueSocialRecovery,
  createSocialRecoveryJoinToken,
  createSocialRecoveryRequest,
  type SpaceMember,
} from './index.ts';

const roles = [
  { id: 'owner', permissions: ['read', 'write', 'invite'] },
  { id: 'member', permissions: ['read', 'write'] },
  { id: 'viewer', permissions: ['read'] },
];

const owner: SpaceMember = {
  memberId: 'owner-1',
  role: 'owner',
  status: 'active',
  joinedAt: '2026-05-17T00:00:00.000Z',
};

const member: SpaceMember = {
  memberId: 'member-1',
  role: 'member',
  status: 'active',
  joinedAt: '2026-05-17T00:00:00.000Z',
};

describe('social recovery', () => {
  test('creates a pending request for a member who needs re-issued access', () => {
    const request = createSocialRecoveryRequest({
      spaceId: 'space_family',
      requesterMemberId: 'member-1',
      requestedAt: '2026-05-17T12:00:00.000Z',
    });
    expect(request).toEqual({
      spaceId: 'space_family',
      requesterMemberId: 'member-1',
      requestedAt: '2026-05-17T12:00:00.000Z',
      status: 'pending',
    });
  });

  test('lets an invite-capable member re-issue a one-use token with the requester role', () => {
    expect(canIssueSocialRecovery({ issuer: owner, requester: member, roles })).toBe(true);
    const token = createSocialRecoveryJoinToken({
      spaceId: 'space_family',
      issuer: owner,
      requester: member,
      roles,
      expiresAt: '2026-05-18T00:00:00.000Z',
    });
    expect(token.spaceId).toBe('space_family');
    expect(token.role).toBe('member');
    expect(token.maxClaims).toBe(1);
  });

  test('rejects self-recovery and roles without invite permission', () => {
    expect(canIssueSocialRecovery({ issuer: member, requester: member, roles })).toBe(false);
    expect(canIssueSocialRecovery({ issuer: member, requester: owner, roles })).toBe(false);
    expect(() =>
      createSocialRecoveryJoinToken({
        spaceId: 'space_family',
        issuer: member,
        requester: owner,
        roles,
        expiresAt: '2026-05-18T00:00:00.000Z',
      }),
    ).toThrow('issuer cannot re-issue access');
  });
});
