import { describe, it, expect } from 'vitest';
import { resolveInstanceForUser } from './resolve-instance';

const db = (row: any) => ({
  query: { privateAppInstances: { findFirst: async () => row } },
});

describe('resolveInstanceForUser — the instance boundary', () => {
  it('denies a user who is neither admin nor owner (the boundary)', async () => {
    const row = { slug: 'a', ownerEmail: 'office@a.uk' };
    expect(
      await resolveInstanceForUser(db(row), 'a', {
        id: 'u',
        email: 'someone@b.uk',
        isAdmin: false,
      }),
    ).toBeNull();
  });
  it('allows the owner', async () => {
    const row = { slug: 'a', ownerEmail: 'office@a.uk' };
    expect(
      await resolveInstanceForUser(db(row), 'a', {
        id: 'u',
        email: 'office@a.uk',
        isAdmin: false,
      }),
    ).toEqual(row);
  });
  it('allows an admin', async () => {
    const row = { slug: 'a', ownerEmail: 'office@a.uk' };
    expect(
      await resolveInstanceForUser(db(row), 'a', {
        id: 'u',
        email: 'admin@shippie.app',
        isAdmin: true,
      }),
    ).toEqual(row);
  });
  it('returns null for an unknown slug', async () => {
    expect(
      await resolveInstanceForUser(db(null), 'missing', {
        id: 'u',
        email: 'office@a.uk',
        isAdmin: true,
      }),
    ).toBeNull();
  });
});
