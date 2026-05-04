-- Phase 4 calculators — seed coffee + cooking + dough as first-party
-- showcases owned by devanteprov@gmail.com.
--
-- INSERT OR IGNORE on slug; rows are created idempotently. Each gets
-- visibility_scope='public' and latest_deploy_status='success' so the
-- maker dashboard doesn't surface them as Draft (they're statically
-- baked, not deploy-pipeline-published).

INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'coffee', 'Coffee', 'Ratio dial · grind library · brew timer.', 'Ratio dial (beans ↔ water ↔ ratio), saved bean presets with grind settings, brew timer per method (V60, AeroPress, Chemex, French Press, Espresso). Provides coffee-brewed (consumed by sleep-logger, daily-briefing) and caffeine-logged.', 'app', 'food-drink', '#8B5A3C', '#14120F', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
UPDATE apps SET latest_deploy_status = 'success' WHERE slug = 'coffee';
--> statement-breakpoint

INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'cooking', 'Cooking', 'Method × cut × doneness — internal temps, timing, rest.', 'Sous vide / smoking / roasting / grilling / pan. 16 cuts spanning beef, pork, poultry, fish, lamb. Doneness picker shows internal temps; minutes-per-kilo timing for roasts and smokes; per-side timing for grills and pans. Provides cooking-now (live kitchen status) + cooked-meal (consumed by Habit Tracker, Restaurant Memory, Journal).', 'app', 'food-drink', '#E8603C', '#14120F', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
UPDATE apps SET latest_deploy_status = 'success' WHERE slug = 'cooking';
--> statement-breakpoint

INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'dough', 'Dough', 'Baker''s percentages + working-backwards schedule.', 'Pizza Neapolitan, NY-style, sourdough boule, poolish baguette, focaccia, rye, brioche. Yield (balls × g each) drives gram-precise flour/water/salt/leaven outputs. Schedule generator anchors to your "ready by" time and walks each step backwards. Provides dough-ferment-started + dough-ready (push fires when timer hits zero).', 'app', 'food-drink', '#E8C547', '#14120F', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
UPDATE apps SET latest_deploy_status = 'success' WHERE slug = 'dough';
