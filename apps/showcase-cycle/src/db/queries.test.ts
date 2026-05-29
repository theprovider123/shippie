import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import {
  addDays,
  correctCycleStart,
  cycleDayFor,
  daysBetween,
  deleteCycle,
  getActiveCycle,
  getDayByDate,
  isoDate,
  listCycles,
  listDays,
  loadPrefs,
  logDay,
  parseSymptoms,
  recomputeLengths,
  savePrefs,
  startCycle,
  summariseCycle,
} from './queries.ts';
import type { PrefsView } from './schema.ts';

describe('date helpers', () => {
  it('isoDate produces yyyy-MM-dd', () => {
    expect(isoDate(new Date(2025, 4, 1))).toBe('2025-05-01');
  });

  it('daysBetween counts inclusive of from', () => {
    expect(daysBetween('2025-05-01', '2025-05-08')).toBe(7);
  });

  it('addDays handles month rollover', () => {
    expect(addDays('2025-05-30', 5)).toBe('2025-06-04');
  });
});

describe('cycles', () => {
  it('starts a cycle and lists it', async () => {
    const db = new MemoryLocalDb();
    const c = await startCycle(db, '2025-04-10');
    expect(c.id).toBeTruthy();
    expect(c.started_on).toBe('2025-04-10');
    const all = await listCycles(db);
    expect(all).toHaveLength(1);
    expect(all[0]!.length_days).toBeNull(); // open
  });

  it('recomputeLengths backfills length_days for closed cycles', async () => {
    const db = new MemoryLocalDb();
    await startCycle(db, '2025-01-01');
    await startCycle(db, '2025-01-30'); // 29-day cycle for the first
    await startCycle(db, '2025-02-28'); // 29-day cycle for the second
    await recomputeLengths(db);
    const all = await listCycles(db); // newest first
    expect(all[0]!.length_days).toBeNull(); // most recent is open
    expect(all[1]!.length_days).toBe(29);
    expect(all[2]!.length_days).toBe(29);
  });

  it('getActiveCycle returns the most-recent cycle', async () => {
    const db = new MemoryLocalDb();
    await startCycle(db, '2025-01-01');
    await startCycle(db, '2025-02-04');
    const active = await getActiveCycle(db);
    expect(active?.started_on).toBe('2025-02-04');
  });
});

describe('days', () => {
  it('logs a day and reads it back', async () => {
    const db = new MemoryLocalDb();
    const c = await startCycle(db, '2025-04-10');
    await logDay(db, {
      cycle_id: c.id,
      date: '2025-04-12',
      flow: 2,
      symptoms: ['cramps', 'headache'],
      note: 'felt better after walking',
    });
    const got = await getDayByDate(db, '2025-04-12');
    expect(got).not.toBeNull();
    expect(got!.flow).toBe(2);
    expect(parseSymptoms(got!.symptoms_json ?? null)).toEqual(['cramps', 'headache']);
  });

  it('logDay upserts on the same date', async () => {
    const db = new MemoryLocalDb();
    const c = await startCycle(db, '2025-04-10');
    await logDay(db, { cycle_id: c.id, date: '2025-04-10', flow: 3 });
    await logDay(db, { cycle_id: c.id, date: '2025-04-10', flow: 1, symptoms: ['backache'] });
    const all = await listDays(db, c.id);
    expect(all).toHaveLength(1);
    expect(all[0]!.flow).toBe(1);
    expect(parseSymptoms(all[0]!.symptoms_json ?? null)).toEqual(['backache']);
  });
});

describe('manual correction', () => {
  it('correctCycleStart moves the start and recomputes lengths', async () => {
    const db = new MemoryLocalDb();
    const a = await startCycle(db, '2025-01-01');
    await startCycle(db, '2025-02-01'); // 31d after a
    // Correct a's start later → the gap to the next cycle shrinks.
    await correctCycleStart(db, a.id, '2025-01-10');
    const cycles = await listCycles(db);
    const corrected = cycles.find((c) => c.id === a.id)!;
    expect(corrected.started_on).toBe('2025-01-10');
    expect(corrected.length_days).toBe(22); // 2025-01-10 → 2025-02-01
  });

  it('deleteCycle removes the cycle and its days', async () => {
    const db = new MemoryLocalDb();
    const a = await startCycle(db, '2025-01-01');
    await logDay(db, { cycle_id: a.id, date: '2025-01-02', flow: 2 });
    const b = await startCycle(db, '2025-02-01');
    await deleteCycle(db, a.id);
    expect(await listCycles(db)).toHaveLength(1);
    expect((await listCycles(db))[0]!.id).toBe(b.id);
    expect(await listDays(db, a.id)).toHaveLength(0);
  });
});

