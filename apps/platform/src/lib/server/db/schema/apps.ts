import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations';
import { users } from './users';

/**
 * Apps — the central entity. D1/SQLite port of packages/db/src/schema/apps.ts.
 *
 * Notes on the port:
 * - JSONB columns use `text(..., { mode: 'json' })` — Drizzle auto handles
 *   stringify/parse so call sites continue to read objects.
 * - Postgres `text[]` arrays (screenshotUrls) become JSON-typed text.
 * - Triggers that maintained `latest_*` cached pointers are not yet
 *   modeled; we leave the columns and wire them in Phase 5 if needed.
 *
 * Spec v6 §18.2.
 */
export const apps = sqliteTable(
  'apps',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
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
    /** D1 integers are 64-bit; Postgres bigint maps cleanly. */
    githubInstallationId: integer('github_installation_id'),
    githubVerified: integer('github_verified', { mode: 'boolean' }).default(false).notNull(),
    sourceType: text('source_type').notNull(), // 'github' | 'zip'

    /** URL-wrap mode. */
    sourceKind: text('source_kind').default('static').notNull(),
    upstreamUrl: text('upstream_url'),
    upstreamConfig: text('upstream_config', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .default(sql`('{}')`)
      .notNull(),

    backendType: text('backend_type'), // 'supabase' | 'firebase' | null
    backendUrl: text('backend_url'),

    conflictPolicy: text('conflict_policy').default('shippie').notNull(),

    makerId: text('maker_id')
      .notNull()
      .references(() => users.id),
    organizationId: text('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    visibilityScope: text('visibility_scope').default('public').notNull(),
    isArchived: integer('is_archived', { mode: 'boolean' }).default(false).notNull(),
    takedownReason: text('takedown_reason'),

    /** Cached deploy pointers — maintained in app code post-port. */
    latestDeployId: text('latest_deploy_id'),
    latestDeployStatus: text('latest_deploy_status'),
    activeDeployId: text('active_deploy_id'),
    previewDeployId: text('preview_deploy_id'),

    /** Denormalized counters. */
    upvoteCount: integer('upvote_count').default(0).notNull(),
    commentCount: integer('comment_count').default(0).notNull(),
    installCount: integer('install_count').default(0).notNull(),
    activeUsers30d: integer('active_users_30d').default(0).notNull(),
    feedbackOpenCount: integer('feedback_open_count').default(0).notNull(),

    /** Ranking scores. SQLite real == 8-byte IEEE 754 double. */
    rankingScoreApp: real('ranking_score_app').default(0).notNull(),
    rankingScoreWebApp: real('ranking_score_web_app').default(0).notNull(),
    rankingScoreWebsite: real('ranking_score_website').default(0).notNull(),

    /** Native readiness. */
    nativeReadinessScore: integer('native_readiness_score').default(0).notNull(),
    compatibilityScore: integer('compatibility_score').default(0).notNull(),
    nativeReadinessReport: text('native_readiness_report', { mode: 'json' }).$type<
      Record<string, unknown>
    >(),
    bestOn: text('best_on'), // 'mobile' | 'desktop' | 'any'
    quickShipSloHit: integer('quick_ship_slo_hit', { mode: 'boolean' }),

    /** Business / compliance surfaces. */
    supportEmail: text('support_email'),
    privacyPolicyUrl: text('privacy_policy_url'),
    termsUrl: text('terms_url'),
    dataResidency: text('data_residency').default('eu').notNull(),
    /** Postgres text[] becomes JSON-typed text in SQLite. */
    screenshotUrls: text('screenshot_urls', { mode: 'json' }).$type<string[]>(),

    firstPublishedAt: text('first_published_at'),
    lastDeployedAt: text('last_deployed_at'),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),

    /** No-signup trial bookkeeping. */
    isTrial: integer('is_trial', { mode: 'boolean' }).default(false).notNull(),
    trialUntil: text('trial_until'),
    trialClaimedBy: text('trial_claimed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    trialIpHash: text('trial_ip_hash'),

    /**
     * App Kinds vocabulary (docs/app-kinds.md). Denormalized from the
     * latest deploy's kind profile so marketplace queries can filter
     * without a JSON join. The full profile lives in
     * deploys.kind_profile_json + KV apps:{slug}:kind-profile.
     */
    currentDetectedKind: text('current_detected_kind'),
    currentPublicKindStatus: text('current_public_kind_status'),
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

export const appPermissions = sqliteTable('app_permissions', {
  appId: text('app_id')
    .primaryKey()
    .references(() => apps.id, { onDelete: 'cascade' }),
  auth: integer('auth', { mode: 'boolean' }).default(false).notNull(),
  storage: text('storage').default('none').notNull(), // 'none' | 'r' | 'rw'
  files: integer('files', { mode: 'boolean' }).default(false).notNull(),
  notifications: integer('notifications', { mode: 'boolean' }).default(false).notNull(),
  analytics: integer('analytics', { mode: 'boolean' }).default(true).notNull(),
  externalNetwork: integer('external_network', { mode: 'boolean' }).default(false).notNull(),
  allowedConnectDomains: text('allowed_connect_domains', { mode: 'json' })
    .$type<string[]>()
    .default(sql`('[]')`)
    .notNull(),
  nativeBridgeFeatures: text('native_bridge_features', { mode: 'json' })
    .$type<string[]>()
    .default(sql`('[]')`)
    .notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
});

export type AppPermissions = typeof appPermissions.$inferSelect;
