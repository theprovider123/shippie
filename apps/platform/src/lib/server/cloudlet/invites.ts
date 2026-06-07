/**
 * InviteSystem — staff onboarding for a school instance.
 *
 * Reuses Shippie's existing token+expiry invite pattern
 * (organizationInvites / spaceJoinTokens): a single-use random token is
 * generated, only its SHA-256 HASH is persisted, the raw token is returned
 * for delivery (magic-style link / email), and `accept` verifies the hash,
 * checks expiry + revocation, creates a verified membership, and stamps the
 * invite consumed.
 *
 * The DB I/O is behind an injected `InviteStore` so the core logic is pure +
 * unit-testable in Node (vitest) without a D1/Workers pool — matching the
 * dependency-injection style of `provisioning.ts`. `wireInviteStore(db)`
 * builds the real Drizzle-backed store.
 */
import { and, eq } from 'drizzle-orm';
import type { Invite, InviteSystem, Membership, Role } from '@shippie/cloudlet-contract';
import { schema } from '$server/db/client';
import { assignRole } from './memberships';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface StoredInvite {
  id: string;
  instanceId: string;
  email: string;
  role: Role;
  scope: { classIds?: string[] } | null;
  tokenHash: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  invitedBy: string | null;
  createdAt: string;
}

/** The persistence surface the InviteSystem needs. */
export interface InviteStore {
  insertInvite(row: StoredInvite): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<StoredInvite | null>;
  findById(id: string): Promise<StoredInvite | null>;
  markAccepted(id: string, at: string, byUserId: string): Promise<void>;
  markRevoked(id: string, at: string): Promise<void>;
  createMembership(m: {
    instanceId: string;
    userId: string;
    role: Role;
    scope: { classIds?: string[] } | null;
    invitedBy: string | null;
  }): Promise<void>;
}

export interface InviteSystemDeps {
  store: InviteStore;
  now: () => number;
  newId: () => string;
  newToken: () => string;
  ttlMs?: number;
  recordAudit?: (e: {
    actorUserId: string | null;
    action: string;
    targetId: string | null;
    after?: Record<string, unknown> | null;
  }) => Promise<void>;
  actorUserId: string | null;
}

/** SHA-256 hex of the raw token. Web Crypto — available in Workers + Node. */
export async function hashInviteToken(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function createInviteSystem(deps: InviteSystemDeps): InviteSystem {
  const ttl = deps.ttlMs ?? DEFAULT_TTL_MS;

  async function invite(
    instanceId: string,
    email: string,
    role: Role,
    scope?: { classIds?: string[] },
  ): Promise<Invite> {
    const id = deps.newId();
    const rawToken = deps.newToken();
    const tokenHash = await hashInviteToken(rawToken);
    const createdAt = new Date(deps.now()).toISOString();
    const expiresAt = new Date(deps.now() + ttl).toISOString();
    const normalisedEmail = email.trim().toLowerCase();
    const row: StoredInvite = {
      id,
      instanceId,
      email: normalisedEmail,
      role,
      scope: scope ?? null,
      tokenHash,
      expiresAt,
      acceptedAt: null,
      revokedAt: null,
      invitedBy: deps.actorUserId,
      createdAt,
    };
    await deps.store.insertInvite(row);
    await deps.recordAudit?.({
      actorUserId: deps.actorUserId,
      action: 'cloudlet_invite.created',
      targetId: id,
      after: { instanceId, email: normalisedEmail, role },
    });
    // The raw token is returned ONCE (for delivery); it is never persisted.
    return {
      id,
      instanceId,
      email: normalisedEmail,
      role,
      scope: scope ?? undefined,
      token: rawToken,
      expiresAt,
      acceptedAt: null,
      revokedAt: null,
      invitedBy: deps.actorUserId,
      createdAt,
    };
  }

  async function accept(
    token: string,
    identity: { userId: string; email: string },
  ): Promise<Membership> {
    const tokenHash = await hashInviteToken(token);
    const row = await deps.store.findByTokenHash(tokenHash);
    if (!row) throw new Error('invalid_invite');
    if (row.revokedAt) throw new Error('invite_revoked');
    if (row.acceptedAt) throw new Error('invite_already_accepted');
    if (Date.parse(row.expiresAt) < deps.now()) throw new Error('invite_expired');

    const joinedAt = new Date(deps.now()).toISOString();
    await deps.store.createMembership({
      instanceId: row.instanceId,
      userId: identity.userId,
      role: row.role,
      scope: row.scope,
      invitedBy: row.invitedBy,
    });
    await deps.store.markAccepted(row.id, joinedAt, identity.userId);
    await deps.recordAudit?.({
      actorUserId: identity.userId,
      action: 'cloudlet_invite.accepted',
      targetId: row.id,
      after: { instanceId: row.instanceId, userId: identity.userId, role: row.role },
    });
    return {
      instanceId: row.instanceId,
      userId: identity.userId,
      role: row.role,
      invitedBy: row.invitedBy,
      joinedAt,
    };
  }

  async function revoke(inviteId: string): Promise<void> {
    const at = new Date(deps.now()).toISOString();
    await deps.store.markRevoked(inviteId, at);
    await deps.recordAudit?.({
      actorUserId: deps.actorUserId,
      action: 'cloudlet_invite.revoked',
      targetId: inviteId,
    });
  }

  return { invite, accept, revoke };
}

/** Build the real Drizzle-backed InviteStore over the platform D1 client. */
export function wireInviteStore(db: any): InviteStore {
  return {
    async insertInvite(row) {
      await db.insert(schema.cloudletInvites).values({
        id: row.id,
        instanceId: row.instanceId,
        email: row.email,
        role: row.role,
        scope: row.scope,
        tokenHash: row.tokenHash,
        expiresAt: row.expiresAt,
        acceptedAt: row.acceptedAt,
        revokedAt: row.revokedAt,
        invitedBy: row.invitedBy,
        createdAt: row.createdAt,
      });
    },
    async findByTokenHash(tokenHash) {
      const rows = await db
        .select()
        .from(schema.cloudletInvites)
        .where(eq(schema.cloudletInvites.tokenHash, tokenHash))
        .limit(1);
      return (rows[0] ?? null) as StoredInvite | null;
    },
    async findById(id) {
      const rows = await db
        .select()
        .from(schema.cloudletInvites)
        .where(eq(schema.cloudletInvites.id, id))
        .limit(1);
      return (rows[0] ?? null) as StoredInvite | null;
    },
    async markAccepted(id, at, byUserId) {
      await db
        .update(schema.cloudletInvites)
        .set({ acceptedAt: at, acceptedBy: byUserId })
        .where(eq(schema.cloudletInvites.id, id));
    },
    async markRevoked(id, at) {
      await db
        .update(schema.cloudletInvites)
        .set({ revokedAt: at })
        .where(eq(schema.cloudletInvites.id, id));
    },
    async createMembership(m) {
      await assignRole(db, m.instanceId, m.userId, m.role, {
        invitedBy: m.invitedBy,
        scope: m.scope,
      });
    },
  };
}

export { and, eq };
