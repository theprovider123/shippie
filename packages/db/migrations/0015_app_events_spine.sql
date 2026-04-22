-- Unified PWA wrapper event spine + push subscriptions.

-- Partitioned parent — retention drops old partitions.
CREATE TABLE IF NOT EXISTS app_events (
  id          bigserial NOT NULL,
  app_id      text NOT NULL,
  session_id  text NOT NULL,
  user_id     text,
  event_type  text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ts          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);

CREATE INDEX IF NOT EXISTS app_events_app_ts ON app_events (app_id, ts);
CREATE INDEX IF NOT EXISTS app_events_type_ts ON app_events (event_type, ts);

-- Seed a couple of partitions so inserts don't fail at launch.
-- The rollup cron creates future partitions on demand.
CREATE TABLE IF NOT EXISTS app_events_2026_04 PARTITION OF app_events
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS app_events_2026_05 PARTITION OF app_events
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS app_events_2026_06 PARTITION OF app_events
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Daily rollup, merged upsert-style from app_events hourly.
CREATE TABLE IF NOT EXISTS usage_daily (
  app_id     text NOT NULL,
  day        timestamptz NOT NULL,
  event_type text NOT NULL,
  count      bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (app_id, day, event_type)
);
CREATE INDEX IF NOT EXISTS usage_daily_app_day ON usage_daily (app_id, day);

-- Wrapper push subscriptions, keyed by endpoint (globally unique per
-- Web Push spec). Distinct from the platform's existing
-- `push_subscriptions` table (see migration 0007) which has typed FKs
-- to apps/users for the OAuth notification flow. This table is written
-- by the wrapper worker route /__shippie/push/subscribe without an
-- authenticated Shippie user.
CREATE TABLE IF NOT EXISTS wrapper_push_subscriptions (
  endpoint    text PRIMARY KEY,
  app_id      text NOT NULL,
  user_id     text,
  keys        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wrapper_push_app ON wrapper_push_subscriptions (app_id);
