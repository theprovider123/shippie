import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { apps } from './apps.ts';

/**
 * Built store submission artifacts.
 *
 * Spec v6 §12.4 (Android), §12.3 (iOS Prep Kit), §18.7.
 */
export const nativeBundles = pgTable(
  'native_bundles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(), // 'ios' | 'android'
    wrapper: text('wrapper').notNull(), // 'capacitor' | 'twa'
    version: text('version').notNull(),
    buildNumber: integer('build_number').notNull(),
    bundleId: text('bundle_id').notNull(),
    signedArtifactR2Key: text('signed_artifact_r2_key'),
    readinessScore: integer('readiness_score'),
    readinessReport: jsonb('readiness_report'),
    nativeBridgeFeatures: text('native_bridge_features').array(),
    submissionStatus: text('submission_status').default('draft').notNull(),
    rejectionReason: text('rejection_reason'),
    storeConnectId: text('store_connect_id'),
    playConsoleId: text('play_console_id'),
    testflightGroup: text('testflight_group'),
    playTrack: text('play_track'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('native_bundles_app_platform_idx').on(t.appId, t.platform),
    index('native_bundles_status_idx').on(t.submissionStatus),
  ],
);
export type NativeBundle = typeof nativeBundles.$inferSelect;
export type NewNativeBundle = typeof nativeBundles.$inferInsert;
