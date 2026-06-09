-- Migration 0059: iconEmoji column + slug redirect table
ALTER TABLE apps ADD COLUMN icon_emoji TEXT;
CREATE TABLE IF NOT EXISTS app_slug_redirects (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  old_slug TEXT NOT NULL,
  new_slug TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS app_slug_redirects_old_slug_idx ON app_slug_redirects(old_slug);
