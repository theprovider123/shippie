import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { apps } from './apps.ts';
import { users } from './users.ts';

/**
 * Reusable, subject-scoped account credentials for store APIs
 * (ASC API keys, Play Console service accounts).
 *
 * Polymorphic: subject_type in ('user' | 'organization'), subject_id is
 * a uuid that refers to users.id or organizations.id depending on type.
 * Intentionally no foreign key — polymorphic refs can't be FK-enforced
 * in stock Postgres. Access control is enforced by the RLS policies in
 * the migration SQL.
 *
 * Spec v6 §12.5, Fix v5.1.1 A / v5.1.2 D.
 */
export const storeAccountCredentials = pgTable(
  'store_account_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: text('subject_type').notNull(), // 'user' | 'organization'
    subjectId: uuid('subject_id').notNull(),
    platform: text('platform').notNull(), // 'ios' | 'android'
    credentialType: text('credential_type').notNull(), // 'asc_api_key' | 'play_service_account'
    label: text('label').notNull(),
    encryptedValue: text('encrypted_value').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  },
  (t) => [
    unique('store_account_credentials_unique').on(
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

/**
 * Per-app signing config. Exactly one active per (app_id, platform) at a
 * time, enforced by the partial unique index in the migration SQL.
 *
 * Spec v6 §12.5, Fix v5.1.2 G rotation-safe pattern.
 */
export const appSigningConfigs = pgTable(
  'app_signing_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(), // 'ios' | 'android'
    accountCredentialId: uuid('account_credential_id').references(
      () => storeAccountCredentials.id,
      { onDelete: 'restrict' },
    ),
    isActive: boolean('is_active').default(true).notNull(),
    version: integer('version').default(1).notNull(),

    // iOS
    iosBundleId: text('ios_bundle_id'),
    iosTeamId: text('ios_team_id'),
    iosSigningMode: text('ios_signing_mode'), // 'automatic' | 'manual'
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

    createdAt: timestamptz('created_at'),
    updatedAt: timestamptz('updated_at'),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [index('app_signing_configs_app_platform_idx').on(t.appId, t.platform)],
);

// Helper: Drizzle column type shorthand — `timestamptz` is just named.
function timestamptz(name: string) {
  return timestamp(name, { withTimezone: true }).defaultNow().notNull();
}

export type AppSigningConfig = typeof appSigningConfigs.$inferSelect;
export type NewAppSigningConfig = typeof appSigningConfigs.$inferInsert;
