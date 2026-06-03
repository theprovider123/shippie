-- Keep first-party showcase ownership attached to the admin profile used for
-- day-to-day testing and Maker access.

INSERT OR IGNORE INTO users (
  id,
  email,
  username,
  display_name,
  is_admin,
  verified_maker,
  email_verified
) VALUES (
  '00000000-0000-4000-8000-devanteprov01',
  'devanteprov@gmail.com',
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
WHERE email = 'devanteprov@gmail.com';
--> statement-breakpoint
UPDATE apps
SET
  maker_id = COALESCE((SELECT id FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1), maker_id),
  updated_at = datetime('now')
WHERE slug IN (
  'atlas',
  'block-drop',
  'body-metrics',
  'breath',
  'bricks',
  'bulwark',
  'care-log',
  'chess',
  'chiwit',
  'co-pilot',
  'coffee',
  'colour-of-day',
  'cooking',
  'corporate-demo',
  'crewtrip',
  'crossing',
  'cycle',
  'daily-puzzle',
  'docklands',
  'dough',
  'drawing-telephone',
  'drift',
  'five-letter',
  'golazo',
  'habit-tracker',
  'hearth',
  'invaders',
  'journal',
  'ledger',
  'lift',
  'live-room',
  'lustre',
  'market-demo',
  'match-room',
  'maze',
  'meal-planner',
  'memory-grid',
  'mevrouw',
  'mise',
  'move',
  'palate',
  'pantry-scanner',
  'parade-companion',
  'photo-a-day',
  'pitch-forge',
  'quartet',
  'quiet',
  'race-demo',
  'reaction',
  'read-later',
  'receipt-snap',
  'restaurant-demo',
  'restaurant-memory',
  'shopping-list',
  'show-and-tell',
  'sip-log',
  'site-visit',
  'sleep',
  'snake',
  'snap-and-forget',
  'stack',
  'steep',
  'story-studio',
  'sudoku',
  'symptom-diary',
  'tab',
  'tap-counter',
  'therapy-notes',
  'touch',
  'voice-memo',
  'wedding-demo',
  'whiteboard',
  'world-cup-fantasy',
  'would-you-rather'
);
--> statement-breakpoint
UPDATE apps
SET
  visibility_scope = 'private',
  surface = 'archived',
  is_archived = 0,
  latest_deploy_status = COALESCE(latest_deploy_status, 'success'),
  updated_at = datetime('now')
WHERE slug IN (
  'corporate-demo',
  'docklands',
  'market-demo',
  'race-demo',
  'restaurant-demo',
  'wedding-demo'
);
