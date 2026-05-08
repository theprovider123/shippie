import { describe, expect, it } from 'bun:test';
import type { Check, Incident, Site, Visit } from '../db/schema.ts';
import { buildPdfPayload, summaryHeadline } from './pdf-data.ts';

const site = (overrides: Partial<Site> = {}): Site => ({
  id: 's1',
  name: '15 Mariners Walk',
  address: '15 Mariners Walk, Bristol, BS1 4QA',
  contact_name: 'A. Patel',
  contact_phone: '07700 900123',
  ...overrides,
});

const visit = (overrides: Partial<Visit> = {}): Visit => ({
  id: 'v1',
  site_id: 's1',
  status: 'submitted',
  inspector_name: 'D. Providence',
  weather: 'overcast',
  started_at: '2026-05-04T08:30:00.000Z',
  ended_at: '2026-05-04T09:10:00.000Z',
  signature_svg: '<svg/>',
  ...overrides,
});

const check = (overrides: Partial<Check> = {}): Check => ({
  id: `c_${Math.random().toString(36).slice(2, 6)}`,
  visit_id: 'v1',
  label: 'Smoke alarm',
  status: 'pass',
  notes: null,
  photo_paths: [],
  position: 0,
  ...overrides,
});

describe('buildPdfPayload', () => {
  it('joins site + visit + checks + incidents into a print-ready payload', () => {
    const checks: Check[] = [
      check({ label: 'Smoke alarm', status: 'pass', position: 0 }),
      check({
        label: 'Boiler pressure',
        status: 'fail',
        notes: 'reads 0.4 bar — re-pressurise before sign-off',
        photo_paths: ['p1.jpg', 'p2.jpg'],
        position: 1,
      }),
      check({ label: 'Escape route', status: 'na', position: 2 }),
    ];
    const incidents: Incident[] = [
      {
        id: 'i1',
        visit_id: 'v1',
        severity: 'high',
        description: 'CO alarm missing in boiler room',
        photo_path: 'inc1.jpg',
        follow_up: true,
        created_at: '2026-05-04T08:55:00.000Z',
      },
    ];
    const payload = buildPdfPayload({ site: site(), visit: visit(), checks, incidents });
    expect(payload.site.name).toBe('15 Mariners Walk');
    expect(payload.site.contact).toBe('A. Patel · 07700 900123');
    expect(payload.visit.statusLabel).toBe('Submitted');
    expect(payload.checks).toHaveLength(3);
    expect(payload.checks[1]!.statusLabel).toBe('Fail');
    expect(payload.checks[1]!.photoCount).toBe(2);
    expect(payload.incidents).toHaveLength(1);
    expect(payload.incidents[0]!.severityLabel).toBe('High');
    expect(payload.incidents[0]!.hasPhoto).toBe(true);
    expect(payload.signatureSvg).toBe('<svg/>');
  });

  it('preserves check display order from position', () => {
    const checks = [
      check({ label: 'Third', position: 2 }),
      check({ label: 'First', position: 0 }),
      check({ label: 'Second', position: 1 }),
    ];
    const payload = buildPdfPayload({ site: site(), visit: visit(), checks, incidents: [] });
    expect(payload.checks.map((c) => c.label)).toEqual(['First', 'Second', 'Third']);
  });

  it('summarises check status counts', () => {
    const checks = [
      check({ status: 'pass', position: 0 }),
      check({ status: 'pass', position: 1 }),
      check({ status: 'fail', position: 2 }),
      check({ status: 'needs-attention', position: 3 }),
      check({ status: 'na', position: 4 }),
      check({ status: 'pending', position: 5 }),
    ];
    const payload = buildPdfPayload({ site: site(), visit: visit(), checks, incidents: [] });
    expect(payload.summary).toEqual({
      total: 6,
      pass: 2,
      fail: 1,
      na: 1,
      needsAttention: 1,
      pending: 1,
    });
  });

  it('handles empty contact gracefully', () => {
    const payload = buildPdfPayload({
      site: site({ contact_name: null, contact_phone: null }),
      visit: visit(),
      checks: [],
      incidents: [],
    });
    expect(payload.site.contact).toBe('');
  });
});

describe('summaryHeadline', () => {
  it('reports passes-only when no issues', () => {
    const payload = buildPdfPayload({
      site: site(),
      visit: visit(),
      checks: [check({ status: 'pass' }), check({ status: 'pass', position: 1 })],
      incidents: [],
    });
    expect(summaryHeadline(payload)).toBe('2/2 pass');
  });

  it('reports issue count when failures or needs-attention exist', () => {
    const payload = buildPdfPayload({
      site: site(),
      visit: visit(),
      checks: [
        check({ status: 'pass', position: 0 }),
        check({ status: 'fail', position: 1 }),
        check({ status: 'needs-attention', position: 2 }),
      ],
      incidents: [],
    });
    expect(summaryHeadline(payload)).toBe('1/3 pass — 2 issues');
  });

  it('says no checks when total is zero', () => {
    const payload = buildPdfPayload({ site: site(), visit: visit(), checks: [], incidents: [] });
    expect(summaryHeadline(payload)).toBe('No checks recorded');
  });
});
