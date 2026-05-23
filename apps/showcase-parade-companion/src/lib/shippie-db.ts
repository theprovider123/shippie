import { validateGroupPlan, type GroupPlan } from './group-plan';
import type { BusMarker } from './bus';
import { dedupeFanEvents, isActive, sortEvents, validateFanEvent, type FanEvent } from './fan-events';

type TableName = 'group_plan' | 'bus_marker' | 'fan_event';

interface LocalDb {
  create(table: string, schema: Record<string, string>): Promise<void>;
  insert<T extends Record<string, unknown>>(table: string, value: T): Promise<void>;
  query<T extends Record<string, unknown>>(table: string, opts?: QueryOptions): Promise<T[]>;
  update?<T extends Record<string, unknown>>(table: string, id: string, patch: Partial<T>): Promise<void>;
  delete?(table: string, id: string): Promise<void>;
}

interface QueryOptions {
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
}

interface ShippieGlobal {
  local?: { db?: LocalDb };
  install?: { prompt?: () => Promise<unknown> | unknown };
}

declare global {
  interface Window {
    shippie?: ShippieGlobal;
  }
}

const schemas: Record<TableName, Record<string, string>> = {
  group_plan: {
    id: 'text primary key',
    payload: 'json not null',
    updated_at: 'datetime',
  },
  bus_marker: {
    id: 'text primary key',
    kind: 'text not null',
    lng: 'real',
    lat: 'real',
    accuracy_m: 'real',
    segment_id: 'text',
    segment_index: 'integer',
    snapped_lng: 'real',
    snapped_lat: 'real',
    source: 'text',
    created_at: 'datetime',
  },
  fan_event: {
    id: 'text primary key',
    type: 'text not null',
    source_id: 'text not null',
    source: 'text not null',
    lng: 'real',
    lat: 'real',
    accuracy_m: 'real',
    segment_id: 'text',
    segment_index: 'integer',
    snapped_lng: 'real',
    snapped_lat: 'real',
    created_at: 'datetime',
    expires_at: 'datetime',
  },
};

let ensured = false;
const MAX_STORED_FAN_EVENTS = 120;

export async function ensureParadeTables(): Promise<void> {
  if (ensured) return;
  const db = resolveDb();
  await Promise.all(Object.entries(schemas).map(([table, schema]) => db.create(table, schema)));
  ensured = true;
}

export async function saveGroupPlan(plan: GroupPlan): Promise<void> {
  await ensureParadeTables();
  await resolveDb().insert('group_plan', {
    id: 'current',
    payload: plan as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  });
}

export async function loadGroupPlan(): Promise<GroupPlan | null> {
  await ensureParadeTables();
  const rows = await resolveDb().query<Record<string, unknown>>('group_plan', {
    where: { id: 'current' },
    limit: 1,
  });
  const row = rows[0];
  if (!row) return null;
  // The Shippie container bridge auto-unwraps a `payload` column to the row
  // itself; the localStorage fallback returns the raw row. Accept both, and
  // validate so a corrupt stored record cannot break the app on load.
  const candidate = row.payload && typeof row.payload === 'object' ? row.payload : row;
  return validateGroupPlan(candidate);
}

export async function clearGroupPlan(): Promise<void> {
  await ensureParadeTables();
  await resolveDb().delete?.('group_plan', 'current');
}

export async function saveBusMarker(marker: BusMarker): Promise<void> {
  await ensureParadeTables();
  await resolveDb().insert('bus_marker', marker as unknown as Record<string, unknown>);
}

export async function listBusMarkers(): Promise<BusMarker[]> {
  await ensureParadeTables();
  return resolveDb().query<BusMarker>('bus_marker', {
    orderBy: { created_at: 'desc' },
  });
}

export async function clearBusMarkers(): Promise<void> {
  await ensureParadeTables();
  const rows = await resolveDb().query<{ id: string }>('bus_marker');
  await Promise.all(rows.map((row) => resolveDb().delete?.('bus_marker', row.id)));
}

export async function saveFanEvent(event: FanEvent): Promise<void> {
  await ensureParadeTables();
  await resolveDb().insert('fan_event', event as unknown as Record<string, unknown>);
}

export async function saveFanEvents(events: FanEvent[]): Promise<void> {
  await ensureParadeTables();
  await Promise.all(events.map((event) => resolveDb().insert('fan_event', event as unknown as Record<string, unknown>)));
}

export async function listFanEvents(): Promise<FanEvent[]> {
  await ensureParadeTables();
  const db = resolveDb();
  const rows = await db.query<Record<string, unknown>>('fan_event', {
    orderBy: { created_at: 'desc' },
  });
  const active = sortEvents(dedupeFanEvents(rows.filter(validateFanEvent).filter((event) => isActive(event)))).slice(
    0,
    MAX_STORED_FAN_EVENTS,
  );
  const keepIds = new Set(active.map((event) => event.id));
  if (db.delete) {
    await Promise.all(
      rows
        .map((row) => String(row.id ?? ''))
        .filter((id) => id && !keepIds.has(id))
        .map((id) => db.delete?.('fan_event', id)),
    );
  }
  return active;
}

export async function clearFanEvents(): Promise<void> {
  await ensureParadeTables();
  const rows = await resolveDb().query<{ id: string }>('fan_event');
  await Promise.all(rows.map((row) => resolveDb().delete?.('fan_event', row.id)));
}

export function hasShippieLocalDb(): boolean {
  return Boolean(typeof window !== 'undefined' && window.shippie?.local?.db);
}

export function canPromptInstall(): boolean {
  return Boolean(typeof window !== 'undefined' && window.shippie?.install?.prompt);
}

export async function promptInstall(): Promise<void> {
  await window.shippie?.install?.prompt?.();
}

function resolveDb(): LocalDb {
  if (typeof window !== 'undefined' && window.shippie?.local?.db) return window.shippie.local.db;
  return fallbackLocalDb;
}

const fallbackLocalDb: LocalDb = {
  async create(table) {
    if (typeof localStorage === 'undefined') return;
    const key = tableKey(table);
    if (!localStorage.getItem(key)) localStorage.setItem(key, '[]');
  },
  async insert(table, value) {
    const rows = readRows(table);
    const id = String(value.id);
    const next = [value, ...rows.filter((row) => String(row.id) !== id)];
    writeRows(table, next);
  },
  async query<T extends Record<string, unknown>>(table: string, opts: QueryOptions = {}) {
    let rows = readRows(table);
    if (opts.where) {
      rows = rows.filter((row) =>
        Object.entries(opts.where ?? {}).every(([key, value]) => row[key] === value),
      );
    }
    if (opts.orderBy) {
      const [key, dir] = Object.entries(opts.orderBy)[0] ?? [];
      if (key) {
        rows.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')));
        if (dir === 'desc') rows.reverse();
      }
    }
    if (typeof opts.limit === 'number') rows = rows.slice(0, opts.limit);
    return rows as T[];
  },
  async update(table, id, patch) {
    const rows = readRows(table);
    writeRows(
      table,
      rows.map((row) => (String(row.id) === id ? { ...row, ...patch, id } : row)),
    );
  },
  async delete(table, id) {
    writeRows(
      table,
      readRows(table).filter((row) => String(row.id) !== id),
    );
  },
};

function tableKey(table: string): string {
  return `parade-companion:${table}`;
}

function readRows(table: string): Array<Record<string, unknown>> {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(tableKey(table));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((row) => row && typeof row === 'object') : [];
  } catch {
    return [];
  }
}

function writeRows(table: string, rows: Array<Record<string, unknown>>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(tableKey(table), JSON.stringify(rows));
}
