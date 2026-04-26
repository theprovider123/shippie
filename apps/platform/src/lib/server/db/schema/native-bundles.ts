import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';

export const nativeBundles = sqliteTable(
  'native_bundles',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    wrapper: text('wrapper').notNull(),
    version: text('version').notNull(),
    buildNumber: integer('build_number').notNull(),
    bundleId: text('bundle_id').notNull(),
    signedArtifactR2Key: text('signed_artifact_r2_key'),
    readinessScore: integer('readiness_score'),
    readinessReport: text('readiness_report', { mode: 'json' }).$type<Record<string, unknown>>(),
    nativeBridgeFeatures: text('native_bridge_features', { mode: 'json' }).$type<string[]>(),
    submissionStatus: text('submission_status').default('draft').notNull(),
    rejectionReason: text('rejection_reason'),
    storeConnectId: text('store_connect_id'),
    playConsoleId: text('play_console_id'),
    testflightGroup: text('testflight_group'),
    playTrack: text('play_track'),
    submittedAt: text('submitted_at'),
    approvedAt: text('approved_at'),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    index('native_bundles_app_platform_idx').on(t.appId, t.platform),
    index('native_bundles_status_idx').on(t.submissionStatus),
  ],
);
export type NativeBundle = typeof nativeBundles.$inferSelect;
export type NewNativeBundle = typeof nativeBundles.$inferInsert;
