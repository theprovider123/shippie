import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

/**
 * Apps — the central entity. Owned by a user OR an organization.
 *
 * Deploy pointers (latest_*, active_*, preview_*) are derived caches
 * maintained by the sync_app_latest_deploy trigger declared in the
 * 0001_init.sql migration. They're typed here so app code can read them
 * without joining deploys on every query.
 *
 * Spec v6 §18.2.
 */
export const apps = pgTable(
  'apps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    tagline: text('tagline'),
    description: text('description'),
    type: text('type').notNull(), // 'app' | 'web_app' | 'website'
    category: text('category').notNull(),
    iconUrl: text('icon_url'),
    themeColor: text('theme_color').default('#000000').notNull(),
    backgroundColor: text('background_color').default('#ffffff').notNull(),

    githubRepo: text('github_repo'),
    githubBranch: text('github_branch').default('main').notNull(),
    githubInstallationId: bigint('github_installation_id', { mode: 'number' }),
    githubVerified: boolean('github_verified').default(false).notNull(),
    sourceType: text('source_type').notNull(), // 'github' | 'zip'

    /** URL-wrap mode (migration 0018). 'static' reuses existing R2 pipeline;
     *  'wrapped_url' routes the worker to a reverse-proxy handler. */
    sourceKind: text('source_kind').default('static').notNull(),
    upstreamUrl: text('upstream_url'),
    upstreamConfig: jsonb('upstream_config').default(sql`'{}'::jsonb`).notNull(),

    /** BYO backend — null means Tier 1 (static, no backend). */
    backendType: text('backend_type'), // 'supabase' | 'firebase' | null
    backendUrl: text('backend_url'),

    conflictPolicy: text('conflict_policy').default('shippie').notNull(),

    makerId: uuid('maker_id')
      .notNull()
      .references(() => users.id),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    visibilityScope: text('visibility_scope').default('public').notNull(),
    isArchived: boolean('is_archived').default(false).notNull(),
    takedownReason: text('takedown_reason'),

    /** Cached deploy pointers — maintained by trigger. See spec v6 §18.3. */
    latestDeployId: uuid('latest_deploy_id'),
    latestDeployStatus: text('latest_deploy_status'),
    activeDeployId: uuid('active_deploy_id'),
    previewDeployId: uuid('preview_deploy_id'),

    /** Denormalized counters. */
    upvoteCount: integer('upvote_count').default(0).notNull(),
    commentCount: integer('comment_count').default(0).notNull(),
    installCount: integer('install_count').default(0).notNull(),
    activeUsers30d: integer('active_users_30d').default(0).notNull(),
    feedbackOpenCount: integer('feedback_open_count').default(0).notNull(),

    /** Ranking scores (per type). */
    rankingScoreApp: doublePrecision('ranking_score_app').default(0).notNull(),
    rankingScoreWebApp: doublePrecision('ranking_score_web_app').default(0).notNull(),
    rankingScoreWebsite: doublePrecision('ranking_score_website').default(0).notNull(),

    /** Native readiness. */
    nativeReadinessScore: integer('native_readiness_score').default(0).notNull(),
    compatibilityScore: integer('compatibility_score').default(0).notNull(),
    nativeReadinessReport: jsonb('native_readiness_report'),
    bestOn: text('best_on'), // 'mobile' | 'desktop' | 'any'
    quickShipSloHit: boolean('quick_ship_slo_hit'),

    /** Business / compliance surfaces. */
    supportEmail: text('support_email'),
    privacyPolicyUrl: text('privacy_policy_url'),
    termsUrl: text('terms_url'),
    dataResidency: text('data_residency').default('eu').notNull(),
    screenshotUrls: text('screenshot_urls').array(),

    firstPublishedAt: timestamp('first_published_at', { withTimezone: true }),
    lastDeployedAt: timestamp('last_deployed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),

    /** No-signup trial bookkeeping (migration 0011). */
    isTrial: boolean('is_trial').default(false).notNull(),
    trialUntil: timestamp('trial_until', { withTimezone: true }),
    trialClaimedBy: uuid('trial_claimed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    trialIpHash: text('trial_ip_hash'),
  },
  (t) => [
    index('apps_slug_active_idx').on(t.slug),
    index('apps_maker_idx').on(t.makerId),
    index('apps_org_idx').on(t.organizationId),
    index('apps_type_visibility_idx').on(t.type, t.visibilityScope),
  ],
);

export type App = typeof apps.$inferSelect;
export type NewApp = typeof apps.$inferInsert;

/**
 * Per-app declared permissions. Mirrors shippie.json.permissions.
 * Compliance runner checks runtime SDK calls against this table.
 */
export const appPermissions = pgTable('app_permissions', {
  appId: uuid('app_id')
    .primaryKey()
    .references(() => apps.id, { onDelete: 'cascade' }),
  auth: boolean('auth').default(false).notNull(),
  storage: text('storage').default('none').notNull(), // 'none' | 'r' | 'rw'
  files: boolean('files').default(false).notNull(),
  notifications: boolean('notifications').default(false).notNull(),
  analytics: boolean('analytics').default(true).notNull(),
  externalNetwork: boolean('external_network').default(false).notNull(),
  allowedConnectDomains: text('allowed_connect_domains')
    .array()
    .default(sql`array[]::text[]`)
    .notNull(),
  nativeBridgeFeatures: text('native_bridge_features')
    .array()
    .default(sql`array[]::text[]`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type AppPermissions = typeof appPermissions.$inferSelect;
