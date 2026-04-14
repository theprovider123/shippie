/**
 * Lightweight migration runner for Shippie.
 *
 * We write raw SQL migrations (packages/db/migrations/*.sql) instead of
 * letting drizzle-kit generate them from the TypeScript schema. This keeps
 * the migration file under human control for triggers, RLS policies,
 * partial unique indexes, generated columns, and anything else that
 * drizzle-kit would strip or reorder.
 *
 * The runner:
 *   1. Ensures `__shippie_migrations` ledger table exists
 *   2. Lists `.sql` files in migrations/, sorted lexicographically
 *   3. Skips any already applied by file name
 *   4. Applies each remaining file as a single exec() call
 *   5. Inserts a ledger row with the file's SHA-256 fingerprint
 *
 * Drift detection: on re-run, if a previously-applied file's hash changes,
 * the runner throws. Migrations must be immutable once applied.
 *
 * Driver-agnostic — works against both PGlite and postgres-js via the
 * ShippieDbHandle.exec() escape hatch.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { ShippieDbHandle } from './client.ts';

export interface MigrationFile {
  name: string;
  path: string;
  sql: string;
  hash: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export async function runMigrations(
  handle: ShippieDbHandle,
  migrationsDir: string,
  options: { log?: (msg: string) => void } = {},
): Promise<MigrationResult> {
  const log = options.log ?? (() => {});

  await ensureLedger(handle);

  const files = await loadMigrationFiles(migrationsDir);
  const applied = await listAppliedMigrations(handle);
  const appliedByName = new Map(applied.map((row) => [row.name, row.hash]));

  const result: MigrationResult = { applied: [], skipped: [] };

  for (const file of files) {
    const existingHash = appliedByName.get(file.name);
    if (existingHash != null) {
      if (existingHash !== file.hash) {
        throw new Error(
          `Migration drift: ${file.name} has hash ${file.hash} on disk but ` +
            `${existingHash} in __shippie_migrations. Migrations must be immutable.`,
        );
      }
      result.skipped.push(file.name);
      continue;
    }

    log(`applying ${file.name}`);
    await handle.exec(file.sql);
    await recordMigration(handle, file);
    result.applied.push(file.name);
  }

  return result;
}

async function ensureLedger(handle: ShippieDbHandle): Promise<void> {
  await handle.exec(`
    create table if not exists __shippie_migrations (
      name text primary key,
      hash text not null,
      applied_at timestamptz default now() not null
    );
  `);
}

async function loadMigrationFiles(dir: string): Promise<MigrationFile[]> {
  const entries = await readdir(dir);
  const sqlFiles = entries.filter((e) => e.endsWith('.sql')).sort();

  const out: MigrationFile[] = [];
  for (const name of sqlFiles) {
    const path = join(dir, name);
    const sql = await readFile(path, 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    out.push({ name, path, sql, hash });
  }
  return out;
}

async function listAppliedMigrations(
  handle: ShippieDbHandle,
): Promise<{ name: string; hash: string }[]> {
  // We can't easily use Drizzle here because the schema doesn't declare
  // __shippie_migrations — it's runner-internal. Use a tagged-template
  // fallback appropriate to each driver.
  if (handle.kind === 'pglite') {
    const client = (handle.db as unknown as { session: { client: { query: Function } } }).session
      .client;
    const rows = (await client.query('select name, hash from __shippie_migrations')) as {
      rows: { name: string; hash: string }[];
    };
    return rows.rows;
  }

  // postgres-js path
  const rowsModule = (handle.db as unknown as { session: { client: Function } }).session.client;
  const sql = rowsModule as unknown as (strings: TemplateStringsArray) => Promise<unknown>;
  const rows = (await sql`select name, hash from __shippie_migrations`) as unknown as {
    name: string;
    hash: string;
  }[];
  return rows;
}

async function recordMigration(handle: ShippieDbHandle, file: MigrationFile): Promise<void> {
  // Parameterized insert via raw driver — Drizzle doesn't know this table.
  if (handle.kind === 'pglite') {
    const client = (handle.db as unknown as { session: { client: { query: Function } } }).session
      .client;
    await client.query('insert into __shippie_migrations (name, hash) values ($1, $2)', [
      file.name,
      file.hash,
    ]);
    return;
  }

  const rowsModule = (handle.db as unknown as { session: { client: Function } }).session.client;
  const sql = rowsModule as unknown as (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
  await sql`insert into __shippie_migrations (name, hash) values (${file.name}, ${file.hash})`;
}
