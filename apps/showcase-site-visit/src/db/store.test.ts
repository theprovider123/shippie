import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import {
  addCheck,
  addIncident,
  addManyChecks,
  createSite,
  createVisit,
  deleteCheck,
  deleteSite,
  deleteVisit,
  getSite,
  getVisit,
  listChecksForVisit,
  listIncidentsForVisit,
  listSavedTemplates,
  listSites,
  listVisitsForSite,
  saveTemplate,
  searchSites,
  updateCheck,
  updateSite,
  updateVisit,
} from './store.ts';

describe('store — sites', () => {
  it('creates, reads, and updates a site', async () => {
    const db = new MemoryLocalDb();
    const site = await createSite(db, {
      name: 'Mariners Walk',
      address: '15 Mariners Walk, Bristol',
      contact_name: 'A. Patel',
      contact_phone: '07700 900123',
    });
    expect(site.id).toBeTruthy();
    expect(site.created_at).toBeTruthy();

    const got = await getSite(db, site.id);
    expect(got?.name).toBe('Mariners Walk');

    await updateSite(db, site.id, { contact_name: 'A. P.' });
    const after = await getSite(db, site.id);
    expect(after?.contact_name).toBe('A. P.');

    const all = await listSites(db);
    expect(all).toHaveLength(1);
  });

  it('searches sites by substring', async () => {
    const db = new MemoryLocalDb();
    await createSite(db, { name: 'Mariners Walk' });
    await createSite(db, { name: 'Highbury Court' });
    const found = await searchSites(db, 'court');
    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('Highbury Court');
  });

  it('cascades visit + check deletes when a site is removed', async () => {
    const db = new MemoryLocalDb();
    const site = await createSite(db, { name: 'X' });
    const visit = await createVisit(db, { site_id: site.id });
    await addCheck(db, { visit_id: visit.id, label: 'one' });
    await addCheck(db, { visit_id: visit.id, label: 'two' });

    await deleteSite(db, site.id);
    expect(await getSite(db, site.id)).toBeNull();
    expect(await getVisit(db, visit.id)).toBeNull();
    expect(await listChecksForVisit(db, visit.id)).toHaveLength(0);
  });
});

describe('store — visits', () => {
  it('lists visits for a site, newest first', async () => {
    const db = new MemoryLocalDb();
    const site = await createSite(db, { name: 'Site A' });
    const v1 = await createVisit(db, {
      site_id: site.id,
      started_at: '2026-05-01T09:00:00.000Z',
    });
    const v2 = await createVisit(db, {
      site_id: site.id,
      started_at: '2026-05-04T09:00:00.000Z',
    });
    const list = await listVisitsForSite(db, site.id);
    expect(list.map((v) => v.id)).toEqual([v2.id, v1.id]);
  });

  it('updates status and signature on a visit', async () => {
    const db = new MemoryLocalDb();
    const site = await createSite(db, { name: 'X' });
    const visit = await createVisit(db, { site_id: site.id });
    expect(visit.status).toBe('in-progress');
    await updateVisit(db, visit.id, { status: 'submitted', signature_svg: '<svg/>' });
    const after = await getVisit(db, visit.id);
    expect(after?.status).toBe('submitted');
    expect(after?.signature_svg).toBe('<svg/>');
  });

  it('cascades check + incident deletes when a visit is removed', async () => {
    const db = new MemoryLocalDb();
    const site = await createSite(db, { name: 'X' });
    const visit = await createVisit(db, { site_id: site.id });
    await addCheck(db, { visit_id: visit.id, label: 'one' });
    await addIncident(db, {
      visit_id: visit.id,
      severity: 'low',
      description: 'note',
      follow_up: false,
    });

    await deleteVisit(db, visit.id);
    expect(await listChecksForVisit(db, visit.id)).toHaveLength(0);
    expect(await listIncidentsForVisit(db, visit.id)).toHaveLength(0);
  });
});

describe('store — checks', () => {
  it('preserves order from position', async () => {
    const db = new MemoryLocalDb();
    const site = await createSite(db, { name: 'X' });
    const visit = await createVisit(db, { site_id: site.id });
    await addManyChecks(db, visit.id, ['alpha', 'beta', 'gamma']);
    const got = await listChecksForVisit(db, visit.id);
    expect(got.map((c) => c.label)).toEqual(['alpha', 'beta', 'gamma']);
    expect(got.map((c) => c.position)).toEqual([0, 1, 2]);
  });

  it('round-trips photo paths via comma-separated storage', async () => {
    const db = new MemoryLocalDb();
    const site = await createSite(db, { name: 'X' });
    const visit = await createVisit(db, { site_id: site.id });
    const c = await addCheck(db, {
      visit_id: visit.id,
      label: 'shot',
      photo_paths: ['a.jpg', 'b.jpg'],
    });
    const got = await listChecksForVisit(db, visit.id);
    expect(got[0]!.photo_paths).toEqual(['a.jpg', 'b.jpg']);

    await updateCheck(db, c.id, { status: 'pass', notes: 'looks ok', photo_paths: ['a.jpg', 'b.jpg', 'c.jpg'] });
    const updated = await listChecksForVisit(db, visit.id);
    expect(updated[0]!.status).toBe('pass');
    expect(updated[0]!.notes).toBe('looks ok');
    expect(updated[0]!.photo_paths).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('deletes a single check without touching siblings', async () => {
    const db = new MemoryLocalDb();
    const site = await createSite(db, { name: 'X' });
    const visit = await createVisit(db, { site_id: site.id });
    const checks = await addManyChecks(db, visit.id, ['a', 'b', 'c']);
    await deleteCheck(db, checks[1]!.id);
    const got = await listChecksForVisit(db, visit.id);
    expect(got.map((c) => c.label)).toEqual(['a', 'c']);
  });
});

describe('store — incidents', () => {
  it('records incidents with severity and follow-up flag', async () => {
    const db = new MemoryLocalDb();
    const site = await createSite(db, { name: 'X' });
    const visit = await createVisit(db, { site_id: site.id });
    await addIncident(db, {
      visit_id: visit.id,
      severity: 'high',
      description: 'CO alarm missing',
      follow_up: true,
    });
    const list = await listIncidentsForVisit(db, visit.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.severity).toBe('high');
    expect(list[0]!.follow_up).toBe(true);
  });
});

describe('store — saved templates', () => {
  it('saves and lists user templates with checklist round-trip', async () => {
    const db = new MemoryLocalDb();
    await saveTemplate(db, {
      name: 'My boiler list',
      checks: ['Pressure', 'Flue', 'Combustion'],
    });
    const list = await listSavedTemplates(db);
    expect(list).toHaveLength(1);
    expect(list[0]!.checks).toEqual(['Pressure', 'Flue', 'Combustion']);
  });
});