describe('summariseCycle', () => {
  it('aggregates symptoms and finds flow peak', async () => {
    const db = new MemoryLocalDb();
    const c = await startCycle(db, '2025-04-10');
    await logDay(db, { cycle_id: c.id, date: '2025-04-10', flow: 2, symptoms: ['cramps'] });
    await logDay(db, { cycle_id: c.id, date: '2025-04-11', flow: 3, symptoms: ['cramps', 'backache'] });
    await logDay(db, { cycle_id: c.id, date: '2025-04-12', flow: 1, symptoms: ['headache'] });
    const summary = await summariseCycle(db, c.id);
    expect(summary).not.toBeNull();
    expect(summary!.dayCount).toBe(3);
    expect(summary!.symptomFrequency.cramps).toBe(2);
    expect(summary!.symptomFrequency.backache).toBe(1);
    expect(summary!.flowPeak).toBe(3);
  });
});

describe('cycleDayFor', () => {
  it('returns 1-indexed day in current cycle', async () => {
    const db = new MemoryLocalDb();
    await startCycle(db, '2025-04-10');
    expect(await cycleDayFor(db, '2025-04-10')).toBe(1);
    expect(await cycleDayFor(db, '2025-04-13')).toBe(4);
  });

  it('returns null when no active cycle', async () => {
    const db = new MemoryLocalDb();
    expect(await cycleDayFor(db, '2025-04-13')).toBeNull();
  });
});

function prefsView(over: Partial<PrefsView> = {}): PrefsView {
  return {
    mode: 'period-only',
    gender_neutral: false,
    lock_pin: null,
    decoy_pin: null,
    share_with_partner: false,
    partner_pair_code: null,
    partner_seen_fields: { cycle_day: true, fertile_window: false, predicted_period: false, flow_today: false },
    clinician_share: {
      include_cycles: true,
      include_symptoms: true,
      include_flow: true,
      include_notes: false,
      include_intimacy: false,
      from_date: null,
    },
    ...over,
  };
}

describe('prefs', () => {
  it('returns sensible defaults when nothing is persisted', async () => {
    const db = new MemoryLocalDb();
    const prefs = await loadPrefs(db);
    expect(prefs.mode).toBe('period-only');
    expect(prefs.share_with_partner).toBe(false);
    expect(prefs.partner_pair_code).toBeNull();
    expect(prefs.partner_seen_fields.cycle_day).toBe(true);
    expect(prefs.partner_seen_fields.fertile_window).toBe(false);
    // Privacy: no PIN and no intimacy sharing by default.
    expect(prefs.lock_pin).toBeNull();
    expect(prefs.clinician_share.include_intimacy).toBe(false);
  });

  it('round-trips mode, share state, partner code, and clinician selection', async () => {
    const db = new MemoryLocalDb();
    await savePrefs(
      db,
      prefsView({
        mode: 'perimenopause',
        share_with_partner: true,
        partner_pair_code: 'TENDER-CRANE-3849',
        partner_seen_fields: { cycle_day: true, fertile_window: true, predicted_period: false, flow_today: false },
        clinician_share: {
          include_cycles: true,
          include_symptoms: true,
          include_flow: true,
          include_notes: true,
          include_intimacy: false,
          from_date: '2025-01-01',
        },
      }),
    );
    const back = await loadPrefs(db);
    expect(back.mode).toBe('perimenopause');
    expect(back.share_with_partner).toBe(true);
    expect(back.partner_pair_code).toBe('TENDER-CRANE-3849');
    expect(back.partner_seen_fields.fertile_window).toBe(true);
    expect(back.partner_seen_fields.predicted_period).toBe(false);
    expect(back.clinician_share.include_notes).toBe(true);
    expect(back.clinician_share.from_date).toBe('2025-01-01');
  });

  it('updates rather than duplicates the singleton on save', async () => {
    const db = new MemoryLocalDb();
    await savePrefs(db, prefsView());
    await savePrefs(db, prefsView({ share_with_partner: true, partner_pair_code: 'GOLDEN-WILLOW-1111' }));
    const rows = await db.query('prefs');
    expect(rows).toHaveLength(1);
  });
});
