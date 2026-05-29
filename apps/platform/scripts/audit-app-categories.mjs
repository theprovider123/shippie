#!/usr/bin/env bun
/**
 * Audit apps.category against the controlled vocab.
 *
 * Lists any rows whose category is outside VALID_CATEGORIES — i.e. legacy or
 * freeform values that the 0040 remap migration didn't cover and that the
 * Phase 1 write-boundary enforcement (normalizeCategory) would now reject.
 *
 * Usage:
 *   bun scripts/audit-app-categories.mjs            # against local D1
 *   bun scripts/audit-app-categories.mjs --remote   # against production D1
 *
 * Exits non-zero if any out-of-vocab rows exist, so it can gate CI.
 */
import { execSync } from 'node:child_process';
import { VALID_CATEGORIES } from '../src/lib/curation/schema.ts';

const remote = process.argv.includes('--remote');
const target = remote ? '--remote' : '--local';
const inList = VALID_CATEGORIES.map((c) => `'${c}'`).join(', ');
const sql = `SELECT category, COUNT(*) AS n FROM apps WHERE category IS NULL OR category NOT IN (${inList}) GROUP BY category ORDER BY n DESC;`;

console.log(`[audit-app-categories] controlled vocab: ${VALID_CATEGORIES.join(', ')}`);
console.log(`[audit-app-categories] querying ${remote ? 'REMOTE' : 'LOCAL'} D1…`);

let out = '';
try {
  out = execSync(
    `wrangler d1 execute shippie-platform-d1 ${target} --json --command ${JSON.stringify(sql)}`,
    { encoding: 'utf8' },
  );
} catch (err) {
  console.error('[audit-app-categories] wrangler query failed:', err.message);
  process.exit(2);
}

let rows = [];
try {
  const parsed = JSON.parse(out);
  rows = parsed?.[0]?.results ?? parsed?.results ?? [];
} catch {
  console.error('[audit-app-categories] could not parse wrangler output:\n', out);
  process.exit(2);
}

if (rows.length === 0) {
  console.log('[audit-app-categories] ✓ every apps.category is in the controlled vocab.');
  process.exit(0);
}

console.error('[audit-app-categories] ✗ found out-of-vocab categories:');
for (const row of rows) {
  console.error(`  ${JSON.stringify(row.category)} — ${row.n} row(s)`);
}
console.error(
  '[audit-app-categories] add a mapping to LEGACY_CATEGORY_MAP + 0040 migration, or fix the rows.',
);
process.exit(1);
