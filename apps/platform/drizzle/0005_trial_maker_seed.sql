-- Seed the synthetic "anonymous trial maker" user.
--
-- The /api/deploy/trial route (apps/platform/src/routes/api/deploy/trial/+server.ts)
-- must satisfy `apps.maker_id NOT NULL` + the FK to `users(id)`, but trial
-- deploys are anonymous by definition. Rather than make `apps.maker_id`
-- nullable (which would ripple through every dashboard/ranking query) or
-- introduce a parallel `trial_apps` table (which would fork the deploy
-- pipeline), we keep one synthetic user row and reuse it for every trial.
--
-- The id matches the TRIAL_MAKER_ID constant in the trial route. Anything
-- about this user is for plumbing only — the row never logs in (no
-- credentials/sessions), and the trial flow flips visibility_scope to
-- 'unlisted' so trial apps don't pollute the marketplace.
--
-- INSERT OR IGNORE makes this safe to re-run.
INSERT OR IGNORE INTO `users` (
  `id`,
  `email`,
  `username`,
  `display_name`,
  `is_admin`,
  `verified_maker`
) VALUES (
  '00000000-0000-4000-8000-trialmakerid01',
  'trial+anonymous@shippie.app',
  'shippie-trial-anonymous',
  'Anonymous Trial',
  false,
  false
);
