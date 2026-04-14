import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Users — both makers and end-users of deployed apps. One identity across
 * shippie.app (control plane) and every {slug}.shippie.app (runtime plane).
 *
 * Spec v6 §18.1.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    emailVerified: timestamp('email_verified', { withTimezone: true }),
    githubId: text('github_id').unique(),
    googleId: text('google_id').unique(),
    appleId: text('apple_id').unique(),
    username: text('username').notNull().unique(),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    verifiedMaker: boolean('verified_maker').default(false).notNull(),
    verificationSource: text('verification_source'),

    /** Quick Ship SLO instrumentation (spec v6 §10.3). */
    firstDeployAt: timestamp('first_deploy_at', { withTimezone: true }),
    firstDeployDurationMs: integer('first_deploy_duration_ms'),
    firstDeployAppId: uuid('first_deploy_app_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('users_email_idx').on(t.email), index('users_username_idx').on(t.username)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
