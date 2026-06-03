-- Seed first-party showcase apps that are present in the generated catalog
-- but were missing DB rows, so the admin profile can manage every showcase.

WITH owner AS (
  SELECT id
  FROM users
  WHERE email = 'devanteprov@gmail.com'
  LIMIT 1
),
rows(slug, name, tagline, description, category, theme_color, background_color, visibility_scope, surface) AS (
  VALUES
    ('care-log', 'Care Log', 'Track meds and symptoms for someone you care for.', 'Track meds and symptoms for someone you care for. Optional co-caregiver mesh. Records stay on the paired devices.', 'health-fitness', '#74A57F', '#F5EFE4', 'private', 'labs'),
    ('colour-of-day', 'Colour of the Day', 'Mood as art, one colour at a time.', 'One tap on a colour wheel for today. Mood as art. Builds a ribbon of colours over time.', 'health-fitness', '#7FB269', '#F8F1E0', 'public', 'archived'),
    ('move', 'Move', 'Pace, workout, and sleep correlations.', 'Pace, workout, and sleep correlations in one local log.', 'health-fitness', '#5EA777', '#FAF7EF', 'public', 'archived'),
    ('photo-a-day', 'Photo a Day', 'A tiny visual diary.', 'One photo per day. Three seconds. AI labels what you saw. Builds a visual diary.', 'creative', '#F0734A', '#F8F1E0', 'public', 'archived'),
    ('quiet', 'Quiet', 'Breath, focus, and mood in one local ritual surface.', 'Breath, focus, and mood in one local ritual surface.', 'health-fitness', '#5E7B5C', '#14120F', 'public', 'featured')
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
  rows.slug,
  rows.name,
  rows.tagline,
  rows.description,
  'app',
  rows.category,
  rows.theme_color,
  rows.background_color,
  'zip',
  'static',
  owner.id,
  rows.visibility_scope,
  rows.surface,
  0,
  'success'
FROM rows
CROSS JOIN owner;
--> statement-breakpoint
UPDATE apps
SET
  maker_id = COALESCE((SELECT id FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1), maker_id),
  is_archived = 0,
  latest_deploy_status = COALESCE(latest_deploy_status, 'success'),
  updated_at = datetime('now')
WHERE slug IN ('care-log', 'colour-of-day', 'move', 'photo-a-day', 'quiet');
