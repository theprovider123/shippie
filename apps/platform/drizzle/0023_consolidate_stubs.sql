-- Phase 2 consolidation — retire 5 micro-logger stubs, ship sip-log + a
-- real Mood Pulse in their place.
--
-- Retired (is_archived = 1):
--   hydration, caffeine-log  → replaced by sip-log
--   mood-pulse                → in-place replaced (same slug, real app)
--   steps-counter, symptom-tracker → dropped without replacement
--
-- New rows:
--   sip-log (INSERT OR IGNORE)
--
-- Updated in place:
--   mood-pulse (tagline, description, theme_color, category)
--
-- Marketplace queries filter `visibility_scope = 'public' AND
-- is_archived = 0` so retired slugs disappear from /apps automatically.
-- The historical rows stay so any user receipts pointing at them still
-- resolve.

-- Archive the 4 wholly-replaced or dropped stubs.
UPDATE apps
SET is_archived = 1, updated_at = strftime('%s', 'now')
WHERE slug IN ('hydration', 'caffeine-log', 'steps-counter', 'symptom-tracker');
--> statement-breakpoint

-- Mood Pulse stays at the same slug but is a different app now.
-- Refresh tagline + description + theme so the marketplace card matches
-- what users see when they install.
UPDATE apps
SET tagline = 'Three seconds, once a day.',
    description = 'Tap how today feels (1-5 with emoji), drop an optional one-line note. 30-day sparkline shows the rhythm. Provides mood-logged so Daily Briefing + Read Later have a real signal to react to.',
    theme_color = '#E8C547',
    category = 'health-fitness',
    updated_at = strftime('%s', 'now')
WHERE slug = 'mood-pulse';
--> statement-breakpoint

-- Seed the new sip-log row.
INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'sip-log', 'Sip Log', 'Water + coffee + tea, one tap each.', 'A one-tap drinks logger. Three big buttons (water 250ml / coffee 64mg / tea 28mg), long-press for custom amounts, daily totals + 7-day chart. Provides hydration-logged + caffeine-logged so Sleep Logger and Daily Briefing have something to correlate against.', 'app', 'health-fitness', '#5EA777', '#14120F', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint

-- Mark the new row as live so the maker dashboard doesn't show it as
-- "Draft". The static-bake pipeline doesn't produce a real deploys.* row.
UPDATE apps SET latest_deploy_status = 'success' WHERE slug = 'sip-log';
