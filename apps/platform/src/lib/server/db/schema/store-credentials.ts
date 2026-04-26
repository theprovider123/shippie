import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { users } from './users';

/**
 * Reusable, subject-scoped account credentials. D1/SQLite port.
 *
 * Polymorphic ref to users.id or organizations.id — no FK in either DB.
 * RLS is enforced in app code in the SQLite world.
 */
export const storeAccountCredentials = sqliteTable(
  'store_account_credentials',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    platform: text('platform').notNull(),
    credentialType: text('credential_type').notNull(),
    label: text('label').notNull(),
    encryptedValue: text('encrypted_value').notNull(),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    rotatedAt: text('rotated_at'),
  },
  (t) => [
    uniqueIndex('store_account_credentials_unique').on(
      t.subjectType,
      t.subjectId,
      t.platform,
      t.credentialType,
      t.label,
    ),
    index('sac_subject_idx').on(t.subjectType, t.subjectId, t.platform),
  ],
);
export type StoreAccountCredential = typeof storeAccountCredentials.$inferSelect;
export type NewStoreAccountCredential = typeof storeAccountCredentials.$inferInsert;

export const appSigningConfigs = sqliteTable(
  'app_signing_configs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    accountCredentialId: text('account_credential_id').references(
      () => storeAccountCredentials.id,
      { onDelete: 'restrict' },
    ),
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
    version: integer('version').default(1).notNull(),

    // iOS
    iosBundleId: text('ios_bundle_id'),
    iosTeamId: text('ios_team_id'),
    iosSigningMode: text('ios_signing_mode'),
    iosCertificateR2Key: text('ios_certificate_r2_key'),
    iosCertificatePasswordEncrypted: text('ios_certificate_password_encrypted'),
    iosProvisioningProfileR2Key: text('ios_provisioning_profile_r2_key'),
    iosEntitlementsPlistR2Key: text('ios_entitlements_plist_r2_key'),

    // Android
    androidPackage: text('android_package'),
    androidKeystoreR2Key: text('android_keystore_r2_key'),
    androidKeystorePasswordEncrypted: text('android_keystore_password_encrypted'),
    androidKeyAlias: text('android_key_alias'),
    androidKeyPasswordEncrypted: text('android_key_password_encrypted'),

    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
    createdBy: text('created_by').references(() => users.id),
  },
  (t) => [index('app_signing_configs_app_platform_idx').on(t.appId, t.platform)],
);

export type AppSigningConfig = typeof appSigningConfigs.$inferSelect;
export type NewAppSigningConfig = typeof appSigningConfigs.$inferInsert;
