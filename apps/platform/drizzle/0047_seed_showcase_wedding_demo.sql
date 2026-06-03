-- Seed the Wedding Guide demo as a private, direct-link showcase owned by
-- devante@urthly.digital. The archived surface keeps it out of public shelves
-- while still allowing /run/wedding-demo to resolve.

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
  0,
  'success',
  'archived'
FROM users
WHERE email = 'devante@urthly.digital'
LIMIT 1;
--> statement-breakpoint
UPDATE apps
SET
  name = 'Charlotte & James',
  tagline = 'Private wedding day guide for guests.',
  description = 'A private wedding day guide for Charlotte and James: timeline, table search, menus, memories, travel information, contacts, and song requests. No login, offline-first, and link-only.',
  category = 'lifestyle',
  theme_color = '#C4956A',
  background_color = '#FAF7F2',
  visibility_scope = 'private',
  is_archived = 0,
  latest_deploy_status = 'success',
  surface = 'archived',
  updated_at = datetime('now')
WHERE slug = 'wedding-demo';
