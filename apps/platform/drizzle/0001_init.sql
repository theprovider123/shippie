-- Phase 1 init — minimal schema for the SvelteKit shell.
-- Phase 2 generates additional migrations from the full Drizzle schema port.

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  github_id    TEXT UNIQUE,
  google_id    TEXT UNIQUE,
  email        TEXT UNIQUE NOT NULL,
  username     TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url   TEXT,
  bio          TEXT,
  is_admin     INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
