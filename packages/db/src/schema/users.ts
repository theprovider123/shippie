import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Users — both makers and end-users of deployed apps.
 *
 * Shippie uses a single user identity across the control plane
 * (shippie.app) and every runtime origin ({slug}.shippie.app).
 *
 * Naming: `name` and `image` match Auth.js v5 + OAuth conventions so
 * the Drizzle adapter can use this table directly. (The v6 spec uses
 * `display_name` and `avatar_url` in §18.1 — this is a one-line
 * deviation; the Shippie-specific columns below remain unchanged.)
 *
 * `username` is nullable — Auth.js creates rows at first sign-in
 * before our onboarding flow claims a username.
 *
 * Spec v6 §18.1, §6 (Auth architecture).
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    emailVerified: timestamp('email_verified', { withTimezone: true }),

    // Social identity (populated by OAuth providers)
    githubId: text('github_id').unique(),
    googleId: text('google_id').unique(),
    appleId: text('apple_id').unique(),

    // Auth.js-conventional display fields
    name: text('name'),
    image: text('image'),

    // Shippie-specific identity
    username: text('username').unique(),
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
  (t) => [index('users_email_idx').on(t.email)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
