/**
 * Pure transformation helpers for the Postgres → D1 mirror.
 *
 * Kept in a separate module from mirror-pg-to-d1.ts so they can be
 * unit-tested without spinning up either DB connection.
 *
 * The Postgres `postgres` driver returns:
 *   - uuid columns as strings
 *   - jsonb columns as parsed objects/arrays
 *   - timestamp columns as JS Date instances
 *   - boolean columns as JS booleans
 *   - text[] columns as JS arrays of strings
 *   - bigint columns as either BigInt (default) or number (when configured)
 *
 * D1 expects values as one of:
 *   - string, number, boolean, null
 *
 * For the mirror we serialize to a SQL literal embedded in INSERT
 * statements, so every value becomes a string (literal) we splice in.
 * Bun's batch wrangler dispatch executes the statement directly.
 */

/** Columns that hold JSON data and should be JSON.stringify'd. */
export type JsonCol = string;

/** Columns whose Postgres type is timestamp / timestamptz. */
export type TimestampCol = string;

/** Columns whose Postgres type is boolean. */
export type BoolCol = string;

/** Columns whose Postgres type is text[] (array). Mirrored as JSON-typed text. */
export type ArrayCol = string;

/** Per-table column-type hints. Keep sorted alphabetically by table. */
export interface TableTransform {
  jsonCols: ReadonlySet<JsonCol>;
  timestampCols: ReadonlySet<TimestampCol>;
  boolCols: ReadonlySet<BoolCol>;
  arrayCols: ReadonlySet<ArrayCol>;
}

/**
 * Transform a single Postgres row into a row with values that line up
 * with the SQLite/D1 column types. Mutates a copy and returns it; does
 * not touch the input.
 */
export function transformRow(
  row: Record<string, unknown>,
  hints: TableTransform,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [col, val] of Object.entries(row)) {
    out[col] = transformValue(col, val, hints);
  }
  return out;
}

/**
 * Transform a single column value per the type hints. Pure function.
 * Exported for direct testing.
 */
export function transformValue(
  col: string,
  val: unknown,
  hints: TableTransform,
): unknown {
  if (val === null || val === undefined) return null;

  // Timestamps → ISO string.
  if (hints.timestampCols.has(col)) {
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'string') return new Date(val).toISOString();
    return null;
  }

  // Booleans → 1 / 0.
  if (hints.boolCols.has(col)) {
    return val === true || val === 1 || val === 't' ? 1 : 0;
  }

  // JSON → string.
  if (hints.jsonCols.has(col)) {
    if (typeof val === 'string') return val;
    return JSON.stringify(val);
  }

  // Postgres text[] → JSON-typed text in SQLite.
  if (hints.arrayCols.has(col)) {
    if (Array.isArray(val)) return JSON.stringify(val);
    if (typeof val === 'string') return val;
    return JSON.stringify([]);
  }

  // BigInt → string (D1 ints are 64-bit but JSON.stringify barfs on BigInt).
  if (typeof val === 'bigint') return val.toString();

  return val;
}

/**
 * Escape a value for inclusion as a SQL literal in `wrangler d1 execute --command`.
 * Strings are single-quoted; embedded quotes are doubled per SQL standard.
 */
export function sqlLiteral(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return 'NULL';
    return String(val);
  }
  if (typeof val === 'bigint') return val.toString();
  if (typeof val === 'boolean') return val ? '1' : '0';
  // Numbers from boolean-coerce path arrive as numbers above.
  const s = typeof val === 'string' ? val : JSON.stringify(val);
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Build a single `INSERT OR REPLACE` statement for a batch of rows.
 * Returns null when `rows` is empty.
 */
export function buildInsertSql(
  table: string,
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): string | null {
  if (rows.length === 0) return null;
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const valuesList = rows
    .map((r) => `(${columns.map((c) => sqlLiteral(r[c])).join(', ')})`)
    .join(',\n  ');
  return `INSERT OR REPLACE INTO "${table}" (${colList}) VALUES\n  ${valuesList};`;
}
