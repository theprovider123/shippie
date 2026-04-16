/**
 * Audit log helper. INSERT-only by design — no update or delete path.
 *
 * Usage:
 *   await writeAuditLog(db, {
 *     actorUserId: session.user.id,
 *     organizationId: org.id,
 *     action: 'org.member.added',
 *     targetType: 'user',
 *     targetId: newMember.id,
 *     metadata: { role: 'developer' },
 *   });
 *
 * Spec v6 §15.1.
 */
import { schema, type ShippieDb } from '@shippie/db';

export interface WriteAuditLogInput {
  actorUserId?: string | null;
  organizationId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(db: ShippieDb, input: WriteAuditLogInput): Promise<void> {
  await db.insert(schema.auditLog).values({
    actorUserId: input.actorUserId ?? null,
    organizationId: input.organizationId ?? null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? null,
  });
}
