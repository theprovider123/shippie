/**
 * InviteSystem + Membership — the reusable identity/onboarding surface.
 *
 * Mirrors Shippie's existing token+expiry invite pattern
 * (organizationInvites / spaceJoinTokens): a single-use token is generated,
 * only its HASH is stored, the raw token is delivered to the invitee, and
 * acceptance verifies the hash, checks expiry, and creates a membership.
 */
import type { Role } from './roles';

export interface Invite {
  id: string;
  instanceId: string;
  email: string;
  role: Role;
  /** Optional class-level scope (Uniti: invite a teacher to specific classes). */
  scope?: { classIds?: string[] };
  /** Raw token — returned ONLY at creation time (for delivery); never stored. */
  token?: string;
  expiresAt: string; // ISO
  acceptedAt?: string | null;
  revokedAt?: string | null;
  invitedBy: string | null;
  createdAt: string;
}

export interface Membership {
  instanceId: string;
  userId: string;
  role: Role;
  invitedBy?: string | null;
  joinedAt: string;
}

export interface InviteSystem {
  invite(
    instanceId: string,
    email: string,
    role: Role,
    scope?: { classIds?: string[] },
  ): Promise<Invite>;
  accept(token: string, identity: { userId: string; email: string }): Promise<Membership>;
  revoke(inviteId: string): Promise<void>;
}
