import { describe, it, expect, vi } from 'vitest';
import { createPrivateAppInstance, deprovision } from './provisioning';

describe('createPrivateAppInstance', () => {
  it('provisions: Shippie app+space install record, control-plane row, DO workspace, audit', async () => {
    const inserted: any[] = [];
    const db = {
      insert: () => ({
        values: (v: any) => {
          inserted.push(v);
          return { returning: async () => [v] };
        },
      }),
    } as any;
    const stub = { listEvents: vi.fn(async () => []) };
    let derivedName = '';
    const ns = {
      idFromName: (s: string) => {
        derivedName = s;
        return { toString: () => `do-${s}` };
      },
      get: () => stub,
    } as any;
    const audit = vi.fn(async () => {});
    const ensureUnitiApp = vi.fn(async () => ({ appRef: 'app_uniti' }));
    const createSpace = vi.fn(async () => ({ spaceId: 'space_1' }));
    const out = await createPrivateAppInstance(
      {
        db,
        schoolWorkspaceNs: ns,
        recordAudit: audit,
        ensureUnitiApp,
        createSpace,
        newInstanceId: () => 'inst_ABC',
        actorUserId: 'admin1',
        now: 1717718400000,
        seedDemo: false, // Phase-1A: keep the DO stub minimal (no demo seed)
      },
      {
        appId: 'uniti',
        tenantName: 'Greenfield Primary',
        slug: 'greenfield-primary',
        branding: { displayName: 'Greenfield Primary' },
        ownerEmail: 'office@greenfield.sch.uk',
        region: 'uk',
        modules: ['adaptations', 'feedback'],
        dataBoundary: 'dedicated-school-workspace',
      },
    );
    expect(out.id).toBe('inst_ABC'); // immutable id, NOT derived from slug
    expect(derivedName).toBe('uniti:inst_ABC'); // DO derives from the immutable id, NOT the slug
    expect(out.workspaceDoId).toBe('do-uniti:inst_ABC');
    expect(out.appRef).toBe('app_uniti'); // references the Shippie private app
    expect(out.spaceId).toBe('space_1'); // references the Shippie install record (space)
    expect(ensureUnitiApp).toHaveBeenCalled();
    expect(createSpace).toHaveBeenCalled();
    expect(inserted.some((r) => r.slug === 'greenfield-primary' && r.id === 'inst_ABC')).toBe(true);
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'private_app_instance.created' }),
    );
  });

  it('seeds the office-manager access for ownerEmail (Phase 2)', async () => {
    const db = {
      insert: () => ({ values: (v: any) => ({ returning: async () => [v] }) }),
    } as any;
    const ns = {
      idFromName: () => ({ toString: () => 'do-x' }),
      get: () => ({ listEvents: vi.fn(async () => []) }),
    } as any;
    const seedOwnerMembership = vi.fn(async () => ({ via: 'invite' as const, inviteToken: 'tok' }));
    await createPrivateAppInstance(
      {
        db,
        schoolWorkspaceNs: ns,
        recordAudit: vi.fn(async () => {}),
        ensureUnitiApp: vi.fn(async () => ({ appRef: 'app_uniti' })),
        createSpace: vi.fn(async () => ({ spaceId: 'space_1' })),
        newInstanceId: () => 'inst_X',
        actorUserId: 'admin1',
        now: 1717718400000,
        seedOwnerMembership,
        seedDemo: false,
      },
      {
        appId: 'uniti',
        tenantName: 'Oakwood Junior',
        slug: 'oakwood-junior',
        branding: { displayName: 'Oakwood Junior' },
        ownerEmail: 'office@oakwood.sch.uk',
        region: 'uk',
        modules: [],
        dataBoundary: 'dedicated-school-workspace',
      },
    );
    expect(seedOwnerMembership).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'inst_X', ownerEmail: 'office@oakwood.sch.uk' }),
    );
  });
});

describe('deprovision', () => {
  function makeDb(row: any) {
    const updates: any[] = [];
    const deletes: any[] = [];
    const db = {
      query: { privateAppInstances: { findFirst: async () => row } },
      update: () => ({ set: (s: any) => ({ where: () => { updates.push(s); } }) }),
      delete: () => ({ where: (w: any) => { deletes.push(w); } }),
    } as any;
    return { db, updates, deletes };
  }

  it('export mode: builds the export, audits, leaves the workspace untouched', async () => {
    const { db, updates } = makeDb({ id: 'inst_1', slug: 'greenfield', spaceId: 'sp_1' });
    const eraseAll = vi.fn(async () => ({ events: 0, feedback: 0, pupils: 0 }));
    const stub = { buildExport: vi.fn(async () => ({ events: [{ x: 1 }] })), eraseAll };
    const ns = { idFromName: () => 'id', get: () => stub } as any;
    const audit = vi.fn(async () => {});

    const manifest = (await deprovision(
      { db, schoolWorkspaceNs: ns, recordAudit: audit, actorUserId: 'admin', now: 1_700_000_000_000 },
      'inst_1',
      'export',
    )) as any;

    expect(stub.buildExport).toHaveBeenCalled();
    expect(eraseAll).not.toHaveBeenCalled(); // non-destructive
    expect(manifest.files).toEqual(['uniti-greenfield-export.json']);
    expect(manifest.data).toEqual({ events: [{ x: 1 }] });
    expect(updates).toHaveLength(0); // not marked erased
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'private_app_instance.exported' }),
    );
  });

  it('erase mode: purges the DO, removes the install, tombstones the row, audits', async () => {
    const { db, updates, deletes } = makeDb({ id: 'inst_2', slug: 'oakwood', spaceId: 'sp_2' });
    const eraseAll = vi.fn(async () => ({ events: 5, feedback: 3, pupils: 2 }));
    const stub = { buildExport: vi.fn(), eraseAll };
    const ns = { idFromName: () => 'id', get: () => stub } as any;
    const audit = vi.fn(async () => {});

    const manifest = await deprovision(
      { db, schoolWorkspaceNs: ns, recordAudit: audit, actorUserId: 'admin', now: 1_700_000_000_000 },
      'inst_2',
      'erase',
    );

    expect(eraseAll).toHaveBeenCalled(); // DO SQLite + storage purged
    expect(deletes).toHaveLength(1); // space_apps install removed
    expect(updates).toEqual([{ erasedAt: 1_700_000_000_000 }]); // row tombstoned (kept)
    expect(manifest.files).toEqual([]);
    const actions = (audit.mock.calls as any[]).map((c) => c[1].action);
    expect(actions).toContain('private_app_instance.erase_started');
    expect(actions).toContain('private_app_instance.erased');
  });

  it('throws for an unknown instance', async () => {
    const { db } = makeDb(undefined);
    const ns = { idFromName: () => 'id', get: () => ({}) } as any;
    await expect(
      deprovision(
        { db, schoolWorkspaceNs: ns, recordAudit: vi.fn(async () => {}), actorUserId: null, now: 0 },
        'nope',
        'export',
      ),
    ).rejects.toThrow(/not found/);
  });
});
