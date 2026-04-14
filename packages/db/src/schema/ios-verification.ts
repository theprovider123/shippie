import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { apps } from './apps.ts';
import { appSigningConfigs } from './store-credentials.ts';
import { users } from './users.ts';

/**
 * One-time verify kits issued to makers for `shippie ios-verify`.
 *
 * Fix v5.1.5 R: consumption is atomic and idempotent. A kit becomes
 * either 'accepted' or 'rejected' and can never be reused.
 *
 * Spec v6 §13.3.
 */
export const iosVerifyKits = pgTable(
  'ios_verify_kits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    signingConfigId: uuid('signing_config_id')
      .notNull()
      .references(() => appSigningConfigs.id, { onDelete: 'cascade' }),
    nonce: text('nonce').notNull().unique(),
    secret: text('secret').notNull(),
    kitVersion: integer('kit_version').notNull(),
    issuedTo: uuid('issued_to')
      .notNull()
      .references(() => users.id),
    issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    consumptionOutcome: text('consumption_outcome'), // 'accepted' | 'rejected'
    rejectionReason: text('rejection_reason'),
  },
  (t) => [index('ios_verify_kits_app_unused_idx').on(t.appId, t.signingConfigId)],
);
export type IosVerifyKit = typeof iosVerifyKits.$inferSelect;
export type NewIosVerifyKit = typeof iosVerifyKits.$inferInsert;

/**
 * Successful and failed signing verifications. Bound to a specific
 * signing_config_id (Fix v5.1.3 J) so rotation invalidates.
 *
 * Spec v6 §13.8.
 */
export const iosSigningVerifications = pgTable(
  'ios_signing_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    signingConfigId: uuid('signing_config_id')
      .notNull()
      .references(() => appSigningConfigs.id, { onDelete: 'cascade' }),
    nonce: text('nonce').notNull().unique(),
    succeededAt: timestamp('succeeded_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    xcodeVersion: text('xcode_version'),
    macosVersion: text('macos_version'),
    logR2Key: text('log_r2_key'),
    verifyKitVersion: integer('verify_kit_version').notNull(),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
    invalidatedReason: text('invalidated_reason'),
  },
  (t) => [
    index('ios_signing_verifications_active_idx').on(
      t.appId,
      t.signingConfigId,
      t.succeededAt,
    ),
  ],
);
export type IosSigningVerification = typeof iosSigningVerifications.$inferSelect;
export type NewIosSigningVerification = typeof iosSigningVerifications.$inferInsert;
