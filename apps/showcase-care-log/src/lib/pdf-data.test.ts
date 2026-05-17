import { describe, expect, test } from 'bun:test';
import type {
  HandoverNote,
  MedDose,
  MedItem,
  SymptomEntry,
} from '../sync/care-doc.ts';
import { buildReportData, defaultRange } from './pdf-data.ts';

function ms(s: string): number {
  return new Date(s).getTime();
}

const MEDS: MedItem[] = [
  { id: 'm1', name: 'Calpol', dose: '5ml', schedule_text: 'every 4 hours', active: true, started_at: ms('2026-04-01T08:00:00') },
  { id: 'm2', name: 'OldMed', dose: '1 tab', schedule_text: 'morning', active: false, started_at: ms('2026-01-01T08:00:00') },
];

const DOSES: MedDose[] = [
  { id: 'd1', med_id: 'm1', given_at: ms('2026-04-30T08:00:00'), given_by: 'a', note: '', missed: false },
  { id: 'd2', med_id: 'm1', given_at: ms('2026-05-01T08:00:00'), given_by: 'a', note: '', missed: false },
  { id: 'd3', med_id: 'm1', given_at: ms('2026-05-02T08:00:00'), given_by: 'b', note: '', missed: false },
  { id: 'd4', med_id: 'm1', given_at: ms('2026-05-03T08:00:00'), given_by: 'a', note: '', missed: true },
];

const SYMPTOMS: SymptomEntry[] = [
  { id: 's1', label: 'headache', intensity: 3, occurred_at: ms('2026-05-01T10:00:00'), note: '', logged_by: 'a' },
  { id: 's2', label: 'headache', intensity: 4, occurred_at: ms('2026-05-02T10:00:00'), note: '', logged_by: 'a' },
  { id: 's3', label: 'mood', intensity: 0, occurred_at: ms('2026-04-29T10:00:00'), note: '', logged_by: 'b' },
];

const HANDOVER: HandoverNote[] = [
  { id: 'h1', author: 'a', body: 'GP appt Friday', written_at: ms('2026-05-01T09:00:00'), acked_at: null },
  { id: 'h2', author: 'b', body: 'OOH note', written_at: ms('2026-05-02T09:00:00'), acked_at: null },
  { id: 'h3', author: 'a', body: 'extra meds', written_at: ms('2026-04-15T09:00:00'), acked_at: null },
];

describe('buildReportData', () => {
  test('filters by inclusive date range', () => {
    const out = buildReportData({
      startISO: '2026-05-01',
      endISO: '2026-05-02',
      meds: MEDS,
      doses: DOSES,
      symptoms: SYMPTOMS,
      handover: HANDOVER,
      includedHandoverIds: new Set(['h1', 'h2', 'h3']),
    });
    expect(out.doses.map((d) => d.id)).toEqual(['d2', 'd3']);
    expect(out.symptoms.map((s) => s.id)).toEqual(['s1', 's2']);
    // h3 is outside the range so it's excluded even though included.
    expect(out.handover.map((h) => h.id)).toEqual(['h1', 'h2']);
  });

  test('only includes hand-picked handover ids', () => {
    const out = buildReportData({
      startISO: '2026-05-01',
      endISO: '2026-05-02',
      meds: MEDS,
      doses: DOSES,
      symptoms: SYMPTOMS,
      handover: HANDOVER,
      includedHandoverIds: new Set(['h1']),
    });
    expect(out.handover.map((h) => h.id)).toEqual(['h1']);
  });

  test('sorts doses, symptoms, handover oldest-first', () => {
    const out = buildReportData({
      startISO: '2026-04-29',
      endISO: '2026-05-03',
      meds: MEDS,
      doses: DOSES,
      symptoms: SYMPTOMS,
      handover: HANDOVER,
      includedHandoverIds: new Set(['h1', 'h2']),
    });
    expect(out.doses.map((d) => d.id)).toEqual(['d1', 'd2', 'd3', 'd4']);
    expect(out.symptoms.map((s) => s.id)).toEqual(['s3', 's1', 's2']);
    expect(out.handover.map((h) => h.id)).toEqual(['h1', 'h2']);
  });

  test('med summary counts given vs missed', () => {
    const out = buildReportData({
      startISO: '2026-04-29',
      endISO: '2026-05-03',
      meds: MEDS,
      doses: DOSES,
      symptoms: SYMPTOMS,
      handover: HANDOVER,
      includedHandoverIds: new Set(),
    });
    const m1 = out.meds.find((m) => m.med.id === 'm1');
    expect(m1?.doseCountInRange).toBe(3);
    expect(m1?.missedCountInRange).toBe(1);
  });

  test('inactive meds with no doses in range are excluded; inactive with doses included', () => {
    const out = buildReportData({
      startISO: '2026-05-01',
      endISO: '2026-05-02',
      meds: MEDS,
      doses: DOSES,
      symptoms: SYMPTOMS,
      handover: HANDOVER,
      includedHandoverIds: new Set(),
    });
    // m2 is inactive and has zero doses anywhere → excluded.
    expect(out.meds.find((m) => m.med.id === 'm2')).toBeUndefined();
    // m1 is active → included.
    expect(out.meds.find((m) => m.med.id === 'm1')).toBeDefined();
  });
});

describe('defaultRange', () => {
  test('produces a 7-day window ending today by default', () => {
    const now = new Date('2026-05-05T12:00:00');
    const r = defaultRange(7, now);
    expect(r.endISO).toBe('2026-05-05');
    expect(r.startISO).toBe('2026-04-29');
  });

  test('honours custom day count', () => {
    const now = new Date('2026-05-05T12:00:00');
    const r = defaultRange(14, now);
    expect(r.startISO).toBe('2026-04-22');
  });
});
