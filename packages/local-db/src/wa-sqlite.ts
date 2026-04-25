import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import SQLiteAsyncESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import * as SQLite from 'wa-sqlite';
// wa-sqlite ships this browser VFS as JS without declarations.
// @ts-expect-error missing upstream declaration for the example VFS subpath
import { OriginPrivateFileSystemVFS } from 'wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js';
import type { SqliteEngine, SqliteParam } from './sqlite.ts';

type SQLiteCompatible = number | string | Uint8Array | number[] | bigint | null;

interface SQLiteApi {
  open_v2(filename: string, flags?: number, vfs?: string): Promise<number>;
  close(db: number): Promise<number>;
  run(db: number, sql: string, params?: SQLiteCompatible[]): Promise<number>;
  execWithParams(db: number, sql: string, params?: SQLiteCompatible[]): Promise<{ rows: unknown[][]; columns: string[] }>;
  vfs_register?(vfs: unknown, makeDefault?: boolean): number;
}

export interface WaSqliteEngineOptions {
  filename?: string;
  opfs?: boolean;
  wasmUrl?: string;
}

export class WaSqliteEngine implements SqliteEngine {
  private constructor(
    private readonly sqlite3: SQLiteApi,
    private readonly db: number,
    private readonly vfs?: { close?: () => Promise<void> },
  ) {}

  static async open(opts: WaSqliteEngineOptions = {}): Promise<WaSqliteEngine> {
    const moduleFactory = opts.opfs ? SQLiteAsyncESMFactory : SQLiteESMFactory;
    const module = await moduleFactory(locateWasm(opts.wasmUrl));
    const sqlite3 = SQLite.Factory(module) as SQLiteApi;
    let vfs: { name: string; close?: () => Promise<void> } | undefined;
    if (opts.opfs) {
      vfs = new OriginPrivateFileSystemVFS();
      sqlite3.vfs_register?.(vfs, false);
    }
    const db = await sqlite3.open_v2(opts.filename ?? ':memory:', undefined, vfs?.name);
    return new WaSqliteEngine(sqlite3, db, vfs);
  }

  async run(sql: string, params: SqliteParam[] = []): Promise<void> {
    await this.sqlite3.run(this.db, sql, params.map(toSQLiteCompatible));
  }

  async all<T extends Record<string, unknown>>(sql: string, params: SqliteParam[] = []): Promise<T[]> {
    const result = await this.sqlite3.execWithParams(this.db, sql, params.map(toSQLiteCompatible));
    return result.rows.map((row) => {
      const out: Record<string, unknown> = {};
      result.columns.forEach((column, index) => {
        out[column] = row[index];
      });
      return out as T;
    });
  }

  async usage(): Promise<{ usedBytes: number; quotaBytes?: number; persisted?: boolean }> {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') {
      return { usedBytes: 0 };
    }
    const estimate = await navigator.storage.estimate();
    return {
      usedBytes: estimate.usage ?? 0,
      quotaBytes: estimate.quota,
      persisted: undefined,
    };
  }

  async requestPersistence(): Promise<boolean> {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') return false;
    return navigator.storage.persist();
  }

  async close(): Promise<void> {
    await this.sqlite3.close(this.db);
    await this.vfs?.close?.();
  }
}

export async function createWaSqliteEngine(opts: WaSqliteEngineOptions = {}): Promise<WaSqliteEngine> {
  return WaSqliteEngine.open(opts);
}

function locateWasm(wasmUrl?: string): object | undefined {
  if (!wasmUrl) return undefined;
  return {
    locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path),
  };
}

function toSQLiteCompatible(value: SqliteParam): SQLiteCompatible {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}
