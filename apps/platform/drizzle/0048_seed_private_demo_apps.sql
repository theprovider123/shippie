-- Seed the current private demo set into the admin app list.
-- These rows stay private and use the archived surface so direct /run links
-- resolve without putting client demos on public shelves.

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
  'market-demo',
  'Highbury Market Guide',
  'Real food. Local people. Every Sunday.',
  'A weekly community market guide for stalls, events, visitor info, and digital loyalty stamps.',
  'app',
  'food-drink',
  '#E8603C',
  '#F7F3EE',
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
FROM users
WHERE email = 'devante@urthly.digital' OR email = 'devanteprov@gmail.com'
ORDER BY email = 'devante@urthly.digital' DESC
LIMIT 1;
--> statement-breakpoint
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
  'restaurant-demo',
  'Locanda Soho - Menu',
  'Digital menu. No download. Works offline.',
  'Digital menu. No download. Works offline.',
  'app',
  'food-drink',
  '#8B1A1A',
  '#FEFCF8',
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
  'wedding-demo',
  'Charlotte & James',
  'Private wedding day guide for guests.',
  'A private wedding day guide for Charlotte and James: timeline, table search, menus, memories, travel information, contacts, and song requests. No login, offline-first, and link-only.',
  'app',
  'lifestyle',
  '#C4956A',
  '#FAF7F2',
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
  'corporate-demo',
  'Apex Leadership Conference 2026',
  'Private corporate event guide for senior leaders.',
  'Conference guide. No login. Works offline.',
  'app',
  'tools',
  '#E8603C',
  '#0F0F0F',
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
  name = 'Highbury Market Guide',
  tagline = 'Real food. Local people. Every Sunday.',
  description = 'A weekly community market guide for stalls, events, visitor info, and digital loyalty stamps.',
  category = 'food-drink',
  theme_color = '#E8603C',
  background_color = '#F7F3EE',
  maker_id = COALESCE((SELECT id FROM users WHERE email = 'devante@urthly.digital' OR email = 'devanteprov@gmail.com' ORDER BY email = 'devante@urthly.digital' DESC LIMIT 1), maker_id),
  visibility_scope = 'private',
  surface = 'archived',
  is_archived = 0,
  latest_deploy_status = 'success',
  updated_at = datetime('now')
WHERE slug = 'market-demo';
--> statement-breakpoint
UPDATE apps
SET
  name = 'Hackney Half Marathon 2026',
  tagline = 'Offline GPS race guide for runners and event teams.',
  description = 'Race guide. GPS works offline. No signal needed.',
  category = 'health-fitness',
  theme_color = '#00D4AA',
  background_color = '#0A0A0A',
  maker_id = COALESCE((SELECT id FROM users WHERE email = 'devante@urthly.digital' OR email = 'devanteprov@gmail.com' ORDER BY email = 'devante@urthly.digital' DESC LIMIT 1), maker_id),
  visibility_scope = 'private',
  surface = 'archived',
  is_archived = 0,
  latest_deploy_status = 'success',
  updated_at = datetime('now')
WHERE slug = 'race-demo';
--> statement-breakpoint
UPDATE apps
SET
  name = 'Locanda Soho - Menu',
  tagline = 'Digital menu. No download. Works offline.',
  description = 'Digital menu. No download. Works offline.',
  category = 'food-drink',
  theme_color = '#8B1A1A',
  background_color = '#FEFCF8',
  maker_id = COALESCE((SELECT id FROM users WHERE email = 'devante@urthly.digital' OR email = 'devanteprov@gmail.com' ORDER BY email = 'devante@urthly.digital' DESC LIMIT 1), maker_id),
  visibility_scope = 'private',
  surface = 'archived',
  is_archived = 0,
  latest_deploy_status = 'success',
  updated_at = datetime('now')
WHERE slug = 'restaurant-demo';
--> statement-breakpoint
UPDATE apps
SET
  name = 'Charlotte & James',
  tagline = 'Private wedding day guide for guests.',
  description = 'A private wedding day guide for Charlotte and James: timeline, table search, menus, memories, travel information, contacts, and song requests. No login, offline-first, and link-only.',
  category = 'lifestyle',
  theme_color = '#C4956A',
  background_color = '#FAF7F2',
  maker_id = COALESCE((SELECT id FROM users WHERE email = 'devante@urthly.digital' OR email = 'devanteprov@gmail.com' ORDER BY email = 'devante@urthly.digital' DESC LIMIT 1), maker_id),
  visibility_scope = 'private',
  surface = 'archived',
  is_archived = 0,
  latest_deploy_status = 'success',
  updated_at = datetime('now')
WHERE slug = 'wedding-demo';
--> statement-breakpoint
UPDATE apps
SET
  name = 'Apex Leadership Conference 2026',
  tagline = 'Private corporate event guide for senior leaders.',
  description = 'Conference guide. No login. Works offline.',
  category = 'tools',
  theme_color = '#E8603C',
  background_color = '#0F0F0F',
  maker_id = COALESCE((SELECT id FROM users WHERE email = 'devante@urthly.digital' OR email = 'devanteprov@gmail.com' ORDER BY email = 'devante@urthly.digital' DESC LIMIT 1), maker_id),
  visibility_scope = 'private',
  surface = 'archived',
  is_archived = 0,
  latest_deploy_status = 'success',
  updated_at = datetime('now')
WHERE slug = 'corporate-demo';
