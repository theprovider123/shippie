import { createJoinToken } from './capsule.ts';
import { canRole } from './roles.ts';
import type { JoinToken, SpaceMember, SpaceRoleDeclaration } from './types.ts';

export interface SocialRecoveryRequest {
  spaceId: string;
  requesterMemberId: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

export function createSocialRecoveryRequest(input: {
  spaceId: string;
  requesterMemberId: string;
  requestedAt?: string | Date;
}): SocialRecoveryRequest {
  return {
    spaceId: input.spaceId,
    requesterMemberId: input.requesterMemberId,
    requestedAt: dateString(input.requestedAt ?? new Date()),
    status: 'pending',
  };
}

export function canIssueSocialRecovery(input: {
  issuer: SpaceMember;
  requester: SpaceMember;
  roles?: SpaceRoleDeclaration[];
  requiredPermission?: string;
}): boolean {
  if (input.issuer.status !== 'active') return false;
  if (input.requester.status !== 'active') return false;
  if (input.issuer.memberId === input.requester.memberId) return false;
  return canRole(input.issuer.role, input.requiredPermission ?? 'invite', input.roles);
}

export function createSocialRecoveryJoinToken(input: {
  spaceId: string;
  issuer: SpaceMember;
  requester: SpaceMember;
  roles?: SpaceRoleDeclaration[];
  expiresAt: string | Date;
}): JoinToken {
  if (!canIssueSocialRecovery(input)) {
    throw new Error('issuer cannot re-issue access for this space');
  }
  return createJoinToken({
    spaceId: input.spaceId,
    role: input.requester.role,
    maxClaims: 1,
    expiresAt: input.expiresAt,
  });
}

function dateString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
