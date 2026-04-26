import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { appSigningConfigs } from './store-credentials';
import { users } from './users';

export const iosVerifyKits = sqliteTable(
  'ios_verify_kits',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    signingConfigId: text('signing_config_id')
      .notNull()
      .references(() => appSigningConfigs.id, { onDelete: 'cascade' }),
    nonce: text('nonce').notNull().unique(),
    secret: text('secret').notNull(),
    kitVersion: integer('kit_version').notNull(),
    issuedTo: text('issued_to')
      .notNull()
      .references(() => users.id),
    issuedAt: text('issued_at').default(sql`(datetime('now'))`).notNull(),
    expiresAt: text('expires_at').notNull(),
    consumedAt: text('consumed_at'),
    consumptionOutcome: text('consumption_outcome'),
    rejectionReason: text('rejection_reason'),
  },
  (t) => [index('ios_verify_kits_app_unused_idx').on(t.appId, t.signingConfigId)],
);
export type IosVerifyKit = typeof iosVerifyKits.$inferSelect;
export type NewIosVerifyKit = typeof iosVerifyKits.$inferInsert;

export const iosSigningVerifications = sqliteTable(
  'ios_signing_verifications',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    signingConfigId: text('signing_config_id')
      .notNull()
      .references(() => appSigningConfigs.id, { onDelete: 'cascade' }),
    nonce: text('nonce').notNull().unique(),
    succeededAt: text('succeeded_at'),
    failedAt: text('failed_at'),
    failureReason: text('failure_reason'),
    xcodeVersion: text('xcode_version'),
    macosVersion: text('macos_version'),
    logR2Key: text('log_r2_key'),
    verifyKitVersion: integer('verify_kit_version').notNull(),
    invalidatedAt: text('invalidated_at'),
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
