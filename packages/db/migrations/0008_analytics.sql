-- 0008_analytics.sql — simple per-app analytics event ingest (Week 10 follow-up)
--
-- One table, append-only, partitionable by created_at later when volume
-- demands it. Keeps enough info to power the maker dashboard and the
-- ranking engine's active_users_30d denormalization, without storing PII.

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  session_id text,
  event_name text not null,
  properties jsonb,
  url text,
  referrer text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_app_created_idx on analytics_events (app_id, created_at desc);
create index if not exists analytics_events_app_user_idx on analytics_events (app_id, user_id) where user_id is not null;
create index if not exists analytics_events_event_name_idx on analytics_events (app_id, event_name);
