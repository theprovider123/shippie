-- Seed World Cup Fantasy as a private admin-owned showcase while it is tested.
-- The manifest curation surface is archived so first-party catalog generation
-- keeps it out of public shelves; the DB row keeps admin ownership explicit.

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
  is_archived,
  latest_deploy_status,
  surface
)
SELECT
  lower(hex(randomblob(16))),
  'world-cup-fantasy',
  'World Cup Fantasy',
  'Private 15-player World Cup squad builder.',
  'A private World Cup fantasy squad builder with captaincy, chips, budget pressure, and local-only storage while the format is tested.',
  'app',
  'games',
  '#0E5C3A',
  '#FAF7EF',
  'zip',
  'static',
  users.id,
  'private',
  0,
  'success',
  'archived'
FROM users
WHERE email = 'devanteprov@gmail.com'
LIMIT 1;
--> statement-breakpoint
UPDATE apps
SET
  name = 'World Cup Fantasy',
  tagline = 'Private 15-player World Cup squad builder.',
  description = 'A private World Cup fantasy squad builder with captaincy, chips, budget pressure, and local-only storage while the format is tested.',
  category = 'games',
  theme_color = '#0E5C3A',
  background_color = '#FAF7EF',
  visibility_scope = 'private',
  is_archived = 0,
  latest_deploy_status = 'success',
  surface = 'archived',
  updated_at = datetime('now')
WHERE slug = 'world-cup-fantasy';
