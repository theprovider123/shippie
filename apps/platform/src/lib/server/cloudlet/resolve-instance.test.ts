import { describe, it, expect } from 'vitest';
import { resolveInstanceForUser } from './resolve-instance';

/**
 * Stub the platform DB: `query.privateAppInstances.findFirst` returns the
 * instance row; the `select().from().where()` chain (used by membershipsFor)
 * returns the caller's membership rows.
 */
function db(instanceRow: any, membershipRows: any[] = []) {
  return {
    query: { privateAppInstances: { findFirst: async () => instanceRow } },
    select: () => ({ from: () => ({ where: async () => membershipRows }) }),
  } as any;
}

const ROW = { id: 'inst_a', slug: 'a', ownerEmail: 'office@a.uk' };

describe('resolveInstanceForUser — the instance boundary (membership + RBAC)', () => {
  it('denies a non-member even if their email matches ownerEmail (Phase-2 fix)', async () => {
    // No membership rows — the unverified ownerEmail must NOT grant access.
    const res = await resolveInstanceForUser(db(ROW, []), 'a', {
      id: 'u',
      email: 'office@a.uk',
      isAdmin: false,
    });
    expect(res).toBeNull();
  });

  it('allows a verified member (office_manager)', async () => {
    const res = await resolveInstanceForUser(
      db(ROW, [{ instanceId: 'inst_a', userId: 'u', role: 'office_manager' }]),
      'a',
      { id: 'u', email: 'office@a.uk', isAdmin: false },
    );
    expect(res?.row).toEqual(ROW);
    expect(res?.ctx.roles).toEqual(['office_manager']);
  });

  it('allows a teacher to read events (baseline capability)', async () => {
    const res = await resolveInstanceForUser(
      db(ROW, [{ instanceId: 'inst_a', userId: 'u', role: 'teacher' }]),
      'a',
      { id: 'u', email: 't@a.uk', isAdmin: false },
    );
    expect(res?.ctx.roles).toEqual(['teacher']);
  });

  it('denies a member who lacks the required capability', async () => {
    // viewer cannot append events.
    const res = await resolveInstanceForUser(
      db(ROW, [{ instanceId: 'inst_a', userId: 'u', role: 'viewer' }]),
      'a',
      { id: 'u', email: 'v@a.uk', isAdmin: false },
      { action: 'append', resource: { type: 'event' } },
    );
    expect(res).toBeNull();
  });

  it('allows a platform admin (operational access)', async () => {
    const res = await resolveInstanceForUser(db(ROW, []), 'a', {
      id: 'adm',
      email: 'admin@shippie.app',
      isAdmin: true,
    });
    expect(res?.row).toEqual(ROW);
    expect(res?.ctx.roles).toEqual(['owner']);
  });

  it('returns null for an unknown slug', async () => {
    const res = await resolveInstanceForUser(db(null, []), 'missing', {
      id: 'u',
      email: 'x@a.uk',
      isAdmin: true,
    });
    expect(res).toBeNull();
  });
});
