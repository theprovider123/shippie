/**
 * Query helpers for the Cycle local DB.
 *
 * Conventions:
 *   - Dates are stored as ISO yyyy-MM-dd strings (no timezone surprises).
 *   - Cycles' `length_days` is computed from started_on -> next started_on,
 *     filled in lazily by `recomputeLengths()`.
 *   - The `prefs` row is a singleton with id='singleton'.
 */
import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  CYCLES_TABLE,
  DAYS_TABLE,
  DEFAULT_CLINICIAN_SHARE,
  DEFAULT_PARTNER_SEEN,
  PREFS_TABLE,
  PREFS_SINGLETON_ID,
  cyclesSchema,
  daysSchema,
  prefsSchema,
  type ClinicianShare,
  type Cycle,
  type Day,
  type Discharge,
  type Flow,
  type Mode,
  type Pain,
  type PartnerSeenFields,
  type Prefs,
  type PrefsView,
  type Scale5,
  type SexEntry,
  type SymptomKey,
} from './schema.ts';

type RowOf<T> = T & LocalDbRecord;
const asRow = <T>(value: T): RowOf<T> => value as RowOf<T>;

const initCache = new WeakMap<ShippieLocalDb, Promise<void>>();

export async function ensureSchema(db: ShippieLocalDb): Promise<void> {
  let pending = initCache.get(db);
  if (!pending) {
    pending = (async () => {
      await db.create(CYCLES_TABLE, cyclesSchema);
      await db.create(DAYS_TABLE, daysSchema);
      await db.create(PREFS_TABLE, prefsSchema);
    })();
    initCache.set(db, pending);
  }
  await pending;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Format a Date as yyyy-MM-dd (UTC-ish; we treat dates as local civil days). */
export function isoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Days between two yyyy-MM-dd strings, inclusive of from. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = parseIso(fromIso).getTime();
  const to = parseIso(toIso).getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

// ── Cycles ────────────────────────────────────────────────────────────

export async function listCycles(db: ShippieLocalDb): Promise<Cycle[]> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<Cycle>>(CYCLES_TABLE, { orderBy: { started_on: 'desc' } });
  return rows.map((r) => ({ ...r }));
}

export async function getActiveCycle(db: ShippieLocalDb): Promise<Cycle | null> {
  const cycles = await listCycles(db);
  return cycles[0] ?? null;
}

export async function startCycle(
  db: ShippieLocalDb,
  startedOn: string = isoDate(),
  notes: string | null = null,
): Promise<Cycle> {
  await ensureSchema(db);
  const id = newId();
  const cycle: Cycle = {
    id,
    started_on: startedOn,
    ended_on: null,
    length_days: null,
    notes,
    created_at: new Date().toISOString(),
  };
  await db.insert(CYCLES_TABLE, asRow(cycle));
  await recomputeLengths(db);
  return cycle;
}

export async function updateCycle(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<Omit<Cycle, 'id'>>,
): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Cycle>>(CYCLES_TABLE, id, asRow(patch));
}

/** Manual correction: delete a cycle and all its logged days, then recompute. */
export async function deleteCycle(db: ShippieLocalDb, cycleId: string): Promise<void> {
  await ensureSchema(db);
  const days = await listDays(db, cycleId);
  for (const d of days) await db.delete(DAYS_TABLE, d.id);
  await db.delete(CYCLES_TABLE, cycleId);
  await recomputeLengths(db);
}

/** Manual correction: move a cycle's start date, then recompute lengths. */
export async function correctCycleStart(db: ShippieLocalDb, cycleId: string, startedOn: string): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Cycle>>(CYCLES_TABLE, cycleId, asRow({ started_on: startedOn }));
  await recomputeLengths(db);
}

/** Backfill length_days for every cycle except the most recent (still open). */
export async function recomputeLengths(db: ShippieLocalDb): Promise<void> {
  const cycles = await listCycles(db); // newest first
  // Walk from oldest to newest so the diff calculation is forward.
  const ordered = [...cycles].reverse();
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const cur = ordered[i]!;
    const next = ordered[i + 1]!;
    const length = daysBetween(cur.started_on, next.started_on);
    if (cur.length_days !== length) {
      await db.update<RowOf<Cycle>>(CYCLES_TABLE, cur.id, asRow({ length_days: length }));
    }
  }
}

// ── Days ──────────────────────────────────────────────────────────────

export async function listDays(db: ShippieLocalDb, cycleId?: string): Promise<Day[]> {
  await ensureSchema(db);
  const opts = cycleId
    ? { where: { cycle_id: cycleId }, orderBy: { date: 'desc' as const } }
    : { orderBy: { date: 'desc' as const } };
  const rows = await db.query<RowOf<Day>>(DAYS_TABLE, opts);
  return rows.map((r) => ({ ...r }));
}

export async function getDayByDate(db: ShippieLocalDb, date: string): Promise<Day | null> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<Day>>(DAYS_TABLE, { where: { date }, limit: 1 });
  return rows[0] ?? null;
}

export interface DayInput {
  cycle_id: string;
  date: string;
  flow?: Flow | null;
  pain?: Pain | null;
  mood?: Scale5 | null;
  energy?: Scale5 | null;
  discharge?: Discharge | null;
  meds?: string[];
  sex?: SexEntry[];
  symptoms?: SymptomKey[];
  note?: string | null;
}

