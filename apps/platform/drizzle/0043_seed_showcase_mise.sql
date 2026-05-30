-- Seed Mise — the food-literate nutrition log — as a public, featured
-- first-party showcase in the marketplace. Idempotent: INSERT OR IGNORE on the
-- unique slug, then an UPDATE so re-running keeps the row in sync.

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
  'mise',
  'Mise',
  'Log what you eat in a tap. Useful patterns, never a verdict.',
  'A fast, food-literate nutrition log. Recents, favorites, saved meals, free-text, rough portions, and copy-yesterday keep logging quick; neutral patterns (protein spread, hydration and caffeine timing, workout fueling, cycle-phase, meal regularity) make it useful. Imports cooked and planned meals from Palate. Local-first and offline; no red failure states, no shame.',
  'app',
  'health-fitness',
  '#6E4A6B',
  '#F5EFE4',
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
  name = 'Mise',
  tagline = 'Log what you eat in a tap. Useful patterns, never a verdict.',
  description = 'A fast, food-literate nutrition log. Recents, favorites, saved meals, free-text, rough portions, and copy-yesterday keep logging quick; neutral patterns (protein spread, hydration and caffeine timing, workout fueling, cycle-phase, meal regularity) make it useful. Imports cooked and planned meals from Palate. Local-first and offline; no red failure states, no shame.',
  category = 'health-fitness',
  theme_color = '#6E4A6B',
  background_color = '#F5EFE4',
  visibility_scope = 'public',
  is_archived = 0,
  latest_deploy_status = 'success',
  surface = 'featured',
  updated_at = datetime('now')
WHERE slug = 'mise';
