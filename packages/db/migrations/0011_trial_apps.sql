-- 0011_trial_apps.sql
--
-- No-signup trial deploys.
--
-- Visitors can drop a zip on the landing page and get a live
-- trial-{random}.shippie.app URL for 24 hours without signing up.
-- After TTL expires, the reaper marks the app archived + takes the
-- R2 pointer offline.
--
-- All trial deploys share a system maker (shippie-internal user) so
-- existing FKs + triggers stay simple.
--
-- Differentiation plan Pillar B2.

alter table apps
  add column if not exists is_trial boolean not null default false,
  add column if not exists trial_until timestamptz,
  add column if not exists trial_claimed_by uuid references users(id) on delete set null,
  add column if not exists trial_ip_hash text;

-- Reaper index — lookups by (is_trial, trial_until) on every cron pass.
create index if not exists apps_trial_ttl_idx
  on apps (trial_until)
  where is_trial = true;

-- IP-scoped rate limiting lookup
create index if not exists apps_trial_ip_hash_idx
  on apps (trial_ip_hash, created_at)
  where is_trial = true;

-- Seed a system maker for trial deploys. Idempotent: email is the
-- natural key. The UUID is stable so runtime code doesn't have to
-- query for it on every request.
insert into users (id, email, name, username, verified_maker)
values (
  '00000000-0000-0000-0000-000000000001',
  'trial@shippie.internal',
  'Shippie Trial',
  '__trial',
  false
)
on conflict (email) do nothing;
