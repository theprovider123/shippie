import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { deploys } from './deploys';

/**
 * Runtime proof events — the source data for Capability Proof Badges.
 *
 * The wrapper emits a small set of strictly-typed events when a real
 * device performs a claim-eligible action (installed the PWA, loaded
 * offline, opened a local DB, exported data, ran a local AI inference,
 * joined a Connect room, completed a peer sync, restored a backup,
 * transferred between devices, etc.). The payload is intentionally
 * tiny — proof needs the *fact* of an event, not its content.
 *
 * Privacy:
 *   - `deviceHash` is an opaque fingerprint computed on the device. We
 *     never see raw device identifiers. Used only for the "≥N distinct
 *     devices" threshold in the capability rollup; never joined to any
 *     user table.
 *   - `payload` holds optional structured context (e.g., backup size in
 *     bytes), never user content. Deliberately a JSON column so we can
 *     evolve metadata without migrations.
 *   - Retention: 60 days. The `retention` cron sweeps stale proof events
 *     after the daily badge rollup has consumed them.
 */
export const proofEvents = sqliteTable(
  'proof_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    /** Optional pointer to the deploy that emitted the event (helps track regressions). */
    deployId: text('deploy_id').references(() => deploys.id, { onDelete: 'set null' }),
    /** Opaque per-device hash from the wrapper. NEVER a user identifier. */
    deviceHash: text('device_hash').notNull(),
    /**
     * From the canonical proof-event taxonomy. The ingestion endpoint
     * rejects events with a `eventType` outside the allowlist, so this
     * column's free-form text is safe.
     */
    eventType: text('event_type').notNull(),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>(),
    ts: text('ts').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    index('proof_events_app_type_ts').on(t.appId, t.eventType, t.ts),
    index('proof_events_app_device').on(t.appId, t.deviceHash),
  ],
);

/**
 * Awarded Capability Proof Badges per app.
 *
 * Filled by `capability-badges` daily cron. A badge is only awarded when
 * the matching event has been seen from at least N distinct device
 * hashes in the rollup window. Default thresholds live in
 * `capability-badges.ts` (the cron module).
 */
export const capabilityBadges = sqliteTable(
  'capability_badges',
  {
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    /**
     * One of the canonical badge slugs:
     *   works-offline, runs-local-db, uses-local-ai, mesh-ready,
     *   data-export-verified, device-transfer-verified, backup-restore-verified
     */
    badge: text('badge').notNull(),
    awardedAt: text('awarded_at').default(sql`(datetime('now'))`).notNull(),
    /** Distinct device hashes that produced the matching events in the window. */
    distinctDevices: integer('distinct_devices').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.appId, t.badge] }),
    index('capability_badges_badge').on(t.badge),
  ],
);
