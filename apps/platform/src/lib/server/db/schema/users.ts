import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Users — both makers and end-users of deployed apps.
 *
 * Carries the Lucia auth columns (username, displayName, avatarUrl, isAdmin,
 * googleId) alongside maker-side columns (verifiedMaker, firstDeployAt, etc.).
 *
 * Spec v6 §18.1, §6.
 */
export const users = sqliteTable(
  'users',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text('email').notNull().unique(),
    /** ISO timestamp string. */
    emailVerified: text('email_verified'),

    // Social identity (populated by OAuth providers)
    githubId: text('github_id').unique(),
    googleId: text('google_id').unique(),
    appleId: text('apple_id').unique(),

    // Auth.js-conventional display fields
    name: text('name'),
    image: text('image'),

    // Phase 1 / Lucia parity — added so existing platform code keeps compiling.
    username: text('username').unique(),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    isAdmin: integer('is_admin', { mode: 'boolean' }).default(false).notNull(),

    verifiedMaker: integer('verified_maker', { mode: 'boolean' }).default(false).notNull(),
    verificationSource: text('verification_source'),

    /** Quick Ship SLO instrumentation (spec v6 §10.3). */
    firstDeployAt: text('first_deploy_at'),
    firstDeployDurationMs: integer('first_deploy_duration_ms'),
    firstDeployAppId: text('first_deploy_app_id'),

    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [index('users_email_idx').on(t.email)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
