import { describe, it, expect, vi } from 'vitest';
import {
  hashInviteToken,
  createInviteSystem,
  type InviteStore,
  type StoredInvite,
} from './invites';

/** In-memory InviteStore so the InviteSystem logic is tested without D1. */
function memStore() {
  const invites: StoredInvite[] = [];
  const memberships: Array<{ instanceId: string; userId: string; role: string }> = [];
  const store: InviteStore = {
    async insertInvite(row) {
      invites.push({ ...row });
    },
    async findByTokenHash(tokenHash) {
      return invites.find((r) => r.tokenHash === tokenHash) ?? null;
    },
    async findById(id) {
      return invites.find((r) => r.id === id) ?? null;
    },
    async markAccepted(id, at, byUserId) {
      const r = invites.find((x) => x.id === id);
      if (r) r.acceptedAt = at;
      void byUserId;
    },
    async markRevoked(id, at) {
      const r = invites.find((x) => x.id === id);
      if (r) r.revokedAt = at;
    },
    async createMembership(m) {
      memberships.push({ instanceId: m.instanceId, userId: m.userId, role: m.role });
    },
  };
  return { store, invites, memberships };
}

function sys(store: InviteStore, overrides: Partial<Parameters<typeof createInviteSystem>[0]> = {}) {
  return createInviteSystem({
    store,
    now: () => 1_717_800_000_000,
    newId: () => 'inv_1',
    newToken: () => 'raw-token-123',
    ttlMs: 1000 * 60 * 60,
    recordAudit: vi.fn(async () => {}),
    actorUserId: 'admin',
    ...overrides,
  });
}

describe('hashInviteToken', () => {
  it('is deterministic SHA-256 hex and differs per input', async () => {
    const a = await hashInviteToken('abc');
    expect(a).toBe(await hashInviteToken('abc'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashInviteToken('xyz')).not.toBe(a);
  });
});

describe('createInviteSystem', () => {
  it('invite() stores only the token HASH and returns the raw token', async () => {
    const { store, invites } = memStore();
    const out = await sys(store).invite('i1', 'Teach@School.UK', 'teacher');
    expect(out.token).toBe('raw-token-123');
    expect(invites[0].tokenHash).toBe(await hashInviteToken('raw-token-123'));
    expect(invites[0].tokenHash).not.toBe('raw-token-123');
    expect(invites[0].email).toBe('teach@school.uk'); // lowercased + trimmed
    expect(invites[0].role).toBe('teacher');
  });

  it('accept() with a valid token creates a membership + stamps acceptedAt', async () => {
    const { store, invites, memberships } = memStore();
    const s = sys(store);
    await s.invite('i1', 'teach@school.uk', 'teacher');
    const m = await s.accept('raw-token-123', { userId: 'u9', email: 'teach@school.uk' });
    expect(m).toMatchObject({ instanceId: 'i1', userId: 'u9', role: 'teacher' });
    expect(memberships).toHaveLength(1);
    expect(invites[0].acceptedAt).toBeTruthy();
  });

  it('accept() rejects an unknown/wrong token (no membership)', async () => {
    const { store, memberships } = memStore();
    const s = sys(store);
    await s.invite('i1', 'teach@school.uk', 'teacher');
    await expect(s.accept('wrong', { userId: 'u9', email: 'x' })).rejects.toThrow(/invalid/i);
    expect(memberships).toHaveLength(0);
  });

  it('accept() rejects an expired invite', async () => {
    const { store } = memStore();
    const s = sys(store, { ttlMs: -1 });
    await s.invite('i1', 'teach@school.uk', 'teacher');
    await expect(s.accept('raw-token-123', { userId: 'u9', email: 'x' })).rejects.toThrow(/expired/i);
  });

  it('accept() rejects a revoked invite', async () => {
    const { store } = memStore();
    const s = sys(store);
    await s.invite('i1', 'teach@school.uk', 'teacher');
    await s.revoke('inv_1');
    await expect(s.accept('raw-token-123', { userId: 'u9', email: 'x' })).rejects.toThrow(/revoked/i);
  });

  it('accept() is single-use (second accept rejects)', async () => {
    const { store } = memStore();
    const s = sys(store);
    await s.invite('i1', 'teach@school.uk', 'teacher');
    await s.accept('raw-token-123', { userId: 'u9', email: 'x' });
    await expect(s.accept('raw-token-123', { userId: 'u9', email: 'x' })).rejects.toThrow(
      /already_accepted/i,
    );
  });
});
