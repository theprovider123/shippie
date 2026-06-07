-- Seed Companion as a private first-party labs app. The app is a local-only
-- harm-reduction support surface, so it should not enter the public shelf by
-- default.

WITH owner AS (
  SELECT id
  FROM users
  WHERE email = 'devanteprov@gmail.com'
  LIMIT 1
)
INSERT OR IGNORE INTO apps (
  id,
  slug,
  name,
  tagline,
  description,
  type,
  category,
  theme_color,
  background_color,
  source_type,
  source_kind,
  maker_id,
  visibility_scope,
  surface,
  is_archived,
  latest_deploy_status
)
SELECT
  lower(hex(randomblob(16))),
  'companion',
  'Companion',
  'Private solo trip preparation, during-mode grounding, and integration.',
  'Private solo trip preparation, during-mode grounding, and integration. Local-first and offline during the session.',
  'app',
  'health-fitness',
  '#C9824B',
  '#100D15',
  'zip',
  'static',
  owner.id,
  'private',
  'labs',
  0,
  'success'
FROM owner;
--> statement-breakpoint
UPDATE apps
SET
  maker_id = COALESCE((SELECT id FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1), maker_id),
  visibility_scope = 'private',
  surface = 'labs',
  is_archived = 0,
  latest_deploy_status = COALESCE(latest_deploy_status, 'success'),
  updated_at = datetime('now')
WHERE slug = 'companion';
