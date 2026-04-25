/**
 * Resolve the local DB. In production it comes from the Shippie runtime
 * (`window.shippie.local.db`). For dev/standalone we fall back to a
 * lightweight in-memory implementation.
 */
import type {
  LocalDbBackupInfo,
  LocalDbExportOptions,
  LocalDbQueryOptions,
  LocalDbRecord,
  LocalDbSchema,
  LocalDbUsage,
  ShippieLocalDb,
} from '@shippie/local-runtime-contract';

interface MemoryTable {
  schema: LocalDbSchema;
  rows: Map<string, LocalDbRecord>;
}

export class MemoryLocalDb implements ShippieLocalDb {
  private readonly tables = new Map<string, MemoryTable>();

  async create(table: string, schema: LocalDbSchema): Promise<void> {
    if (!this.tables.has(table)) this.tables.set(table, { schema, rows: new Map() });
  }

  async insert<T extends LocalDbRecord>(table: string, value: T): Promise<void> {
    const t = this.must(table);
    const id = String(value.id ?? cryptoRandomId());
    t.rows.set(id, { ...value, id });
  }

  async query<T extends LocalDbRecord = LocalDbRecord>(
    table: string,
    opts: LocalDbQueryOptions = {},
  ): Promise<T[]> {
    const t = this.must(table);
    let rows = [...t.rows.values()];
    if (opts.where) rows = rows.filter((r) => matchesWhere(r, opts.where!));
    if (opts.orderBy) {
      const [key, dir] = Object.entries(opts.orderBy)[0]!;
      rows.sort((a, b) => compareValues(a[key], b[key]) * (dir === 'desc' ? -1 : 1));
    }
    if (opts.offset) rows = rows.slice(opts.offset);
    if (opts.limit !== undefined) rows = rows.slice(0, opts.limit);
    return rows as T[];
  }

  async search<T extends LocalDbRecord = LocalDbRecord>(
    table: string,
    query: string,
    opts: LocalDbQueryOptions = {},
  ): Promise<T[]> {
    const q = query.toLowerCase();
    const all = await this.query<T>(table, opts);
    return all.filter((row) =>
      Object.values(row).some((v) => typeof v === 'string' && v.toLowerCase().includes(q)),
    );
  }

  async vectorSearch<T extends LocalDbRecord = LocalDbRecord>(
    table: string,
    vector: Float32Array,
    opts: { limit?: number; column?: string } = {},
  ): Promise<Array<T & { score: number }>> {
    const column = opts.column ?? 'embedding';
    const all = await this.query<T>(table);
    return all
      .map((row) => ({ ...row, score: cosine(vector, toFloat32(row[column])) }))
      .filter((r) => Number.isFinite(r.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? 10);
  }

  async update<T extends LocalDbRecord>(table: string, id: string, patch: Partial<T>): Promise<void> {
    const t = this.must(table);
    const existing = t.rows.get(id);
    if (!existing) return;
    t.rows.set(id, { ...existing, ...patch, id });
  }

  async delete(table: string, id: string): Promise<void> {
    this.must(table).rows.delete(id);
  }

  async count(table: string, opts: Pick<LocalDbQueryOptions, 'where'> = {}): Promise<number> {
    const rows = await this.query(table, opts);
    return rows.length;
  }

  async export(table: string): Promise<Blob> {
    const rows = await this.query(table);
    return new Blob([JSON.stringify({ table, rows })], { type: 'application/json' });
  }

  async restore(): Promise<LocalDbBackupInfo> {
    return { createdAt: new Date().toISOString(), appId: 'journal-memory', schemaVersion: 1, encrypted: false };
  }

  async lastBackup(): Promise<LocalDbBackupInfo | null> {
    return null;
  }

  async usage(): Promise<LocalDbUsage> {
    let bytes = 0;
    for (const t of this.tables.values()) {
      for (const row of t.rows.values()) bytes += JSON.stringify(row).length;
    }
    return { usedBytes: bytes, warningLevel: 'none' };
  }

  async requestPersistence(): Promise<boolean> {
    return false;
  }

  private must(table: string): MemoryTable {
    const t = this.tables.get(table);
    if (!t) throw new Error(`Unknown table: ${table}. Call create() first.`);
    return t;
  }
}

function matchesWhere(row: LocalDbRecord, where: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const ops = expected as Record<string, unknown>;
      const v = row[key] as number | string | undefined;
      if (v === undefined) return false;
      if ('gte' in ops && Number(v) < Number(ops.gte)) return false;
      if ('lte' in ops && Number(v) > Number(ops.lte)) return false;
      if ('gt' in ops && Number(v) <= Number(ops.gt)) return false;
      if ('lt' in ops && Number(v) >= Number(ops.lt)) return false;
      continue;
    }
    if (row[key] !== expected) return false;
  }
  return true;
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || a.length !== b.length) return Number.NaN;
  let dot = 0;
  let an = 0;
  let bn = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    dot += av * bv;
    an += av * av;
    bn += bv * bv;
  }
  return dot / (Math.sqrt(an) * Math.sqrt(bn));
}

function toFloat32(value: unknown): Float32Array {
  if (value instanceof Float32Array) return value;
  if (Array.isArray(value)) return new Float32Array(value.map(Number));
  return new Float32Array();
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

let memoryDb: ShippieLocalDb | null = null;

interface ShippieGlobal {
  local?: { db?: ShippieLocalDb };
}

export function resolveLocalDb(): ShippieLocalDb {
  if (typeof window !== 'undefined') {
    const shippie = (window as unknown as { shippie?: ShippieGlobal }).shippie;
    if (shippie?.local?.db) return shippie.local.db;
  }
  if (!memoryDb) memoryDb = new MemoryLocalDb();
  return memoryDb;
}
