import { describe, it, expect, vi } from 'vitest';
import { createServerRbac, authContextFor } from './rbac';

function selectDb(rows: any[]) {
  return {
    select: () => ({ from: () => ({ where: async () => rows }) }),
  } as any;
}

describe('createServerRbac', () => {
  it('can() delegates to the pure role-scope decider', () => {
    const rbac = createServerRbac(selectDb([]));
    expect(
      rbac.can({ instanceId: 'i1', userId: 'u1', roles: ['teacher'] }, 'append', { type: 'event' }),
    ).toBe(true);
    expect(
      rbac.can({ instanceId: 'i1', userId: 'u1', roles: ['viewer'] }, 'append', { type: 'event' }),
    ).toBe(false);
  });

  it('rolesFor() reads roles from the membership store', async () => {
    const rbac = createServerRbac(selectDb([{ role: 'leader' }, { role: 'office_manager' }]));
    expect(await rbac.rolesFor('i1', 'u1')).toEqual(['leader', 'office_manager']);
  });

  it('assignRole() upserts via the store', async () => {
    const onConflictDoUpdate = vi.fn(async () => {});
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const db = { insert: () => ({ values }) } as any;
    const rbac = createServerRbac(db);
    await rbac.assignRole('i1', 'u1', 'teacher');
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ role: 'teacher' }));
  });
});

describe('authContextFor', () => {
  it('builds an AuthContext from the membership rows', async () => {
    const ctx = await authContextFor(selectDb([{ role: 'teacher' }]), 'i1', 'u1');
    expect(ctx).toEqual({ instanceId: 'i1', userId: 'u1', roles: ['teacher'] });
  });

  it('returns roles [] for a non-member (no access)', async () => {
    const ctx = await authContextFor(selectDb([]), 'i1', 'stranger');
    expect(ctx.roles).toEqual([]);
  });
});
