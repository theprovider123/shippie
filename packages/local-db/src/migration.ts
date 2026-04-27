/**
 * Schema migration planning — Phase 5 of the master plan.
 *
 * Pure functional core: takes the declared schema (what the new app
 * version expects) and the local schema (what's already in the user's
 * SQLite db) plus an optional declared-migrations block from
 * shippie.json, and returns a structured plan.
 *
 * Critical invariant: maker code updates, user data persists. The
 * migration plan **never** drops or destroys data without an explicit
 * declaration in shippie.json. If the declared schema removes a column
 * that the local schema has, the engine returns it as a `blocked`
 * operation and the caller is expected to refuse the upgrade.
 *
 * The engine is independent of any SQLite binding so it can be unit
 * tested deterministically. The execution side (running ALTER TABLE on
 * wa-sqlite) is a thin wrapper over this plan.
 */

import type { NormalizedColumn } from './schema.ts';

/**
 * What the maker can declare in shippie.json under `migrations`.
 *
 * - rename:  oldName → newName for a column.
 * - drop:    column names safe to remove. The engine still keeps a
 *            shadow copy for 30 days under `_shadow_drops` so the user
 *            can roll back via the Your Data panel.
 * - transform: copy the value from one column into a (new) target,
 *              optionally keeping the source as a hidden read-only mirror.
 *
 * Anything not declared = additive only.
 */
export interface DeclaredMigrations {
  rename?: Record<string, string>;
  drop?: string[];
  transform?: Record<string, { to: string; copy?: boolean }>;
}

export type MigrationOp =
  | { kind: 'add_column'; sql: string; column: string }
  | { kind: 'drop_column'; sql: string; column: string; shadowSql: string }
  | { kind: 'rename_column'; sql: string; from: string; to: string }
  | { kind: 'transform_column'; sql: string; from: string; to: string; copy: boolean };

export interface BlockedMigration {
  /** What we tried to do. */
  intent: 'drop' | 'type_change' | 'destructive_rename';
  column: string;
  reason: string;
}

export interface MigrationPlan {
  /** Safe migrations the engine will run automatically. */
  additive: MigrationOp[];
  /** Declared destructive migrations. Run after additive succeeds. */
  destructive: MigrationOp[];
  /** Destructive operations the maker did NOT declare in shippie.json.
   *  The caller MUST refuse the upgrade when this list is non-empty. */
  blocked: BlockedMigration[];
  /** Counts for the maker-facing "X new, your data unchanged" card. */
  summary: {
    added: number;
    renamed: number;
    transformed: number;
    droppedToShadow: number;
    blocked: number;
  };
}

interface PlanInput {
  /** What the new app version expects. From normalizeLocalDbSchema(). */
  declared: NormalizedColumn[];
  /** What the user has in their local DB right now. */
  local: NormalizedColumn[];
  /** Optional `migrations` block from shippie.json. */
  migrations?: DeclaredMigrations;
  /** Table the columns belong to. Used for SQL generation. */
  table: string;
}

const SHADOW_TABLE = '_shippie_shadow_drops';

