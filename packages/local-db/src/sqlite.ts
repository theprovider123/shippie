import {
  MigrationError,
  quotaWarningLevel,
  type LocalDbBackupInfo,
  type LocalDbExportOptions,
  type LocalDbQueryOptions,
  type LocalDbRecord,
  type LocalDbSchema,
  type ShippieLocalDb,
} from '@shippie/local-runtime-contract';
import { encodeEncryptedBackup, decodeEncryptedBackup } from './backup.ts';
import { normalizeLocalDbSchema, normalizeTableName, type NormalizedColumn } from './schema.ts';

export type SqliteParam = string | number | boolean | null | Uint8Array | ArrayBuffer;

export interface SqliteEngine {
  run(sql: string, params?: SqliteParam[]): Promise<void>;
  all<T extends LocalDbRecord = LocalDbRecord>(sql: string, params?: SqliteParam[]): Promise<T[]>;
  exportDatabase?(): Promise<Blob>;
  usage?(): Promise<{ usedBytes: number; quotaBytes?: number; persisted?: boolean }>;
  requestPersistence?(): Promise<boolean>;
}

export interface SqliteLocalDbOptions {
  appId?: string;
  schemaVersion?: number;
}

interface TableSchema {
  raw: LocalDbSchema;
  columns: NormalizedColumn[];
  fts?: FtsState;
}

interface FtsState {
  table: string;
  columns: NormalizedColumn[];
}

export function createSqliteLocalDb(engine: SqliteEngine, opts: SqliteLocalDbOptions = {}): ShippieLocalDb {
  return new SqliteLocalDb(engine, opts);
}

class SqliteLocalDb implements ShippieLocalDb {
  private readonly schemas = new Map<string, TableSchema>();
  private lastBackupInfo: LocalDbBackupInfo | null = null;

  constructor(
    private readonly engine: SqliteEngine,
    private readonly opts: SqliteLocalDbOptions,
  ) {}

  async create(table: string, schema: LocalDbSchema): Promise<void> {
    await this.ensureMeta();
    const name = normalizeTableName(table);
    const columns = normalizeLocalDbSchema(schema);
    const defs = columns.map((column) => `${ident(column.name)} ${sqliteType(column)}${constraintSql(column)}`);
    await this.engine.run(`CREATE TABLE IF NOT EXISTS ${ident(name)} (${defs.join(', ')})`);
    await this.migrateMissingColumns(name, columns);
    const tableSchema: TableSchema = { raw: schema, columns };
    tableSchema.fts = await this.createFtsIndex(name, tableSchema);
    this.schemas.set(name, tableSchema);
  }

  async insert<T extends LocalDbRecord>(table: string, value: T): Promise<void> {
    const schema = this.getSchema(table);
    const keys = schema.columns.filter((column) => Object.hasOwn(value, column.name));
    if (keys.length === 0) throw new Error('insert requires at least one known column');
    const sql = `INSERT INTO ${ident(normalizeTableName(table))} (${keys.map((column) => ident(column.name)).join(', ')}) VALUES (${keys
      .map(() => '?')
      .join(', ')})`;
    await this.engine.run(sql, keys.map((column) => encodeValue(value[column.name], column)));
    await this.insertFtsRow(normalizeTableName(table), schema, String(value.id ?? ''));
  }

  async query<T extends LocalDbRecord = LocalDbRecord>(table: string, opts: LocalDbQueryOptions = {}): Promise<T[]> {
    const schema = this.getSchema(table);
    const built = buildSelect(normalizeTableName(table), schema, opts);
    const rows = await this.engine.all<T>(built.sql, built.params);
    return rows.map((row) => decodeRow(row, schema) as T);
  }

  async search<T extends LocalDbRecord = LocalDbRecord>(
    table: string,
    query: string,
    opts: LocalDbQueryOptions = {},
  ): Promise<T[]> {
    const schema = this.getSchema(table);
    if (schema.fts) {
      const rows = await this.ftsSearch<T>(normalizeTableName(table), schema, query, opts);
      return rows.map((row) => decodeRow(row, schema) as T);
    }
    const searchable = schema.columns.filter(
      (column) => column.name !== 'id' && (column.baseType === 'text' || column.baseType === 'json'),
    );
    const clauses = searchable.map((column) => `LOWER(CAST(${ident(column.name)} AS TEXT)) LIKE ?`);
    const params = searchable.map(() => `%${query.toLowerCase()}%`);
    const built = buildSelect(normalizeTableName(table), schema, opts, clauses.length ? `(${clauses.join(' OR ')})` : '0', params);
    const rows = await this.engine.all<T>(built.sql, built.params);
    return rows.map((row) => decodeRow(row, schema) as T);
  }

