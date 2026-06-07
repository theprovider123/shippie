/**
 * compliance-view — read models for the Phase-9 "Privacy & data" admin screen.
 *
 * The cloudlet writes EVERY governed action to the Shippie control-plane
 * audit_log (via `recordAudit`) with `target_type = 'instance:${instanceId}'`.
 * This module reads that log back for ONE school and classifies it into the
 * three views the trust pack needs:
 *
 *   - AI audit      — what was sent to a model, when, the model, whether it was
 *                     cached, the sensitivity, and how many fields were excluded
 *                     by the safeguarding guard. From `ai.request` / `ai.refused`
 *                     (Phase 5 broker audit).
 *   - break-glass   — any privileged/break-glass access to pupil data by an
 *                     admin (a platform admin operating inside a school they are
 *                     not a member of, or an explicit `breakglass.*` action).
 *   - data events   — export / erasure / retention / roster (the boundary
 *                     trail).
 *
 * Pure shaping over already-fetched rows so it is unit-testable with no D1.
 */
import { desc, eq } from 'drizzle-orm';
import type { ShippieDb } from '$server/db/client';
import { schema } from '$server/db/client';
import type { AuditLogEntry } from '$server/db/schema/audit-log';

export interface AiAuditEntry {
  id: string;
  at: string;
  actorUserId: string | null;
  purpose: string | null;
  model: string | null;
  cached: boolean;
  tokens: number | null;
  sensitivity: string | null;
  safeguardingExcluded: number | null;
  refused: boolean;
  reason: string | null;
}

export interface BreakGlassEntry {
  id: string;
  at: string;
  actorUserId: string | null;
  action: string;
  detail: Record<string, unknown> | null;
}

export interface DataEventEntry {
  id: string;
  at: string;
  actorUserId: string | null;
  action: string;
  detail: Record<string, unknown> | null;
}

export interface ComplianceView {
  ai: AiAuditEntry[];
  breakGlass: BreakGlassEntry[];
  dataEvents: DataEventEntry[];
}

/** Actions that constitute a data-boundary event (the export/erasure/retention trail). */
const DATA_EVENT_ACTIONS = new Set([
  'private_app_instance.exported',
  'private_app_instance.erase_started',
  'private_app_instance.erased',
  'retention.applied',
  'pupil.erased',
  'roster.imported',
]);

function after(row: AuditLogEntry): Record<string, unknown> | null {
  const meta = row.metadata as { after?: Record<string, unknown> } | null;
  return meta?.after ?? null;
}

/**
 * Classify pre-fetched audit_log rows (already scoped to one instance) into the
 * three compliance views. Pure. Rows should be passed newest-first.
 */
export function classifyComplianceRows(rows: AuditLogEntry[]): ComplianceView {
  const ai: AiAuditEntry[] = [];
  const breakGlass: BreakGlassEntry[] = [];
  const dataEvents: DataEventEntry[] = [];

  for (const row of rows) {
    const a = after(row);
    if (row.action === 'ai.request' || row.action === 'ai.refused') {
      ai.push({
        id: row.id,
        at: row.createdAt,
        actorUserId: row.actorUserId,
        purpose: (a?.purpose as string) ?? null,
        model: (a?.model as string) ?? null,
        cached: a?.cached === true,
        tokens: typeof a?.tokens === 'number' ? (a.tokens as number) : null,
        sensitivity: (a?.sensitivity as string) ?? null,
        safeguardingExcluded:
          typeof a?.safeguardingExcluded === 'number' ? (a.safeguardingExcluded as number) : null,
        refused: row.action === 'ai.refused',
        reason: (a?.reason as string) ?? null,
      });
    } else if (row.action.startsWith('breakglass.')) {
      breakGlass.push({
        id: row.id,
        at: row.createdAt,
        actorUserId: row.actorUserId,
        action: row.action,
        detail: a,
      });
    } else if (DATA_EVENT_ACTIONS.has(row.action)) {
      dataEvents.push({
        id: row.id,
        at: row.createdAt,
        actorUserId: row.actorUserId,
        action: row.action,
        detail: a,
      });
    }
  }
  return { ai, breakGlass, dataEvents };
}

/**
 * Load + classify the compliance view for one instance from D1. Reads at most
 * `limit` most-recent audit rows for `instance:${instanceId}`.
 */
export async function loadComplianceView(
  db: ShippieDb,
  instanceId: string,
  limit = 200,
): Promise<ComplianceView> {
  const rows = await db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.targetType, `instance:${instanceId}`))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit);
  return classifyComplianceRows(rows as AuditLogEntry[]);
}

/**
 * Record a break-glass access — a privileged/admin read of pupil data. Called
 * whenever a platform admin (not a verified member) resolves into a school's
 * workspace, so every such access is audited + visible on the Privacy screen.
 */
export async function recordBreakGlass(
  db: ShippieDb,
  e: { actorUserId: string; instanceId: string; reason: string; resource: string },
): Promise<void> {
  await db.insert(schema.auditLog).values({
    actorUserId: e.actorUserId,
    action: 'breakglass.access',
    targetType: `instance:${e.instanceId}`,
    targetId: e.resource,
    metadata: { after: { reason: e.reason, resource: e.resource } },
  });
}
