import {
  quotaWarningLevel,
  type LocalDbBackupInfo,
  type LocalDbQueryOptions,
  type LocalDbRecord,
  type LocalDbSchema,
  type ShippieLocalDb,
} from '@shippie/local-runtime-contract';
import { encodeEncryptedBackup, decodeEncryptedBackup } from './backup.ts';
import { normalizeLocalDbSchema, normalizeTableName } from './schema.ts';

interface TableState {
  schema: LocalDbSchema;
  rows: LocalDbRecord[];
}

export interface MemoryLocalDbOptions {
  appId?: string;
  schemaVersion?: number;
  quotaBytes?: number;
}

export function createMemoryLocalDb(opts: MemoryLocalDbOptions = {}): ShippieLocalDb {
  return new MemoryLocalDb(opts);
}

class MemoryLocalDb implements ShippieLocalDb {
  private readonly tables = new Map<string, TableState>();
  private lastBackupInfo: LocalDbBackupInfo | null = null;

  constructor(private readonly opts: MemoryLocalDbOptions) {}

  async create(table: string, schema: LocalDbSchema): Promise<void> {
    const name = normalizeTableName(table);
    normalizeLocalDbSchema(schema);
    if (!this.tables.has(name)) {
      this.tables.set(name, { schema, rows: [] });
    }
  }

  async insert<T extends LocalDbRecord>(table: string, value: T): Promise<void> {
    this.getTable(table).rows.push(structuredClone(value));
  }

  async query<T extends LocalDbRecord = LocalDbRecord>(table: string, opts: LocalDbQueryOptions = {}): Promise<T[]> {
    let rows = this.getTable(table).rows.filter((row) => matchesWhere(row, opts.where));
    if (opts.orderBy) rows = sortRows(rows, opts.orderBy);
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? rows.length;
    return rows.slice(offset, offset + limit).map((row) => structuredClone(row) as T);
  }

