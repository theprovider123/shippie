import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from '../db/runtime.ts';
import { deleteAllData, exportAll, filterForClinician } from './data-ops.ts';
import { logDay, savePrefs, startCycle } from '../db/queries.ts';
import { DEFAULT_CLINICIAN_SHARE, type ClinicianShare, type Cycle, type Day } from '../db/schema.ts';

let n = 0;
function day(cycle_id: string, date: string, over: Partial<Day> = {}): Day {
  return { id: `d${n++}`, cycle_id, date, ...over };
}

describe('filterForClinician — field-selective, revocable export', () => {
  const cycles: Cycle[] = [{ id: 'c1', started_on: '2025-01-01' }];
  const days: Day[] = [
    day('c1', '2025-01-02', {
      flow: 3,
      pain: 2,
      mood: 4,
      symptoms_json: JSON.stringify(['cramps']),
      note: 'felt rough',
      sex_json: JSON.stringify(['unprotected']),
    }),
  ];

  it('includes only the selected fields — notes + intimacy OFF by default', () => {
    const out = filterForClinician(cycles, days, DEFAULT_CLINICIAN_SHARE, '2025-02-01T00:00:00Z');
    expect(out.scope).toBe('clinician');
    expect(out.cycles).toHaveLength(1);
    const d = out.days[0]!;
    expect(d.flow).toBe(3);
    expect(d.pain).toBe(2);
    // notes + intimacy excluded by default
    expect(d.note).toBeUndefined();
    expect(d.sex_json).toBeUndefined();
  });

  it('includes notes + intimacy only when explicitly opted in', () => {
    const share: ClinicianShare = { ...DEFAULT_CLINICIAN_SHARE, include_notes: true, include_intimacy: true };
    const out = filterForClinician(cycles, days, share, '2025-02-01T00:00:00Z');
    expect(out.days[0]!.note).toBe('felt rough');
    expect(out.days[0]!.sex_json).toBe(JSON.stringify(['unprotected']));
  });

  it('drops cycles entirely when include_cycles is off', () => {
    const share: ClinicianShare = { ...DEFAULT_CLINICIAN_SHARE, include_cycles: false };
    expect(filterForClinician(cycles, days, share, 'now').cycles).toHaveLength(0);
  });

  it('respects a from_date bound', () => {
    const share: ClinicianShare = { ...DEFAULT_CLINICIAN_SHARE, from_date: '2025-06-01' };
    expect(filterForClinician(cycles, days, share, 'now').days).toHaveLength(0);
  });
});

describe('exportAll', () => {
  it('exports cycles + days with the v2 schema tag', async () => {
    const db = new MemoryLocalDb();
    const c = await startCycle(db, '2025-01-01');
    await logDay(db, { cycle_id: c.id, date: '2025-01-02', flow: 2, mood: 3 });
    const out = await exportAll(db, '2025-02-01T00:00:00Z');
    expect(out.app).toBe('cycle');
    expect(out.schema).toBe('cycle.v2');
    expect(out.cycles).toHaveLength(1);
    expect(out.days).toHaveLength(1);
  });
});

describe('deleteAllData — delete means delete', () => {
  it('removes every cycle, day, and pref row', async () => {
    const db = new MemoryLocalDb();
    const c = await startCycle(db, '2025-01-01');
    await logDay(db, { cycle_id: c.id, date: '2025-01-02', flow: 2 });
    await savePrefs(db, {
      mode: 'period-only',
      gender_neutral: false,
      lock_pin: '1234',
      decoy_pin: null,
      share_with_partner: false,
      partner_pair_code: null,
      partner_seen_fields: { cycle_day: true, fertile_window: false, predicted_period: false, flow_today: false },
      clinician_share: { ...DEFAULT_CLINICIAN_SHARE },
    });
    await deleteAllData(db);
    expect(await db.query('cycles')).toHaveLength(0);
    expect(await db.query('days')).toHaveLength(0);
    expect(await db.query('prefs')).toHaveLength(0);
  });
});