function escapeIdent(name: string): string {
  // Column / table identifiers come from validated names already
  // (normalizeColumnName), but we still quote everything for safety
  // so reserved words don't blow up the ALTER TABLE.
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Compute the migration plan. Pure: no I/O, no SQLite, no clock.
 *
 * Pre-conditions: declared and local arrays are pre-validated by
 * normalizeLocalDbSchema (table + column names already pattern-checked).
 */
export function planMigration(input: PlanInput): MigrationPlan {
  const declaredByName = new Map(input.declared.map((c) => [c.name, c]));
  const localByName = new Map(input.local.map((c) => [c.name, c]));
  const renameMap = input.migrations?.rename ?? {};
  const transformMap = input.migrations?.transform ?? {};
  const declaredDrops = new Set(input.migrations?.drop ?? []);

  const additive: MigrationOp[] = [];
  const destructive: MigrationOp[] = [];
  const blocked: BlockedMigration[] = [];

  // 1. Renames first — fold them into a "this column is now that
  // column" mapping so the rest of the diff treats them as the same.
  // The plan still emits the explicit ALTER statement.
  for (const [from, to] of Object.entries(renameMap)) {
    if (!localByName.has(from)) continue; // nothing to rename
    if (localByName.has(to)) {
      blocked.push({
        intent: 'destructive_rename',
        column: from,
        reason: `target column "${to}" already exists locally`,
      });
      continue;
    }
    destructive.push({
      kind: 'rename_column',
      sql: `ALTER TABLE ${escapeIdent(input.table)} RENAME COLUMN ${escapeIdent(from)} TO ${escapeIdent(to)};`,
      from,
      to,
    });
    // Treat the local column as if it were already renamed for the
    // additive diff below.
    const renamed = { ...localByName.get(from)!, name: to };
    localByName.delete(from);
    localByName.set(to, renamed);
  }

  // 2. Transforms — copy / move from old → new column.
  for (const [from, spec] of Object.entries(transformMap)) {
    if (!localByName.has(from)) continue;
    const declaredTarget = declaredByName.get(spec.to);
    if (!declaredTarget) continue; // nothing to transform into; ignore
    const sql = spec.copy
      ? `INSERT OR IGNORE INTO ${escapeIdent(input.table)} (${escapeIdent(spec.to)}) SELECT ${escapeIdent(from)} FROM ${escapeIdent(input.table)};`
      : `UPDATE ${escapeIdent(input.table)} SET ${escapeIdent(spec.to)} = ${escapeIdent(from)};`;
    destructive.push({
      kind: 'transform_column',
      sql,
      from,
      to: spec.to,
      copy: spec.copy ?? false,
    });
  }

  // 3. Diff: declared column not in local → additive ADD.
  for (const dc of input.declared) {
    if (localByName.has(dc.name)) continue;
    const constraint = dc.constraints ? ` ${dc.constraints}` : '';
    additive.push({
      kind: 'add_column',
      sql: `ALTER TABLE ${escapeIdent(input.table)} ADD COLUMN ${escapeIdent(dc.name)} ${dc.baseType}${constraint};`,
      column: dc.name,
    });
  }

  // 4. Diff: local column not in declared → drop or block.
  for (const lc of input.local) {
    // Skip shadow / metadata columns; never user-managed.
    if (lc.name.startsWith('_')) continue;
    // Already handled by rename/transform.
    if (renameMap[lc.name]) continue;
    if (declaredByName.has(lc.name)) continue;
    if (declaredDrops.has(lc.name)) {
      destructive.push({
        kind: 'drop_column',
        sql: `ALTER TABLE ${escapeIdent(input.table)} DROP COLUMN ${escapeIdent(lc.name)};`,
        column: lc.name,
        shadowSql:
          `INSERT INTO ${escapeIdent(SHADOW_TABLE)} ` +
          `(table_name, column_name, value_json, dropped_at) ` +
          `SELECT '${input.table.replace(/'/g, "''")}', '${lc.name.replace(/'/g, "''")}', ` +
          `json_object('value', ${escapeIdent(lc.name)}), datetime('now') ` +
          `FROM ${escapeIdent(input.table)};`,
      });
    } else {
      blocked.push({
        intent: 'drop',
        column: lc.name,
        reason: `column "${lc.name}" exists locally but not in the new schema; declare it in shippie.json migrations.drop to remove`,
      });
    }
  }

  // 5. Type change check — same name, different baseType is lossy.
  for (const dc of input.declared) {
    const lc = localByName.get(dc.name);
    if (!lc) continue;
    if (lc.baseType !== dc.baseType) {
      blocked.push({
        intent: 'type_change',
        column: dc.name,
        reason: `column "${dc.name}" type changed from ${lc.baseType} to ${dc.baseType}; type changes require a transform declaration`,
      });
    }
  }

  return {
    additive,
    destructive,
    blocked,
    summary: {
      added: additive.length,
      renamed: destructive.filter((o) => o.kind === 'rename_column').length,
      transformed: destructive.filter((o) => o.kind === 'transform_column').length,
      droppedToShadow: destructive.filter((o) => o.kind === 'drop_column').length,
      blocked: blocked.length,
    },
  };
}

/**
 * SQL needed to ensure the shadow table exists. Idempotent. The wrapper
 * runs this once before applying any drop_column op.
 */
export const ENSURE_SHADOW_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ${escapeIdent(
  SHADOW_TABLE,
)} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  value_json TEXT NOT NULL,
  dropped_at TEXT NOT NULL DEFAULT (datetime('now'))
);`;
