import { describe, it, expect, vi } from 'vitest';
import { createPrivateAppInstance } from './provisioning';

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
});
