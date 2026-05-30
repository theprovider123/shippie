/**
 * Data ownership — export and delete.
 *
 * Two non-negotiables for a trustworthy private app:
 *   - Export everything, in a readable, portable form (no lock-in).
 *   - Delete everything, for real, on demand.
 *
 * Export NEVER includes secrets: the lock/duress PINs and the partner pair
 * code are credentials, not records, and are stripped. A clinician/partner
 * export is additionally field-filtered by the user's ClinicianShare bundle —
 * opt-in, field-selective, and date-bounded — so the freeform note and
 * intimacy log only leave if explicitly included.
 */
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  CYCLES_TABLE,
  DAYS_TABLE,
  PREFS_TABLE,
  type ClinicianShare,
  type Cycle,
  type Day,
} from '../db/schema.ts';
import { ensureSchema, listCycles, listDays, parseStringArray, parseSymptoms, recomputeLengths } from '../db/queries.ts';
import type { LocalDbRecord } from '@shippie/local-runtime-contract';

export interface CycleExport {
  app: 'cycle';
  schema: 'cycle.v2';
  exported_at: string;
  scope: 'full' | 'clinician';
  cycles: Cycle[];
  days: Array<Partial<Day> & { date: string }>;
}

/** A full, faithful export of every record (no secrets). */
export async function exportAll(db: ShippieLocalDb, exportedAtIso: string): Promise<CycleExport> {
  const [cycles, days] = await Promise.all([listCycles(db), listDays(db)]);
  return {
    app: 'cycle',
    schema: 'cycle.v2',
    exported_at: exportedAtIso,
    scope: 'full',
    cycles,
    days,
  };
}

/**
 * A field-selective export for a clinician or partner. Honors the share
 * bundle: each day is reduced to only the included fields, and days before
 * `from_date` are dropped. Pure + deterministic so it's straightforward to test.
 */
export function filterForClinician(
  cycles: Cycle[],
  days: Day[],
  share: ClinicianShare,
  exportedAtIso: string,
): CycleExport {
  const fromOk = (d: string) => !share.from_date || d >= share.from_date;
  const outDays = days
    .filter((d) => fromOk(d.date))
    .map((d) => {
      const row: Partial<Day> & { date: string } = { date: d.date };
      if (share.include_flow && d.flow != null) row.flow = d.flow;
      if (share.include_symptoms) {
        const syms = parseSymptoms(d.symptoms_json ?? null);
        if (syms.length) row.symptoms_json = JSON.stringify(syms);
        if (d.pain != null) row.pain = d.pain;
        if (d.mood != null) row.mood = d.mood;
        if (d.energy != null) row.energy = d.energy;
      }
      if (share.include_notes && d.note) row.note = d.note;
      if (share.include_intimacy) {
        const sex = parseStringArray(d.sex_json ?? null);
        if (sex.length) row.sex_json = JSON.stringify(sex);
      }
      return row;
    });
  return {
    app: 'cycle',
    schema: 'cycle.v2',
    exported_at: exportedAtIso,
    scope: 'clinician',
    cycles: share.include_cycles ? cycles : [],
    days: outDays,
  };
}

export async function exportForClinician(
  db: ShippieLocalDb,
  share: ClinicianShare,
  exportedAtIso: string,
): Promise<CycleExport> {
  const [cycles, days] = await Promise.all([listCycles(db), listDays(db)]);
  return filterForClinician(cycles, days, share, exportedAtIso);
}

/**
 * Restore records from a full export (used by the encrypted backup). Replaces
 * cycles + days; leaves prefs/settings (and the lock PIN) untouched. Only a
 * full-scope export can be restored — a field-filtered clinician export is
 * lossy by design and would silently drop data.
 */
export async function importAll(
  db: ShippieLocalDb,
  data: CycleExport,
): Promise<{ ok: boolean; error?: string }> {
  if (data.app !== 'cycle') return { ok: false, error: 'Not a Cycle export.' };
  if (data.scope !== 'full') return { ok: false, error: 'A clinician export is partial and cannot be restored.' };
  await ensureSchema(db);
  for (const table of [DAYS_TABLE, CYCLES_TABLE]) {
    const rows = await db.query<{ id: string }>(table);
    for (const row of rows) if (row.id) await db.delete(table, row.id);
  }
  for (const c of data.cycles) await db.insert(CYCLES_TABLE, c as unknown as LocalDbRecord);
  for (const d of data.days) {
    if (d.id && d.cycle_id) await db.insert(DAYS_TABLE, d as unknown as LocalDbRecord);
  }
  await recomputeLengths(db);
  return { ok: true };
}

/** Delete every record across all tables. Irreversible. */
export async function deleteAllData(db: ShippieLocalDb): Promise<void> {
  for (const table of [DAYS_TABLE, CYCLES_TABLE, PREFS_TABLE]) {
    const rows = await db.query<{ id: string }>(table);
    for (const row of rows) {
      if (row.id) await db.delete(table, row.id);
    }
  }
}

/** Trigger a browser download of a JSON export (no-op outside the browser). */
export function downloadExport(data: CycleExport, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
