/**
 * Query helpers around `shippie.local.db`. Async because the underlying
 * engine is wa-sqlite + OPFS. Components stay free of SQL-shaped knowledge.
 */
import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  ENTRIES_TABLE,
  MEDICATIONS_TABLE,
  MED_DOSES_TABLE,
  SYMPTOMS_TABLE,
  entriesSchema,
  medDosesSchema,
  medicationsSchema,
  symptomsSchema,
  type Entry,
  type MedDose,
  type Medication,
  type Symptom,
} from './schema.ts';

type RowOf<T> = T & LocalDbRecord;
const asRow = <T>(value: T): RowOf<T> => value as RowOf<T>;

const initCache = new WeakMap<ShippieLocalDb, Promise<void>>();

export async function ensureSchema(db: ShippieLocalDb): Promise<void> {
  let pending = initCache.get(db);
  if (!pending) {
    pending = (async () => {
      await db.create(SYMPTOMS_TABLE, symptomsSchema);
      await db.create(ENTRIES_TABLE, entriesSchema);
      await db.create(MEDICATIONS_TABLE, medicationsSchema);
      await db.create(MED_DOSES_TABLE, medDosesSchema);
    })();
    initCache.set(db, pending);
  }
  await pending;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Symptoms ─────────────────────────────────────────────────────

export async function listSymptoms(db: ShippieLocalDb): Promise<Symptom[]> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<Symptom>>(SYMPTOMS_TABLE, { orderBy: { sort_order: 'asc' } });
  return rows;
}

export async function createSymptom(
  db: ShippieLocalDb,
  input: Omit<Symptom, 'id' | 'created_at' | 'sort_order'> & { sort_order?: number },
): Promise<Symptom> {
  await ensureSchema(db);
  const existing = await listSymptoms(db);
  const sort_order =
    input.sort_order ?? (existing.length === 0 ? 0 : Math.max(...existing.map((s) => s.sort_order ?? 0)) + 1);
  const symptom: Symptom = {
    id: newId(),
    name: input.name,
    default_scale: input.default_scale,
    sort_order,
    created_at: new Date().toISOString(),
  };
  await db.insert(SYMPTOMS_TABLE, asRow(symptom));
  return symptom;
}

export async function updateSymptom(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<Omit<Symptom, 'id' | 'created_at'>>,
): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Symptom>>(SYMPTOMS_TABLE, id, asRow(patch));
}

export async function deleteSymptom(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  // Cascade: delete every entry that referenced this symptom.
  const entries = await db.query<RowOf<Entry>>(ENTRIES_TABLE, { where: { symptom_id: id } });
  for (const e of entries) await db.delete(ENTRIES_TABLE, e.id);
  await db.delete(SYMPTOMS_TABLE, id);
}

export async function reorderSymptoms(db: ShippieLocalDb, idsInOrder: string[]): Promise<void> {
  await ensureSchema(db);
  for (let i = 0; i < idsInOrder.length; i++) {
    await db.update<RowOf<Symptom>>(SYMPTOMS_TABLE, idsInOrder[i]!, asRow({ sort_order: i }));
  }
}

// ─── Entries ──────────────────────────────────────────────────────

export interface CreateEntryInput {
  symptom_id: string;
  intensity: number;
  note?: string | null;
  trigger_text?: string | null;
  /** ISO timestamp. Defaults to now. */
  occurred_at?: string;
}

export async function createEntry(db: ShippieLocalDb, input: CreateEntryInput): Promise<Entry> {
  await ensureSchema(db);
  const entry: Entry = {
    id: newId(),
    occurred_at: input.occurred_at ?? new Date().toISOString(),
    symptom_id: input.symptom_id,
    intensity: input.intensity,
    note: input.note ?? null,
    trigger_text: input.trigger_text ?? null,
  };
  await db.insert(ENTRIES_TABLE, asRow(entry));
  return entry;
}

export async function deleteEntry(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(ENTRIES_TABLE, id);
}

export async function listEntries(db: ShippieLocalDb): Promise<Entry[]> {
  await ensureSchema(db);
  return db.query<RowOf<Entry>>(ENTRIES_TABLE, { orderBy: { occurred_at: 'desc' } });
}

/**
 * Entries within an inclusive ISO date range. Both bounds are full
 * timestamps; pass start-of-day / end-of-day from the caller.
 */
export async function entriesInRange(
  db: ShippieLocalDb,
  fromIso: string,
  toIso: string,
): Promise<Entry[]> {
  await ensureSchema(db);
  const all = await db.query<RowOf<Entry>>(ENTRIES_TABLE, { orderBy: { occurred_at: 'asc' } });
  return all.filter((e) => e.occurred_at >= fromIso && e.occurred_at <= toIso);
}

// ─── Medications ──────────────────────────────────────────────────

export async function listMedications(
  db: ShippieLocalDb,
  opts: { activeOnly?: boolean } = {},
): Promise<Medication[]> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<Medication>>(MEDICATIONS_TABLE, {
    orderBy: { created_at: 'asc' },
  });
  return opts.activeOnly ? rows.filter((m) => m.active === 1) : rows;
}

export async function createMedication(
  db: ShippieLocalDb,
  input: Omit<Medication, 'id' | 'created_at' | 'active'> & { active?: number },
): Promise<Medication> {
  await ensureSchema(db);
  const med: Medication = {
    id: newId(),
    name: input.name,
    dose: input.dose ?? null,
    schedule_text: input.schedule_text ?? null,
    active: input.active ?? 1,
    created_at: new Date().toISOString(),
  };
  await db.insert(MEDICATIONS_TABLE, asRow(med));
  return med;
}

export async function updateMedication(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<Omit<Medication, 'id' | 'created_at'>>,
): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Medication>>(MEDICATIONS_TABLE, id, asRow(patch));
}

export async function deleteMedication(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  // Cascade dose history. The dose history without the medication name
  // is meaningless; we delete rather than orphan.
  const doses = await db.query<RowOf<MedDose>>(MED_DOSES_TABLE, { where: { medication_id: id } });
  for (const d of doses) await db.delete(MED_DOSES_TABLE, d.id);
  await db.delete(MEDICATIONS_TABLE, id);
}

// ─── Med doses ────────────────────────────────────────────────────

export async function recordMedDose(
  db: ShippieLocalDb,
  input: { medication_id: string; note?: string | null; taken_at?: string },
): Promise<MedDose> {
  await ensureSchema(db);
  const dose: MedDose = {
    id: newId(),
    medication_id: input.medication_id,
    taken_at: input.taken_at ?? new Date().toISOString(),
    note: input.note ?? null,
  };
  await db.insert(MED_DOSES_TABLE, asRow(dose));
  return dose;
}

export async function dosesInRange(
  db: ShippieLocalDb,
  fromIso: string,
  toIso: string,
): Promise<MedDose[]> {
  await ensureSchema(db);
  const all = await db.query<RowOf<MedDose>>(MED_DOSES_TABLE, { orderBy: { taken_at: 'asc' } });
  return all.filter((d) => d.taken_at >= fromIso && d.taken_at <= toIso);
}

export async function deleteMedDose(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(MED_DOSES_TABLE, id);
}