  async vectorSearch<T extends LocalDbRecord = LocalDbRecord>(
    table: string,
    vector: Float32Array,
    opts: { limit?: number; column?: string } = {},
  ): Promise<Array<T & { score: number }>> {
    const column = opts.column ?? 'embedding';
    const rows = await this.query<T>(table);
    return rows
      .map((row) => ({ row, score: cosine(vector, toFloat32(row[column])) }))
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? 10)
      .map((item) => ({ ...item.row, score: item.score }));
  }

  async update<T extends LocalDbRecord>(table: string, id: string, patch: Partial<T>): Promise<void> {
    const schema = this.getSchema(table);
    const keys = schema.columns.filter((column) => column.name !== 'id' && Object.hasOwn(patch, column.name));
    if (keys.length === 0) return;
    const sql = `UPDATE ${ident(normalizeTableName(table))} SET ${keys.map((column) => `${ident(column.name)} = ?`).join(', ')} WHERE ${ident('id')} = ?`;
    await this.engine.run(sql, [...keys.map((column) => encodeValue(patch[column.name], column)), id]);
    await this.replaceFtsRow(normalizeTableName(table), schema, id);
  }

  async delete(table: string, id: string): Promise<void> {
    const schema = this.getSchema(table);
    await this.engine.run(`DELETE FROM ${ident(normalizeTableName(table))} WHERE ${ident('id')} = ?`, [id]);
    if (schema.fts) await this.engine.run(`DELETE FROM ${ident(schema.fts.table)} WHERE ${ident('id')} = ?`, [id]);
  }

  async count(table: string, opts: Pick<LocalDbQueryOptions, 'where'> = {}): Promise<number> {
    const schema = this.getSchema(table);
    const where = buildWhere(schema, opts.where);
    const rows = await this.engine.all<{ n: number | string }>(
      `SELECT COUNT(*) AS n FROM ${ident(normalizeTableName(table))}${where.sql}`,
      where.params,
    );
    return Number(rows[0]?.n ?? 0);
  }

  async export(table: string, opts: LocalDbExportOptions = {}): Promise<Blob> {
    const schema = this.getSchema(table);
    if (opts.format === 'sqlite') {
      if (!this.engine.exportDatabase) throw new Error('sqlite export is not supported by this engine');
      return this.engine.exportDatabase();
    }
    const rows = await this.query(table, opts);
    const payload = new TextEncoder().encode(JSON.stringify({ table, schema: schema.raw, rows }));
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
      await this.create(payload.table, payload.schema);
      await this.engine.run(`DELETE FROM ${ident(normalizeTableName(payload.table))}`);
      for (const row of payload.rows) await this.insert(payload.table, row);
      this.lastBackupInfo = info;
    }
    return info;
  }

  async lastBackup(): Promise<LocalDbBackupInfo | null> {
    return this.lastBackupInfo;
  }

  async usage(): Promise<{ usedBytes: number; quotaBytes?: number; persisted?: boolean; warningLevel?: 'none' | 'high' | 'critical' }> {
    const usage = (await this.engine.usage?.()) ?? { usedBytes: 0 };
    return {
      ...usage,
      warningLevel: quotaWarningLevel(usage.usedBytes, usage.quotaBytes),
    };
  }

  async requestPersistence(): Promise<boolean> {
    return (await this.engine.requestPersistence?.()) ?? false;
  }

  private getSchema(table: string): TableSchema {
    const name = normalizeTableName(table);
    const schema = this.schemas.get(name);
    if (!schema) throw new Error(`Unknown table: ${name}. Call db.create() before using it.`);
    return schema;
  }

  private async createFtsIndex(table: string, schema: TableSchema): Promise<FtsState | undefined> {
    const searchable = schema.columns.filter(
      (column) => column.name !== 'id' && (column.baseType === 'text' || column.baseType === 'json'),
    );
    if (!searchable.length || !schema.columns.some((column) => column.name === 'id')) return undefined;
    const fts: FtsState = {
      table: ftsTableName(table),
      columns: searchable,
    };
    try {
      const ftsColumns = [ident('id'), ...searchable.map((column) => ident(column.name))].join(', ');
      await this.engine.run(`CREATE VIRTUAL TABLE IF NOT EXISTS ${ident(fts.table)} USING fts5(${ident('id')} UNINDEXED, ${searchable
        .map((column) => ident(column.name))
        .join(', ')})`);
      await this.engine.run(`DELETE FROM ${ident(fts.table)}`);
      await this.engine.run(
        `INSERT INTO ${ident(fts.table)} (${ftsColumns}) SELECT ${ftsColumns} FROM ${ident(table)}`,
      );
      return fts;
    } catch {
      return undefined;
    }
  }

  private async migrateMissingColumns(table: string, columns: NormalizedColumn[]): Promise<void> {
    const existing = await this.engine.all<{ name: string }>(`PRAGMA table_info(${ident(table)})`);
    const existingNames = new Set(existing.map((column) => column.name));
    for (const column of columns) {
      if (existingNames.has(column.name)) continue;
      const constraints = constraintSql(column);
      if (/\b(primary\s+key|unique)\b/i.test(constraints)) {
        throw new MigrationError(`Cannot auto-add constrained column ${column.name}; export, migrate manually, and restore`);
      }
      await this.engine.run(`ALTER TABLE ${ident(table)} ADD COLUMN ${ident(column.name)} ${sqliteType(column)}${constraints}`);
    }
  }

  private async ensureMeta(): Promise<void> {
    await this.engine.run(`CREATE TABLE IF NOT EXISTS ${ident('__shippie_meta')} (${ident('key')} TEXT PRIMARY KEY, ${ident('value')} TEXT NOT NULL)`);
    await this.upsertMeta('appId', this.opts.appId ?? 'local-app');
    await this.upsertMeta('schemaVersion', String(this.opts.schemaVersion ?? 1));
    await this.upsertMeta('updatedAt', new Date().toISOString());
  }

  private async upsertMeta(key: string, value: string): Promise<void> {
    await this.engine.run(
      `INSERT INTO ${ident('__shippie_meta')} (${ident('key')}, ${ident('value')}) VALUES (?, ?) ON CONFLICT(${ident('key')}) DO UPDATE SET ${ident(
        'value',
      )} = excluded.${ident('value')}`,
      [key, value],
    );
  }

  private async insertFtsRow(table: string, schema: TableSchema, id: string): Promise<void> {
    if (!schema.fts || !id) return;
    const columns = [ident('id'), ...schema.fts.columns.map((column) => ident(column.name))].join(', ');
    await this.engine.run(
      `INSERT INTO ${ident(schema.fts.table)} (${columns}) SELECT ${columns} FROM ${ident(table)} WHERE ${ident('id')} = ?`,
      [id],
    );
  }

  private async replaceFtsRow(table: string, schema: TableSchema, id: string): Promise<void> {
    if (!schema.fts) return;
    await this.engine.run(`DELETE FROM ${ident(schema.fts.table)} WHERE ${ident('id')} = ?`, [id]);
    await this.insertFtsRow(table, schema, id);
  }

  private async ftsSearch<T extends LocalDbRecord>(
    table: string,
    schema: TableSchema,
    query: string,
    opts: LocalDbQueryOptions,
  ): Promise<T[]> {
    if (!schema.fts) return [];
    const ftsQuery = toFtsQuery(query);
    if (!ftsQuery) return [];
    const where = buildWhere(schema, opts.where, 'base');
    const clauses = [`${ident(schema.fts.table)} MATCH ?`, where.sql ? where.sql.slice(' WHERE '.length) : ''].filter(Boolean);
    const order = buildOrder(schema, opts.orderBy, 'base');
    const limit = opts.limit === undefined ? '' : ' LIMIT ?';
    const offset = opts.offset === undefined ? '' : ' OFFSET ?';
    return this.engine.all<T>(
      `SELECT base.* FROM ${ident(table)} AS base JOIN ${ident(schema.fts.table)} ON ${ident(schema.fts.table)}.${ident('id')} = base.${ident('id')} WHERE ${clauses.join(
        ' AND ',
      )}${order}${limit}${offset}`,
      [
        ftsQuery,
        ...where.params,
        ...(opts.limit === undefined ? [] : [opts.limit]),
        ...(opts.offset === undefined ? [] : [opts.offset]),
      ],
    );
  }
}

