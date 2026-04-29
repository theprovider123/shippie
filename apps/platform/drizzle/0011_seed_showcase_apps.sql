-- Seed the 11 first-party showcase apps as marketplace entries owned by
-- devanteprov@gmail.com. Idempotent: INSERT OR IGNORE on slug.

INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'recipe', 'Recipe Saver', 'A local-first recipe saver. Your recipes never leave your device.', 'Save recipes, read them offline, keep cooking notes on this device. Provides shopping-list and cooked-meal intents.', 'app', 'food-drink', '#E8603C', '#FAF7EF', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'journal', 'Journal', 'A private local journal that never needs an account.', 'Reflections, gratitude, daily notes — kept locally, encrypted on backup.', 'app', 'productivity', '#5EA777', '#FAF7EF', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'whiteboard', 'Whiteboard', 'A shared sketch space for nearby groups.', 'Real-time collaborative drawing over the local mesh.', 'app', 'creativity', '#4E7C9A', '#FAF7EF', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'live-room', 'Live Room', 'Quiz-night and audience-poll primitive over local mesh.', 'First-buzzer-wins quiz logic. Sub-30ms latency over WebRTC.', 'app', 'social', '#E8603C', '#FAF7EF', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'habit-tracker', 'Habit Tracker', 'Daily habits that auto-check from other apps.', 'Cross-cluster intent consumer. When Recipe Saver fires cooked-meal, the cooked-dinner habit checks itself.', 'app', 'health-fitness', '#5EA777', '#FAF7EF', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'workout-logger', 'Workout Logger', 'Strength and cardio sessions, tracked locally.', 'Logs sessions and detects your weekly cadence after 7+ entries. Provides workout-completed intent.', 'app', 'health-fitness', '#E8603C', '#FAF7EF', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'pantry-scanner', 'Pantry Scanner', 'Scan barcodes, identify items with on-device vision.', 'No upload, no account. Provides pantry-inventory intent.', 'app', 'food-drink', '#74A57F', '#FAF7EF', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'meal-planner', 'Meal Planner', 'A weekly meal planner that pulls from your pantry.', 'Consumes recipes + pantry + budget intents; provides shopping-list.', 'app', 'food-drink', '#E8603C', '#FAF7EF', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'shopping-list', 'Shopping List', 'A live shopping list synced over the local mesh.', 'Consumes shopping-list from Meal Planner; shares state with phones in the same room.', 'app', 'tools', '#4E7C9A', '#FAF7EF', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'sleep-logger', 'Sleep Logger', 'Track sleep quality and surface correlations.', 'Cross-app correlation between sleep, workouts, and caffeine. Surfaces patterns after 14 days.', 'app', 'health-fitness', '#4E7C9A', '#FAF7EF', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'body-metrics', 'Body Metrics', 'Weight + body photos. Photos never leave the device.', 'Privacy-first body tracking. Photos in IndexedDB only; vision AI runs in worker.', 'app', 'health-fitness', '#74A57F', '#FAF7EF', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
