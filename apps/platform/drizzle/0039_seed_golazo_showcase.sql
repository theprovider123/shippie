-- Seed Golazo — the 2026 World Cup bracket-prediction showcase — as a public,
-- featured, admin-owned first-party app. Static bake (no deploy pipeline), so
-- latest_deploy_status is forced to 'success'. Idempotent: INSERT OR IGNORE on
-- the unique slug, then an UPDATE so re-running keeps the row in sync.

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
  'golazo',
  'Golazo',
  'Call the World Cup. Share your bracket. Settle it with your mates.',
  'Build your 2026 World Cup bracket in minutes, get a gorgeous shareable card, and start a private pool with friends by link. No login, no servers — it runs entirely on your phone and works offline, with live match-day reactions.',
  'app',
  'games',
  '#0A0E1A',
  '#0A0E1A',
  'zip',
  'static',
  users.id,
  'public',
  0,
  'success',
  'featured'
FROM users
WHERE email = 'devanteprov@gmail.com'
LIMIT 1;
--> statement-breakpoint
UPDATE apps
SET
  name = 'Golazo',
  tagline = 'Call the World Cup. Share your bracket. Settle it with your mates.',
  description = 'Build your 2026 World Cup bracket in minutes, get a gorgeous shareable card, and start a private pool with friends by link. No login, no servers — it runs entirely on your phone and works offline, with live match-day reactions.',
  category = 'games',
  theme_color = '#0A0E1A',
  background_color = '#0A0E1A',
  visibility_scope = 'public',
  is_archived = 0,
  latest_deploy_status = 'success',
  surface = 'featured',
  updated_at = datetime('now')
WHERE slug = 'golazo';
