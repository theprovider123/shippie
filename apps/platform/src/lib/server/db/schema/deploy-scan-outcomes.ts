import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { deploys } from './deploys';

/**
 * Phase B3 — Stage B harness.
 *
 * Maker disposition on Phase 4 Stage A scanner findings (security-scan,
 * privacy-audit, security-score, privacy-grade). Lets us measure false-
 * positive rates before promoting findings into public-facing trust UX.
 *
 * One row per (deploy, scanner, finding) AFTER the maker reacts. Absence
 * of a row means the maker never opened the report — itself a signal we
 * track via per-app open-rate alongside this table.
 */
export const deployScanOutcomes = sqliteTable(
  '_deploy_scan_outcomes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    deployId: text('deploy_id')
      .notNull()
      .references(() => deploys.id, { onDelete: 'cascade' }),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    scanner: text('scanner').notNull(),
    scannerVersion: text('scanner_version').notNull(),
    findingId: text('finding_id').notNull(),
    severity: text('severity').notNull(),
    /** 'real' | 'false_positive' | 'wont_fix' | 'acknowledged' */
    disposition: text('disposition').notNull(),
    note: text('note'),
    recordedAt: text('recorded_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    uniqueIndex('deploy_scan_outcomes_finding_unique').on(t.deployId, t.scanner, t.findingId),
    index('deploy_scan_outcomes_app_recorded_idx').on(t.appId, t.recordedAt),
    index('deploy_scan_outcomes_disposition_idx').on(t.scanner, t.disposition),
  ],
);

export type DeployScanOutcome = typeof deployScanOutcomes.$inferSelect;
export type NewDeployScanOutcome = typeof deployScanOutcomes.$inferInsert;

export type ScanDisposition = 'real' | 'false_positive' | 'wont_fix' | 'acknowledged';

const VALID_DISPOSITIONS: readonly ScanDisposition[] = [
  'real',
  'false_positive',
  'wont_fix',
  'acknowledged',
];

export function isScanDisposition(value: string): value is ScanDisposition {
  return (VALID_DISPOSITIONS as readonly string[]).includes(value);
}
