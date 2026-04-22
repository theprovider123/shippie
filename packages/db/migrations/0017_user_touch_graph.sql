-- user_touch_graph: per-pair counter of distinct users who touched both
-- apps in a (app_a, app_b) pair. Pairs are stored canonically with
-- app_a < app_b so we never double-count — the CHECK constraint enforces
-- it. Indexes on each side + users make co-install lookups cheap.
CREATE TABLE IF NOT EXISTS user_touch_graph (
  app_a       text NOT NULL,
  app_b       text NOT NULL,
  users       bigint NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_a, app_b),
  CHECK (app_a < app_b)
);

CREATE INDEX IF NOT EXISTS utg_app_a ON user_touch_graph (app_a, users);
CREATE INDEX IF NOT EXISTS utg_app_b ON user_touch_graph (app_b, users);
