-- Account-scoped Dock: saved tools that follow a signed-in user across
-- devices. localStorage stays the instant/offline source of truth; this
-- mirrors saves so a fresh device shows "my tools" after sign-in.
-- removed_at is a tombstone (NULL = active) so removals propagate without
-- a stale device resurrecting a slug; a re-save upserts removed_at = NULL.
CREATE TABLE IF NOT EXISTS user_dock (
  user_id TEXT NOT NULL,
  app_slug TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT (datetime('now')),
  removed_at TEXT,
  PRIMARY KEY (user_id, app_slug)
);
CREATE INDEX IF NOT EXISTS user_dock_user ON user_dock (user_id);
