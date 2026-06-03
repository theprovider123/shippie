-- Ensure the private demo set has an admin owner even in fresh local D1
-- databases that only have the synthetic trial/shell users.

INSERT OR IGNORE INTO users (
  id,
  email,
  username,
  display_name,
  is_admin,
  verified_maker,
  email_verified
) VALUES (
  '00000000-0000-4000-8000-devante00001',
  'devante@urthly.digital',
  'devante',
  'Devante',
  true,
  true,
  datetime('now')
);
--> statement-breakpoint
UPDATE users
SET
  is_admin = true,
  verified_maker = true,
  email_verified = COALESCE(email_verified, datetime('now')),
  updated_at = datetime('now')
WHERE email = 'devante@urthly.digital';
--> statement-breakpoint
WITH owner AS (
  SELECT id
  FROM users
  WHERE email = 'devante@urthly.digital'
  LIMIT 1
),
demo_rows(slug, name, tagline, description, category, theme_color, background_color) AS (
  VALUES
    ('market-demo', 'Highbury Market Guide', 'Real food. Local people. Every Sunday.', 'A weekly community market guide for stalls, events, visitor info, and digital loyalty stamps.', 'food-drink', '#E8603C', '#F7F3EE'),
    ('race-demo', 'Hackney Half Marathon 2026', 'Offline GPS race guide for runners and event teams.', 'Race guide. GPS works offline. No signal needed.', 'health-fitness', '#00D4AA', '#0A0A0A'),
    ('restaurant-demo', 'Locanda Soho - Menu', 'Digital menu. No download. Works offline.', 'Digital menu. No download. Works offline.', 'food-drink', '#8B1A1A', '#FEFCF8'),
    ('wedding-demo', 'Charlotte & James', 'Private wedding day guide for guests.', 'A private wedding day guide for Charlotte and James: timeline, table search, menus, memories, travel information, contacts, and song requests. No login, offline-first, and link-only.', 'lifestyle', '#C4956A', '#FAF7F2'),
    ('corporate-demo', 'Apex Leadership Conference 2026', 'Private corporate event guide for senior leaders.', 'Conference guide. No login. Works offline.', 'tools', '#E8603C', '#0F0F0F')
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
  demo_rows.slug,
  demo_rows.name,
  demo_rows.tagline,
  demo_rows.description,
  'app',
  demo_rows.category,
  demo_rows.theme_color,
  demo_rows.background_color,
  'zip',
  'static',
  owner.id,
  'private',
  'archived',
  0,
  'success'
FROM demo_rows
CROSS JOIN owner;
--> statement-breakpoint
UPDATE apps
SET
  name = CASE slug
    WHEN 'market-demo' THEN 'Highbury Market Guide'
    WHEN 'race-demo' THEN 'Hackney Half Marathon 2026'
    WHEN 'restaurant-demo' THEN 'Locanda Soho - Menu'
    WHEN 'wedding-demo' THEN 'Charlotte & James'
    WHEN 'corporate-demo' THEN 'Apex Leadership Conference 2026'
    ELSE name
  END,
  tagline = CASE slug
    WHEN 'market-demo' THEN 'Real food. Local people. Every Sunday.'
    WHEN 'race-demo' THEN 'Offline GPS race guide for runners and event teams.'
    WHEN 'restaurant-demo' THEN 'Digital menu. No download. Works offline.'
    WHEN 'wedding-demo' THEN 'Private wedding day guide for guests.'
    WHEN 'corporate-demo' THEN 'Private corporate event guide for senior leaders.'
    ELSE tagline
  END,
  description = CASE slug
    WHEN 'market-demo' THEN 'A weekly community market guide for stalls, events, visitor info, and digital loyalty stamps.'
    WHEN 'race-demo' THEN 'Race guide. GPS works offline. No signal needed.'
    WHEN 'restaurant-demo' THEN 'Digital menu. No download. Works offline.'
    WHEN 'wedding-demo' THEN 'A private wedding day guide for Charlotte and James: timeline, table search, menus, memories, travel information, contacts, and song requests. No login, offline-first, and link-only.'
    WHEN 'corporate-demo' THEN 'Conference guide. No login. Works offline.'
    ELSE description
  END,
  category = CASE slug
    WHEN 'market-demo' THEN 'food-drink'
    WHEN 'race-demo' THEN 'health-fitness'
    WHEN 'restaurant-demo' THEN 'food-drink'
    WHEN 'wedding-demo' THEN 'lifestyle'
    WHEN 'corporate-demo' THEN 'tools'
    ELSE category
  END,
  theme_color = CASE slug
    WHEN 'market-demo' THEN '#E8603C'
    WHEN 'race-demo' THEN '#00D4AA'
    WHEN 'restaurant-demo' THEN '#8B1A1A'
    WHEN 'wedding-demo' THEN '#C4956A'
    WHEN 'corporate-demo' THEN '#E8603C'
    ELSE theme_color
  END,
  background_color = CASE slug
    WHEN 'market-demo' THEN '#F7F3EE'
    WHEN 'race-demo' THEN '#0A0A0A'
    WHEN 'restaurant-demo' THEN '#FEFCF8'
    WHEN 'wedding-demo' THEN '#FAF7F2'
    WHEN 'corporate-demo' THEN '#0F0F0F'
    ELSE background_color
  END,
  maker_id = COALESCE((SELECT id FROM users WHERE email = 'devante@urthly.digital' LIMIT 1), maker_id),
  visibility_scope = 'private',
  surface = 'archived',
  is_archived = 0,
  latest_deploy_status = 'success',
  updated_at = datetime('now')
WHERE slug IN ('market-demo', 'race-demo', 'restaurant-demo', 'wedding-demo', 'corporate-demo');
