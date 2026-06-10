-- Seed The Cannon — Arsenal Fan OS — as a public, featured first-party
-- showcase in the marketplace. Idempotent: INSERT OR IGNORE on the unique
-- slug, then an UPDATE so re-running keeps the row in sync.

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
  'cannon',
  'The Cannon',
  'Arsenal Fan OS. The terrace in your pocket.',
  'The Arsenal fan companion: the Oracle pre-match briefing, the Terrace takes feed with anonymous matchday handles, the post-match Gauge dial, the full 2026/27 fixture list with head-to-head drill-downs, and the Club — squad, title-winning season stats, and the trophy timeline. Champions of England, 2025/26.',
  'app',
  'sports',
  '#EF0107',
  '#F8F4EE',
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
  name = 'The Cannon',
  tagline = 'Arsenal Fan OS. The terrace in your pocket.',
  description = 'The Arsenal fan companion: the Oracle pre-match briefing, the Terrace takes feed with anonymous matchday handles, the post-match Gauge dial, the full 2026/27 fixture list with head-to-head drill-downs, and the Club — squad, title-winning season stats, and the trophy timeline. Champions of England, 2025/26.',
  category = 'sports',
  theme_color = '#EF0107',
  background_color = '#F8F4EE',
  visibility_scope = 'public',
  is_archived = 0,
  latest_deploy_status = 'success',
  surface = 'featured',
  updated_at = datetime('now')
WHERE slug = 'cannon';
