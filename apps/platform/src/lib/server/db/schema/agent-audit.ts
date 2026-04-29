import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

/**
 * Phase C1 — local agent audit log.
 *
 * One row per insight surfaced to the user. Persisted because:
 *   1. Rate limit enforcement needs to span reloads (in-memory limiter
 *      from `@shippie/agent` is the lightweight first line; this is the
 *      durable backstop).
 *   2. Cross-day dedupe — a "today" insight should not return tomorrow
 *      unless the agent re-detects with higher urgency.
 *   3. Quarterly review — measure agent value before promoting strategies.
 *
 * Disposition values:
 *   - 'shown'        — surfaced to the user (default, written on insert)
 *   - 'tapped'       — user opened the deep link
 *   - 'dismissed'    — user swiped right or tapped X
 *   - 'expired'      — the insight TTL passed without interaction
 */
export const agentAudit = sqliteTable(
  '_shippie_agent_audit',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    insightId: text('insight_id').notNull(),
    strategy: text('strategy').notNull(),
    urgency: text('urgency').notNull(),
    targetApp: text('target_app').notNull(),
    disposition: text('disposition').default('shown').notNull(),
    generatedAt: text('generated_at').notNull(),
    recordedAt: text('recorded_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    uniqueIndex('agent_audit_user_insight_unique').on(t.userId, t.insightId),
    index('agent_audit_user_recorded_idx').on(t.userId, t.recordedAt),
    index('agent_audit_strategy_idx').on(t.strategy, t.recordedAt),
  ],
);

export type AgentAuditRow = typeof agentAudit.$inferSelect;
export type NewAgentAuditRow = typeof agentAudit.$inferInsert;

export type AgentDisposition = 'shown' | 'tapped' | 'dismissed' | 'expired';
const VALID_DISPOSITIONS: readonly AgentDisposition[] = ['shown', 'tapped', 'dismissed', 'expired'];

export function isAgentDisposition(value: string): value is AgentDisposition {
  return (VALID_DISPOSITIONS as readonly string[]).includes(value);
}
