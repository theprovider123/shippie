-- Phase 5 — seed pace + breath as first-party showcases owned by
-- devanteprov@gmail.com.
--
-- Both ship brand-aligned, both broadcast clean intents that compound
-- with the existing suite. INSERT OR IGNORE on slug; idempotent.

INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'pace', 'Pace', 'Distance × time × pace dial — runs, walks, rides.', 'Run/walk/cycle pace calculator with editable distance + target time + pace, splits per km, finish-time estimate from your start. Save plans (Saturday long run, evening cycle). Provides run-planned (consumed by Workout Logger to compare target vs actual once you finish a session).', 'app', 'health-fitness', '#5EA777', '#14120F', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
UPDATE apps SET latest_deploy_status = 'success' WHERE slug = 'pace';
--> statement-breakpoint

INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'breath', 'Breath', 'Box / 4-7-8 / Wim Hof — visual ring, no audio.', 'Three breathing patterns with a visual ring that grows and shrinks with the count. Box (4-4-4-4, anytime), 4-7-8 (slows the heart, best at night), Wim Hof (energising). Provides mindful-session — the target the breath-on-low-mood agent strategy already points to, and a candidate auto-tick for Habit Tracker.', 'app', 'health-fitness', '#5E7B5C', '#14120F', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
UPDATE apps SET latest_deploy_status = 'success' WHERE slug = 'breath';
