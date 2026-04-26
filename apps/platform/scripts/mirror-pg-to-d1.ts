#!/usr/bin/env bun
/**
 * One-shot mirror script: Postgres (Neon) → D1.
 *
 * Reads each table from `DATABASE_URL`, transforms rows per the type
 * hints in mirror-tables.ts, and bulk-inserts into the remote D1
 * database via `wrangler d1 execute --remote --command="..."`.
 *
 * Usage:
 *   DATABASE_URL=postgres://... bun run scripts/mirror-pg-to-d1.ts
 *   DATABASE_URL=postgres://... bun run scripts/mirror-pg-to-d1.ts --dry-run
 *   DATABASE_URL=postgres://... bun run scripts/mirror-pg-to-d1.ts --table=users,apps
 *
 * Idempotent: uses INSERT OR REPLACE so re-runs upsert by primary key.
 *
 * Tunables (env):
 *   PAGE_SIZE        rows fetched per Postgres page         default 1000
 *   BATCH_SIZE       rows per D1 INSERT statement           default 100
 *   D1_DB_NAME       D1 database name (wrangler.toml)       default shippie-platform-d1
 *
 * NOTE: this script does not handle the dual-write reconciliation
 * scenario; it's a one-shot snapshot. After cutover the SvelteKit
 * platform owns the D1 database and Neon is decommissioned.
 */

import { spawn } from 'node:child_process';
import postgres from 'postgres';
import { TABLE_SPECS, type TableSpec } from './mirror-tables';
import { transformRow, buildInsertSql } from './mirror-transforms';

const PAGE_SIZE = Number(process.env.PAGE_SIZE ?? 1000);
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 100);
const D1_DB_NAME = process.env.D1_DB_NAME ?? 'shippie-platform-d1';

interface CliFlags {
  dryRun: boolean;
  tables: ReadonlySet<string> | null;
}

function parseArgs(argv: readonly string[]): CliFlags {
  let dryRun = false;
  let tables: Set<string> | null = null;
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--table=')) {
      tables = new Set(arg.slice('--table='.length).split(',').map((s) => s.trim()).filter(Boolean));
    }
  }
  return { dryRun, tables };
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[mirror] DATABASE_URL is required.');
    process.exit(1);
  }

  console.log(`[mirror] connecting to Postgres (dry-run=${flags.dryRun})`);
  const sql = postgres(databaseUrl, { max: 4, idle_timeout: 10, prepare: false });

  let totalRows = 0;
  let totalTables = 0;
  try {
    for (const spec of TABLE_SPECS) {
      if (flags.tables && !flags.tables.has(spec.table)) continue;
      const rows = await mirrorTable(sql, spec, flags.dryRun);
      totalRows += rows;
      totalTables += 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(`[mirror] complete — ${totalRows} rows across ${totalTables} tables.`);
}

async function mirrorTable(
  sql: postgres.Sql,
  spec: TableSpec,
  dryRun: boolean,
): Promise<number> {
  const { table, columns, whereClause } = spec;
  const totalQuery = whereClause
    ? `SELECT COUNT(*)::int AS n FROM "${table}" WHERE ${whereClause}`
    : `SELECT COUNT(*)::int AS n FROM "${table}"`;
  const [{ n: total }] = await sql.unsafe<[{ n: number }]>(totalQuery);
  if (total === 0) {
    console.log(`[mirror] ${table}: 0 rows (skipped)`);
    return 0;
  }

  let offset = 0;
  let mirrored = 0;
  while (offset < total) {
    const pageQuery = whereClause
      ? `SELECT ${columns.map((c) => `"${c}"`).join(', ')} FROM "${table}" WHERE ${whereClause} ORDER BY 1 LIMIT ${PAGE_SIZE} OFFSET ${offset}`
      : `SELECT ${columns.map((c) => `"${c}"`).join(', ')} FROM "${table}" ORDER BY 1 LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
    const page = await sql.unsafe<Record<string, unknown>[]>(pageQuery);
    const transformed = page.map((row) => transformRow(row, spec));

    // D1 caps a single SQL statement at ~1 MB. We pack rows into a batch
    // up to MAX_STATEMENT_BYTES, and if any single row would exceed the
    // cap on its own (e.g. a deploy with a multi-MB autopackaging report),
    // we surface the row id and skip — better than failing the whole
    // table.
    const MAX_STATEMENT_BYTES = 900_000; // safety margin under 1 MB
    let i = 0;
    while (i < transformed.length) {
      const batch: typeof transformed = [];
      let bytes = 0;
      const overhead = `INSERT OR REPLACE INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES `.length + 2;
      bytes = overhead;
      while (i < transformed.length && batch.length < BATCH_SIZE) {
        const candidate = [...batch, transformed[i]!];
        const stmtSize = buildInsertSql(table, columns, candidate)?.length ?? 0;
        if (stmtSize > MAX_STATEMENT_BYTES) {
          if (batch.length === 0) {
            // single row exceeds the cap — skip with a warning
            const idCol = transformed[i]!.id ?? '<no-id>';
            console.warn(`[mirror] ${table}: skipping row id=${idCol} (size ${stmtSize} bytes > ${MAX_STATEMENT_BYTES})`);
            i++;
            continue;
          }
          break; // commit batch as-is, continue with this row in next batch
        }
        batch.push(transformed[i]!);
        bytes = stmtSize;
        i++;
      }
      if (batch.length === 0) continue;
      const stmt = buildInsertSql(table, columns, batch);
      if (!stmt) continue;
      if (dryRun) {
        if (mirrored === 0) {
          console.log(`[mirror] ${table}: dry-run preview\n${stmt.slice(0, 500)}…`);
        }
      } else {
        await execD1(stmt);
      }
      mirrored += batch.length;
    }

    offset += page.length;
    if (page.length === 0) break; // safety: shouldn't happen but avoids infinite loop
  }

  console.log(`[mirror] ${table}: ${mirrored}/${total} ✓`);
  return mirrored;
}

/**
 * Execute a SQL batch on the remote D1 database via wrangler.
 *
 * We write the SQL to a temp file and pass --file=, because passing
 * large SQL on argv hits macOS' ARG_MAX (~256 KB) for any batch with
 * JSON-heavy columns. --file= reads from disk and has no argv limit.
 */
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function execD1(sqlStatement: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'shippie-mirror-'));
  const file = join(dir, 'batch.sql');
  await writeFile(file, sqlStatement, 'utf8');

  try {
    const child = spawn(
      'bunx',
      [
        'wrangler',
        'd1',
        'execute',
        D1_DB_NAME,
        '--remote',
        `--file=${file}`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout?.on('data', () => {
      /* swallow — the JSON output is large and not interesting on success */
    });

    await new Promise<void>((resolve, reject) => {
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`wrangler d1 execute exited ${code}: ${stderr}`));
      });
      child.on('error', (err) => reject(err));
    });
  } finally {
    await unlink(file).catch(() => {});
  }
}

main().catch((err) => {
  console.error('[mirror] fatal:', err);
  process.exit(1);
});
