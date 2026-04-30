-- Seed Mevrouw as a PRIVATE marketplace entry owned by devanteprov@gmail.com.
-- Idempotent: INSERT OR IGNORE on slug.
INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), 'mevrouw', 'Mevrouw', 'A private space for two phones.', 'Anniversary, trips, journal, surprises, games, after-hours. Local-first; no server holds anything between you. Pair with a couple code; everything syncs over an end-to-end encrypted relay.', 'app', 'social', '#1F2A24', '#1F2A24', 'zip', 'static', users.id, 'private', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
UPDATE apps SET latest_deploy_status = 'success' WHERE slug = 'mevrouw';