  async search<T extends LocalDbRecord = LocalDbRecord>(
    table: string,
    query: string,
    opts: LocalDbQueryOptions = {},
  ): Promise<T[]> {
    const needle = query.toLowerCase();
    const rows = this.getTable(table).rows.filter((row) =>
      Object.values(row).some((value) => JSON.stringify(value).toLowerCase().includes(needle)),
    );
    const sorted = opts.orderBy ? sortRows(rows, opts.orderBy) : rows;
    return sorted.slice(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? sorted.length)).map((row) => structuredClone(row) as T);
  }

  async vectorSearch<T extends LocalDbRecord = LocalDbRecord>(
    table: string,
    vector: Float32Array,
    opts: { limit?: number; column?: string } = {},
  ): Promise<Array<T & { score: number }>> {
    const column = opts.column ?? 'embedding';
    return this.getTable(table).rows
      .map((row) => ({ row, score: cosine(vector, toFloat32(row[column])) }))
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? 10)
      .map((item) => ({ ...(structuredClone(item.row) as T), score: item.score }));
  }

  async update<T extends LocalDbRecord>(table: string, id: string, patch: Partial<T>): Promise<void> {
    const row = this.getTable(table).rows.find((candidate) => candidate.id === id);
    if (!row) return;
    Object.assign(row, structuredClone(patch));
  }

  async delete(table: string, id: string): Promise<void> {
    const state = this.getTable(table);
    state.rows = state.rows.filter((row) => row.id !== id);
  }

  async count(table: string, opts: Pick<LocalDbQueryOptions, 'where'> = {}): Promise<number> {
    return this.getTable(table).rows.filter((row) => matchesWhere(row, opts.where)).length;
  }

  async export(table: string, opts: { format?: 'json' | 'sqlite' | 'shippiebak'; passphrase?: string } = {}): Promise<Blob> {
    const state = this.getTable(table);
    const payload = new TextEncoder().encode(JSON.stringify({ table, schema: state.schema, rows: state.rows }));
    if (opts.format === 'shippiebak') {
      if (!opts.passphrase) throw new Error('passphrase is required for shippiebak export');
      const encoded = await encodeEncryptedBackup({
        appId: this.opts.appId ?? 'local-app',
        schemaVersion: this.opts.schemaVersion ?? 1,
        tables: [table],
        plaintext: payload,
        passphrase: opts.passphrase,
      });
      this.lastBackupInfo = {
        createdAt: encoded.header.createdAt,
        appId: encoded.header.appId,
        schemaVersion: encoded.header.schemaVersion,
        encrypted: true,
        tables: encoded.header.tables,
        contentHash: encoded.header.contentHash,
      };
      return encoded.blob;
    }
    return new Blob([payload], { type: 'application/json' });
  }

  async restore(backup: Blob, opts: { passphrase?: string; dryRun?: boolean } = {}): Promise<LocalDbBackupInfo> {
    if (!opts.passphrase) throw new Error('passphrase is required for restore');
    const decoded = await decodeEncryptedBackup(backup, opts.passphrase);
    const payload = JSON.parse(new TextDecoder().decode(decoded.plaintext)) as {
      table: string;
      schema: LocalDbSchema;
      rows: LocalDbRecord[];
    };
    const info: LocalDbBackupInfo = {
      createdAt: decoded.header.createdAt,
      appId: decoded.header.appId,
      schemaVersion: decoded.header.schemaVersion,
      encrypted: true,
      tables: decoded.header.tables,
      contentHash: decoded.header.contentHash,
    };
    if (!opts.dryRun) {
      this.tables.set(payload.table, { schema: payload.schema, rows: payload.rows });
      this.lastBackupInfo = info;
    }
    return info;
  }

  async lastBackup(): Promise<LocalDbBackupInfo | null> {
    return this.lastBackupInfo;
  }

  async usage(): Promise<{ usedBytes: number; quotaBytes?: number; persisted?: boolean; warningLevel?: 'none' | 'high' | 'critical' }> {
    const usedBytes = new TextEncoder().encode(JSON.stringify([...this.tables.entries()])).byteLength;
    return {
      usedBytes,
      quotaBytes: this.opts.quotaBytes,
      persisted: false,
      warningLevel: quotaWarningLevel(usedBytes, this.opts.quotaBytes),
    };
  }

  async requestPersistence(): Promise<boolean> {
    return false;
  }

  private getTable(table: string): TableState {
    const name = normalizeTableName(table);
    const state = this.tables.get(name);
    if (!state) throw new Error(`Unknown table: ${name}`);
    return state;
  }
}

function matchesWhere(row: LocalDbRecord, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const ops = expected as Record<string, unknown>;
      if ('gte' in ops && !(Number(row[key]) >= Number(ops.gte))) return false;
      if ('lte' in ops && !(Number(row[key]) <= Number(ops.lte))) return false;
      if ('gt' in ops && !(Number(row[key]) > Number(ops.gt))) return false;
      if ('lt' in ops && !(Number(row[key]) < Number(ops.lt))) return false;
      return true;
    }
    return row[key] === expected;
  });
}

function sortRows(rows: LocalDbRecord[], orderBy: Record<string, 'asc' | 'desc'>): LocalDbRecord[] {
  const first = Object.entries(orderBy)[0];
  if (!first) return rows;
  const [key, direction] = first;
  if (!key) return rows;
  return [...rows].sort((a, b) => {
    const av = comparable(a[key]);
    const bv = comparable(b[key]);
    if (av === bv) return 0;
    if (av === null) return -1;
    if (bv === null) return 1;
    const result = av > bv ? 1 : -1;
    return direction === 'desc' ? -result : result;
  });
}

function comparable(value: unknown): string | number | boolean | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value == null) return null;
  return JSON.stringify(value);
}

function toFloat32(value: unknown): Float32Array {
  if (value instanceof Float32Array) return value;
  if (Array.isArray(value)) return new Float32Array(value.map(Number));
  return new Float32Array();
}

function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || a.length !== b.length) return Number.NaN;
  let dot = 0;
  let an = 0;
  let bn = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    an += a[i]! * a[i]!;
    bn += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(an) * Math.sqrt(bn));
}