function dayFieldsFromInput(input: DayInput): Partial<Day> {
  return {
    flow: input.flow ?? null,
    pain: input.pain ?? null,
    mood: input.mood ?? null,
    energy: input.energy ?? null,
    discharge: input.discharge ?? null,
    meds_json: input.meds && input.meds.length ? JSON.stringify(input.meds) : null,
    sex_json: input.sex && input.sex.length ? JSON.stringify(input.sex) : null,
    symptoms_json: input.symptoms && input.symptoms.length ? JSON.stringify(input.symptoms) : null,
    note: input.note ?? null,
  };
}

export async function logDay(db: ShippieLocalDb, input: DayInput): Promise<Day> {
  await ensureSchema(db);
  const existing = await getDayByDate(db, input.date);
  const fields = dayFieldsFromInput(input);
  if (existing) {
    await db.update<RowOf<Day>>(DAYS_TABLE, existing.id, asRow(fields));
    return { ...existing, ...fields };
  }
  const day: Day = {
    id: newId(),
    cycle_id: input.cycle_id,
    date: input.date,
    ...fields,
    created_at: new Date().toISOString(),
  };
  await db.insert(DAYS_TABLE, asRow(day));
  return day;
}

export function parseSymptoms(json: string | null | undefined): SymptomKey[] {
  return parseStringArray(json) as SymptomKey[];
}

export function parseStringArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    /* ignore */
  }
  return [];
}

// ── Cycle aggregations ────────────────────────────────────────────────

export interface CycleSummary {
  cycle: Cycle;
  dayCount: number;
  symptomFrequency: Record<string, number>;
  flowPeak: Flow | null;
}

export async function summariseCycle(db: ShippieLocalDb, cycleId: string): Promise<CycleSummary | null> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<Cycle>>(CYCLES_TABLE, { where: { id: cycleId }, limit: 1 });
  const cycle = rows[0];
  if (!cycle) return null;
  const days = await listDays(db, cycleId);
  const freq: Record<string, number> = {};
  let flowPeak: Flow | null = null;
  for (const d of days) {
    for (const s of parseSymptoms(d.symptoms_json ?? null)) {
      freq[s] = (freq[s] ?? 0) + 1;
    }
    if (typeof d.flow === 'number') {
      if (flowPeak === null || d.flow > flowPeak) flowPeak = d.flow as Flow;
    }
  }
  return {
    cycle: { ...cycle },
    dayCount: days.length,
    symptomFrequency: freq,
    flowPeak,
  };
}

/** What day of the active cycle is this date? 1-indexed. Returns null if no active cycle. */
export async function cycleDayFor(db: ShippieLocalDb, date: string = isoDate()): Promise<number | null> {
  const active = await getActiveCycle(db);
  if (!active) return null;
  const diff = daysBetween(active.started_on, date);
  if (diff < 0) return null;
  return diff + 1;
}

// ── Prefs (singleton) ─────────────────────────────────────────────────

export async function loadPrefs(db: ShippieLocalDb): Promise<PrefsView> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<Prefs>>(PREFS_TABLE, { where: { id: PREFS_SINGLETON_ID }, limit: 1 });
  const row = rows[0];
  const base: PrefsView = {
    mode: 'period-only',
    gender_neutral: false,
    lock_pin: null,
    decoy_pin: null,
    share_with_partner: false,
    partner_pair_code: null,
    partner_seen_fields: { ...DEFAULT_PARTNER_SEEN },
    clinician_share: { ...DEFAULT_CLINICIAN_SHARE },
  };
  if (!row) return base;
  let seen: PartnerSeenFields = { ...DEFAULT_PARTNER_SEEN };
  if (row.partner_seen_fields_json) {
    try {
      seen = { ...seen, ...(JSON.parse(row.partner_seen_fields_json) as Partial<PartnerSeenFields>) };
    } catch {
      /* ignore — fall back to defaults */
    }
  }
  let clinician: ClinicianShare = { ...DEFAULT_CLINICIAN_SHARE };
  if (row.clinician_share_json) {
    try {
      clinician = { ...clinician, ...(JSON.parse(row.clinician_share_json) as Partial<ClinicianShare>) };
    } catch {
      /* ignore */
    }
  }
  return {
    mode: (row.mode as Mode) ?? 'period-only',
    gender_neutral: Boolean(row.gender_neutral),
    lock_pin: row.lock_pin ?? null,
    decoy_pin: row.decoy_pin ?? null,
    share_with_partner: Boolean(row.share_with_partner),
    partner_pair_code: row.partner_pair_code ?? null,
    partner_seen_fields: seen,
    clinician_share: clinician,
  };
}

export async function savePrefs(db: ShippieLocalDb, view: PrefsView): Promise<void> {
  await ensureSchema(db);
  const existing = await db.query<RowOf<Prefs>>(PREFS_TABLE, { where: { id: PREFS_SINGLETON_ID }, limit: 1 });
  const row: Prefs = {
    id: PREFS_SINGLETON_ID,
    mode: view.mode,
    gender_neutral: view.gender_neutral ? 1 : 0,
    lock_pin: view.lock_pin,
    decoy_pin: view.decoy_pin,
    share_with_partner: view.share_with_partner ? 1 : 0,
    partner_pair_code: view.partner_pair_code,
    partner_seen_fields_json: JSON.stringify(view.partner_seen_fields),
    clinician_share_json: JSON.stringify(view.clinician_share),
  };
  if (existing[0]) {
    await db.update<RowOf<Prefs>>(PREFS_TABLE, PREFS_SINGLETON_ID, asRow(row));
  } else {
    await db.insert(PREFS_TABLE, asRow(row));
  }
}
