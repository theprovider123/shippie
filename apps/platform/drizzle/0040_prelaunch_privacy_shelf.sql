-- Pre-launch privacy shelf:
-- - add Sleep as the single net-new personal-health gap,
-- - promote quiet/habit back into the evergreen launcher pool,
-- - move event-window or weaker demos to Labs without deleting them.

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
  surface
)
SELECT
  lower(hex(randomblob(16))),
  'sleep',
  'Sleep',
  'Private sleep log that feeds Chiwit.',
  'Private sleep log and seven-night trend that feeds Chiwit.',
  'app',
  'health-fitness',
  '#6F73D2',
  '#16120F',
  'zip',
  'static',
  users.id,
  'public',
  0,
  'featured'
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
UPDATE apps
SET
  name = 'Sleep',
  tagline = 'Private sleep log that feeds Chiwit.',
  description = 'Private sleep log and seven-night trend that feeds Chiwit.',
  category = 'health-fitness',
  theme_color = '#6F73D2',
  background_color = '#16120F',
  surface = 'featured',
  is_archived = 0,
  latest_deploy_status = 'success'
WHERE slug = 'sleep';
--> statement-breakpoint
UPDATE apps
SET surface = 'featured', is_archived = 0
WHERE slug IN ('quiet', 'habit-tracker', 'journal');
--> statement-breakpoint
UPDATE apps
SET surface = 'labs'
WHERE slug IN (
  'snap-and-forget',
  'tap-counter',
  'restaurant-memory',
  'match-room',
  'crewtrip',
  'parade-companion',
  'mevrouw'
);