function buildSelect(
  table: string,
  schema: TableSchema,
  opts: LocalDbQueryOptions,
  extraWhere?: string,
  extraParams: SqliteParam[] = [],
): { sql: string; params: SqliteParam[] } {
  const where = buildWhere(schema, opts.where);
  const clauses = [where.sql ? where.sql.slice(' WHERE '.length) : '', extraWhere ?? ''].filter(Boolean);
  const order = buildOrder(schema, opts.orderBy);
  const limit = opts.limit === undefined ? '' : ' LIMIT ?';
  const offset = opts.offset === undefined ? '' : ' OFFSET ?';
  return {
    sql: `SELECT * FROM ${ident(table)}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''}${order}${limit}${offset}`,
    params: [
      ...where.params,
      ...extraParams,
      ...(opts.limit === undefined ? [] : [opts.limit]),
      ...(opts.offset === undefined ? [] : [opts.offset]),
    ],
  };
}

function buildWhere(schema: TableSchema, where: Record<string, unknown> = {}, qualifier?: string): { sql: string; params: SqliteParam[] } {
  const clauses: string[] = [];
  const params: SqliteParam[] = [];
  for (const [key, expected] of Object.entries(where)) {
    const column = getColumn(schema, key);
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const ops = expected as Record<string, unknown>;
      for (const [op, sqlOp] of [
        ['gte', '>='],
        ['lte', '<='],
        ['gt', '>'],
        ['lt', '<'],
      ] as const) {
        if (op in ops) {
          clauses.push(`${qualifiedIdent(key, qualifier)} ${sqlOp} ?`);
          params.push(encodeValue(ops[op], column));
        }
      }
      continue;
    }
    clauses.push(`${qualifiedIdent(key, qualifier)} = ?`);
    params.push(encodeValue(expected, column));
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
}

