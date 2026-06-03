-- Adds 'race-demo' as a private, link-only first-party showcase.

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
  'race-demo',
  'Hackney Half Marathon 2026',
  'Offline GPS race guide for runners and event teams.',
  'Race guide. GPS works offline. No signal needed.',
  'app',
  'health-fitness',
  '#00D4AA',
  '#0A0A0A',
  'zip',
  'static',
  users.id,
  'private',
  'archived',
  0,
  'success'
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
UPDATE apps
SET
  name = 'Hackney Half Marathon 2026',
  tagline = 'Offline GPS race guide for runners and event teams.',
  description = 'Race guide. GPS works offline. No signal needed.',
  category = 'health-fitness',
  theme_color = '#00D4AA',
  background_color = '#0A0A0A',
  visibility_scope = 'private',
  surface = 'archived',
  is_archived = 0,
  latest_deploy_status = 'success',
  updated_at = datetime('now')
WHERE slug = 'race-demo';
