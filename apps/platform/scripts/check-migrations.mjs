#!/usr/bin/env bun
/**
 * Migration-number discipline.
 *
 * Wrangler's D1 migration runner applies files in filename order and tracks
 * applied migrations BY FILENAME in the `d1_migrations` table. Two files that
 * share a numeric prefix (e.g. `0039_seed_golazo_showcase.sql` and
 * `0039_seed_reserved_slugs.sql`) therefore both apply and are both tracked.
 * It works, but the sequence becomes ambiguous and the next author is more
 * likely to collide again.
 *
 * This script fails CI on any NEW duplicate number, while grandfathering the
 * handful that are already applied in production. We deliberately do not
 * renumber the grandfathered files: renaming an applied migration changes its
 * filename, so Wrangler would treat it as a fresh migration and re-run it.
 *
 * Also exports `nextMigrationNumber()` so scaffolds can allocate from the same
 * source of truth that CI enforces.
 *
 *   bun scripts/check-migrations.mjs          # check
 *   bun scripts/check-migrations.mjs --next   # print the next free number
 */
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = resolve(__dirname, '..', 'drizzle');

/**
 * Numbers known to be duplicated AND already applied to production D1.
 * Grandfathered so CI stays green; renaming them would make Wrangler re-run
 * them. New duplicates are still rejected. If production D1 is ever reset
 * from scratch, consolidate these only after verifying `d1_migrations`.
 */
const GRANDFATHERED_DUPLICATES = new Set(['0012', '0038', '0039']);

/** All `NNNN_*.sql` migrations, grouped by their numeric prefix. */
export function migrationsByNumber(dir = DRIZZLE_DIR) {
  const byNumber = new Map();
  for (const name of readdirSync(dir)) {
    const m = /^(\d{4})_.*\.sql$/.exec(name);
    if (!m) continue;
    const num = m[1];
    if (!byNumber.has(num)) byNumber.set(num, []);
    byNumber.get(num).push(name);
  }
  return byNumber;
}

/** Duplicate numbers that are not grandfathered. */
export function offendingDuplicates(dir = DRIZZLE_DIR) {
  const out = [];
  for (const [num, files] of migrationsByNumber(dir)) {
    if (files.length > 1 && !GRANDFATHERED_DUPLICATES.has(num)) {
      out.push({ num, files: files.sort() });
    }
  }
  return out.sort((a, b) => (a.num < b.num ? -1 : 1));
}

/** The next free zero-padded migration number, using max + 1. */
export function nextMigrationNumber(dir = DRIZZLE_DIR) {
  let max = 0;
  for (const num of migrationsByNumber(dir).keys()) max = Math.max(max, Number(num));
  return String(max + 1).padStart(4, '0');
}

function main() {
  if (process.argv.includes('--next')) {
    process.stdout.write(nextMigrationNumber() + '\n');
    return;
  }

  const byNumber = migrationsByNumber();
  const grandfathered = [...byNumber]
    .filter(([num, files]) => files.length > 1 && GRANDFATHERED_DUPLICATES.has(num))
    .map(([num]) => num);
  const offenders = offendingDuplicates();

  if (grandfathered.length > 0) {
    console.log(
      `[check-migrations] grandfathered duplicate(s) (applied in prod, left as-is): ${grandfathered.join(', ')}`,
    );
  }

  if (offenders.length === 0) {
    console.log(
      `[check-migrations] OK - no new duplicate migration numbers. Next free: ${nextMigrationNumber()}`,
    );
    return;
  }

  console.error('[check-migrations] FAIL - duplicate migration number(s) detected:');
  for (const { num, files } of offenders) {
    console.error(`  ${num}: ${files.join(', ')}`);
  }
  console.error(`Renumber the newer file to ${nextMigrationNumber()} or the next free number.`);
  process.exit(1);
}

if (import.meta.main || process.argv[1]?.endsWith('check-migrations.mjs')) main();