function buildOrder(schema: TableSchema, orderBy: Record<string, 'asc' | 'desc'> = {}, qualifier?: string): string {
  const first = Object.entries(orderBy)[0];
  if (!first) return '';
  const [key, direction] = first;
  getColumn(schema, key);
  return ` ORDER BY ${qualifiedIdent(key, qualifier)} ${direction.toUpperCase()}`;
}

function getColumn(schema: TableSchema, name: string): NormalizedColumn {
  const column = schema.columns.find((candidate) => candidate.name === name);
  if (!column) throw new Error(`Unknown column: ${name}`);
  return column;
}

function sqliteType(column: NormalizedColumn): string {
  if (column.baseType === 'integer') return 'INTEGER';
  if (column.baseType === 'real') return 'REAL';
  if (column.baseType === 'blob') return 'BLOB';
  return 'TEXT';
}

function constraintSql(column: NormalizedColumn): string {
  return column.constraints ? ` ${column.constraints.toUpperCase()}` : '';
}

function encodeValue(value: unknown, column: NormalizedColumn): SqliteParam {
  if (value == null) return null;
  if (column.baseType === 'json') return JSON.stringify(value);
  if (column.baseType === 'blob') return encodeBlobValue(value);
  if (column.baseType === 'integer' || column.baseType === 'real') return Number(value);
  if (column.baseType === 'datetime') return value instanceof Date ? value.toISOString() : String(value);
  return String(value);
}

function encodeBlobValue(value: unknown): SqliteParam {
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return value;
  if (value instanceof Float32Array) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  if (Array.isArray(value)) return new Uint8Array(new Float32Array(value.map(Number)).buffer);
  return String(value);
}

function decodeRow(row: LocalDbRecord, schema: TableSchema): LocalDbRecord {
  const next: LocalDbRecord = { ...row };
  for (const column of schema.columns) {
    if (!(column.name in next)) continue;
    if (column.baseType === 'json' && typeof next[column.name] === 'string') {
      next[column.name] = JSON.parse(next[column.name] as string);
    }
    if (column.baseType === 'blob') {
      next[column.name] = decodeBlobValue(next[column.name]);
    }
  }
  return next;
}

function decodeBlobValue(value: unknown): unknown {
  if (value instanceof Float32Array) return value;
  if (value instanceof Uint8Array && value.byteLength % 4 === 0) {
    return new Float32Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  return value;
}

function toFloat32(value: unknown): Float32Array {
  if (value instanceof Float32Array) return value;
  if (value instanceof Uint8Array && value.byteLength % 4 === 0) {
    return new Float32Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
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

function ident(name: string): string {
  return `"${normalizeTableName(name)}"`;
}

function qualifiedIdent(name: string, qualifier?: string): string {
  return qualifier ? `${ident(qualifier)}.${ident(name)}` : ident(name);
}

function ftsTableName(table: string): string {
  return `__shippie_fts_${normalizeTableName(table)}`;
}

function toFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/"/g, '""'))
    .filter(Boolean)
    .map((term) => `"${term}"`)
    .join(' ');
}
