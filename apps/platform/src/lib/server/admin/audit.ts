/**
 * Admin audit-log writer.
 *
 * Single helper used by every admin write action (and, eventually, by
 * user-facing visibility/archive flows so a maker self-archiving their
 * own app shows up in the same trail). The audit_log table is mirrored
 * from Postgres → D1; its schema lives in `db/schema/audit-log.ts`.
 *
 * Spec v6 §15.1, §18.8.
 */
import type { ShippieDb } from '$server/db/client';
import { auditLog, type AuditLogEntry } from '$server/db/schema/audit-log';

export interface RecordAuditInput {
  /** The user performing the action (admin or maker). Nullable so
   * system-driven events stay representable, but admin actions always
   * pass a real id. */
  actorUserId: string | null;
  /** Stable string identifier — `app.archive`, `app.set_visibility`,
   * `app.unarchive`. Use dot-namespacing so filters can prefix-match. */
  action: string;
  /** Postgres source table — kept as `target_type` in the schema for
   * generality (it's not always a SQL table; could be `kv:foo` later). */
  targetTable: string;
  targetId: string | null;
  /** Pre-image of the row(s) that changed. Stored under `metadata.before`
   * so a single JSON column works for inserts (no before), updates
   * (both), and deletes (no after). */
  before?: Record<string, unknown> | null;
  /** Post-image. */
  after?: Record<string, unknown> | null;
  /** Hashed IP, optional — passed through when called from a request
   * handler that has it. */
  ipHash?: string | null;
}

/**
 * Insert a single audit_log row and return it. Caller controls the
 * transactional boundary — for now we don't wrap the parent mutation
 * and the audit insert together because D1 doesn't expose transactions
 * across the platform binding cleanly. Worst case: parent commits,
 * audit insert fails. We accept that — it's better than the inverse
 * (audit logged, parent rollback).
 */
export async function recordAudit(
  db: ShippieDb,
  input: RecordAuditInput,
): Promise<AuditLogEntry> {
  const metadata: Record<string, unknown> = {};
  if (input.before !== undefined) metadata.before = input.before ?? null;
  if (input.after !== undefined) metadata.after = input.after ?? null;

  const [row] = await db
    .insert(auditLog)
    .values({
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetTable,
      targetId: input.targetId,
      metadata: Object.keys(metadata).length === 0 ? null : metadata,
      ipHash: input.ipHash ?? null,
    })
    .returning();

  if (!row) {
    // Defensive — D1 returning() should always yield the inserted row.
    throw new Error('audit_log insert returned no row');
  }
  return row;
}
