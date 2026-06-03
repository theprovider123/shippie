-- Keep Docklands in the admin-owned private set while it is being tested.

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
  'docklands',
  'Docklands',
  'Build a dock maze, defend the Beacon, and survive the Tide.',
  'Build a dock maze, defend the Beacon, and see how many Tide rounds you survive.',
  'app',
  'games',
  '#0B2228',
  '#06181C',
  'zip',
  'static',
  users.id,
  'private',
  'archived',
  0,
  'success'
FROM users
WHERE email = 'devante@urthly.digital' OR email = 'devanteprov@gmail.com'
ORDER BY email = 'devante@urthly.digital' DESC
LIMIT 1;
--> statement-breakpoint
UPDATE apps
SET
  name = 'Docklands',
  tagline = 'Build a dock maze, defend the Beacon, and survive the Tide.',
  description = 'Build a dock maze, defend the Beacon, and see how many Tide rounds you survive.',
  category = 'games',
  theme_color = '#0B2228',
  background_color = '#06181C',
  maker_id = COALESCE((SELECT id FROM users WHERE email = 'devante@urthly.digital' OR email = 'devanteprov@gmail.com' ORDER BY email = 'devante@urthly.digital' DESC LIMIT 1), maker_id),
  visibility_scope = 'private',
  surface = 'archived',
  is_archived = 0,
  latest_deploy_status = 'success',
  updated_at = datetime('now')
WHERE slug = 'docklands';
