-- Seed the synthetic "Shippie Shell" user + app row.
--
-- Why: the platform shell wants to send client-side analytics events
-- (install nudge, standalone launch, SW update accept/skip, viewport
-- mode, keyboard signals) to /__shippie/analytics, but that endpoint
-- requires an apps row to FK against (analytics_events.app_id is
-- non-null FK → apps.id, and apps.maker_id is non-null FK → users.id).
--
-- Mirrors the trial-maker pattern in 0005_trial_maker_seed.sql:
-- one synthetic user row + one synthetic app row, both inert.
-- INSERT OR IGNORE makes this safe to re-run.
--
-- The synthetic user has no credentials/sessions and never logs in.
-- The synthetic app is visibility_scope='unlisted' so it never
-- appears in the marketplace listings.

INSERT OR IGNORE INTO `users` (
  `id`,
  `email`,
  `username`,
  `display_name`,
  `is_admin`,
  `verified_maker`
) VALUES (
  '00000000-0000-4000-8000-shippieshell01',
  'shell+system@shippie.app',
  'shippie-shell-system',
  'Shippie Shell',
  false,
  false
);

INSERT OR IGNORE INTO `apps` (
  `id`,
  `slug`,
  `name`,
  `type`,
  `category`,
  `theme_color`,
  `background_color`,
  `github_branch`,
  `source_type`,
  `source_kind`,
  `upstream_config`,
  `conflict_policy`,
  `maker_id`,
  `visibility_scope`,
  `is_archived`,
  `upvote_count`,
  `comment_count`,
  `install_count`,
  `active_users_30d`,
  `feedback_open_count`,
  `github_verified`
) VALUES (
  'app_shippie_shell',
  '__shippie_shell__',
  'Shippie Shell',
  'app',
  'system',
  '#14120f',
  '#14120f',
  'main',
  'system',
  'static',
  '{}',
  'shippie',
  '00000000-0000-4000-8000-shippieshell01',
  'unlisted',
  false,
  0,
  0,
  0,
  0,
  0,
  false
);
