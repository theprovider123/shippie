import { describe, it, expect, vi } from 'vitest';
import { membershipsFor, rolesFor, assignRole } from './memberships';

/** Minimal drizzle-shaped stub: select().from().where() resolves to rows. */
function selectDb(rows: any[]) {
  return {
    select: () => ({
      from: () => ({
        where: async () => rows,
      }),
    }),
  } as any;
}

describe('membershipsFor', () => {
  it('returns the membership rows for (instanceId, userId)', async () => {
    const rows = [{ instanceId: 'i1', userId: 'u1', role: 'teacher' }];
    expect(await membershipsFor(selectDb(rows), 'i1', 'u1')).toEqual(rows);
  });

  it('returns [] when the user has no membership', async () => {
    expect(await membershipsFor(selectDb([]), 'i1', 'nobody')).toEqual([]);
  });
});

describe('rolesFor', () => {
  it('projects roles out of the membership rows', async () => {
    const rows = [
      { instanceId: 'i1', userId: 'u1', role: 'teacher' },
      { instanceId: 'i1', userId: 'u1', role: 'leader' },
    ];
    expect(await rolesFor(selectDb(rows), 'i1', 'u1')).toEqual(['teacher', 'leader']);
  });
});

describe('assignRole', () => {
  it('upserts a membership row (insert ... on conflict do update)', async () => {
    const onConflict = vi.fn(async () => {});
    const values = vi.fn(() => ({ onConflictDoUpdate: onConflict }));
    const db = { insert: () => ({ values }) } as any;
    await assignRole(db, 'i1', 'u1', 'teacher', { invitedBy: 'admin' });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'i1', userId: 'u1', role: 'teacher', invitedBy: 'admin' }),
    );
    expect(onConflict).toHaveBeenCalled();
  });
});
