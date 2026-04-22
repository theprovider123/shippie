-- App ratings: one row per (app, user). CHECK constraint enforces 1–5 stars.
CREATE TABLE IF NOT EXISTS app_ratings (
  app_id     text NOT NULL,
  user_id    text NOT NULL,
  rating     integer NOT NULL,
  review     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, user_id),
  CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS app_ratings_app_created ON app_ratings (app_id, created_at);
CREATE INDEX IF NOT EXISTS app_ratings_user_created ON app_ratings (user_id, created_at);
